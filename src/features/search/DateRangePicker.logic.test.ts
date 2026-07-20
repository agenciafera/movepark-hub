import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import {
  dayAriaLabel,
  disabledDays,
  fmtTime,
  isTimeSlotPast,
  mergeRange,
  nextFutureTime,
  nextRange,
  previewRange,
} from "./DateRangePicker.logic";

const hhmm = (d: Date | null) => (d ? format(d, "dd/MM HH:mm") : null);

describe("mergeRange", () => {
  it("range vazio limpa from e to", () => {
    const r = mergeRange({ from: new Date(2026, 6, 8), to: new Date(2026, 6, 10) }, undefined);
    expect(r).toEqual({ from: null, to: null });
  });

  it("só check-in: usa 08:00 default e mantém check-out vazio", () => {
    const r = mergeRange({ from: null, to: null }, { from: new Date(2026, 6, 8) });
    expect(hhmm(r.from)).toBe("08/07 08:00");
    expect(r.to).toBeNull();
  });

  it("range completo: check-out usa 18:00 default", () => {
    const r = mergeRange(
      { from: null, to: null },
      { from: new Date(2026, 6, 8), to: new Date(2026, 6, 12) },
    );
    expect(hhmm(r.from)).toBe("08/07 08:00");
    expect(hhmm(r.to)).toBe("12/07 18:00");
  });

  it("preserva os horários já escolhidos ao reselecionar as datas", () => {
    const prev = { from: new Date(2026, 6, 8, 22, 30), to: new Date(2026, 6, 12, 9, 0) };
    const r = mergeRange(prev, { from: new Date(2026, 6, 9), to: new Date(2026, 6, 14) });
    expect(hhmm(r.from)).toBe("09/07 22:30");
    expect(hhmm(r.to)).toBe("14/07 09:00");
  });

  it("hoje com horário default no passado → avança pro próximo slot futuro", () => {
    const now = new Date(2026, 6, 15, 14, 5); // 14:05 de hoje
    const r = mergeRange({ from: null, to: null }, { from: new Date(2026, 6, 15) }, now);
    // default 08:00 já passou → primeiro slot >= 14:05 é 14:30
    expect(hhmm(r.from)).toBe("15/07 14:30");
  });

  it("dia futuro não sofre ajuste (mantém o default 08:00)", () => {
    const now = new Date(2026, 6, 15, 14, 5);
    const r = mergeRange({ from: null, to: null }, { from: new Date(2026, 6, 16) }, now);
    expect(hhmm(r.from)).toBe("16/07 08:00");
  });
});

describe("isTimeSlotPast", () => {
  const now = new Date(2026, 6, 15, 14, 5);
  it("slot anterior a now no mesmo dia é passado", () => {
    expect(isTimeSlotPast(new Date(2026, 6, 15), "14:00", now)).toBe(true);
  });
  it("slot posterior a now no mesmo dia é futuro", () => {
    expect(isTimeSlotPast(new Date(2026, 6, 15), "14:30", now)).toBe(false);
  });
  it("qualquer slot de dia futuro é futuro", () => {
    expect(isTimeSlotPast(new Date(2026, 6, 16), "00:00", now)).toBe(false);
  });
});

describe("nextFutureTime", () => {
  const now = new Date(2026, 6, 15, 14, 5);
  it("hoje: pula o horário passado pro próximo slot", () => {
    expect(nextFutureTime(new Date(2026, 6, 15), "08:00", now)).toBe("14:30");
  });
  it("hoje: horário ainda futuro é mantido", () => {
    expect(nextFutureTime(new Date(2026, 6, 15), "18:00", now)).toBe("18:00");
  });
  it("dia futuro: mantém o horário desejado", () => {
    expect(nextFutureTime(new Date(2026, 6, 16), "08:00", now)).toBe("08:00");
  });
});

describe("fmtTime", () => {
  it("usa o fallback quando a data é nula", () => {
    expect(fmtTime(null)).toBe("08:00");
    expect(fmtTime(null, "18:00")).toBe("18:00");
  });
  it("formata HH:mm da data", () => {
    expect(fmtTime(new Date(2026, 6, 8, 22, 5))).toBe("22:05");
  });
});

describe("nextRange — a regra de clique do calendário", () => {
  const dia = (d: number) => new Date(2026, 6, d);

  it("sem entrada: o clique vira a entrada", () => {
    const r = nextRange({ from: null, to: null }, dia(10));
    expect(hhmm(r.from)).toBe("10/07 00:00");
    expect(r.to).toBeNull();
  });

  it("com entrada e sem saída: o clique fecha o intervalo", () => {
    const r = nextRange({ from: dia(10), to: null }, dia(14));
    expect(hhmm(r.from)).toBe("10/07 00:00");
    expect(hhmm(r.to)).toBe("14/07 00:00");
  });

  it("mesmo dia fecha o intervalo (entrar e sair no mesmo dia é reserva válida)", () => {
    const r = nextRange({ from: dia(10), to: null }, dia(10));
    expect(hhmm(r.to)).toBe("10/07 00:00");
  });

  it("intervalo completo: o clique recomeça em vez de apagar as duas pontas", () => {
    // Regressão: clicar na própria data de entrada zerava a seleção sem aviso.
    const r = nextRange({ from: dia(10), to: dia(14) }, dia(10));
    expect(hhmm(r.from)).toBe("10/07 00:00");
    expect(r.to).toBeNull();
  });

  it("dia anterior à entrada recomeça, nunca inverte as pontas", () => {
    // Regressão: o padrão da lib trocava entrada e saída de lugar em silêncio.
    const r = nextRange({ from: dia(10), to: null }, dia(7));
    expect(hhmm(r.from)).toBe("07/07 00:00");
    expect(r.to).toBeNull();
  });
});

describe("disabledDays — o clique inválido não existe", () => {
  const hoje = new Date(2026, 6, 20, 15, 0);

  it("sem entrada: só o passado fica barrado", () => {
    const d = disabledDays(null, null, hoje);
    expect(hhmm(d.before)).toBe("20/07 00:00");
  });

  it("escolhendo a saída: tudo antes da entrada sai de cena", () => {
    const d = disabledDays(new Date(2026, 6, 25, 8, 0), null, hoje);
    expect(hhmm(d.before)).toBe("25/07 00:00");
  });

  it("intervalo completo: volta a barrar só o passado (o próximo clique recomeça)", () => {
    const d = disabledDays(new Date(2026, 6, 25), new Date(2026, 6, 28), hoje);
    expect(hhmm(d.before)).toBe("20/07 00:00");
  });
});

describe("ensureAfter — saída nunca antes da entrada", () => {
  it("entrada 22:00 no mesmo dia: a saída não herda as 18:00", () => {
    const from = new Date(2026, 6, 25, 22, 0);
    const r = mergeRange({ from, to: null }, { from, to: new Date(2026, 6, 25) });
    expect(r.to!.getTime()).toBeGreaterThan(r.from!.getTime());
    expect(hhmm(r.to)).toBe("25/07 22:30");
  });

  it("dia seguinte segue usando o horário default", () => {
    const from = new Date(2026, 6, 25, 22, 0);
    const r = mergeRange({ from, to: null }, { from, to: new Date(2026, 6, 26) });
    expect(hhmm(r.to)).toBe("26/07 18:00");
  });
});

describe("dayAriaLabel — o calendário deixa de ser uma grade de números", () => {
  const dia = new Date(2026, 6, 25);

  it("diz a data por extenso e o papel de cada ponta", () => {
    expect(dayAriaLabel(dia, { range_start: true, selected: true }, "checkout")).toBe(
      "25 de julho de 2026. Entrada selecionada.",
    );
    expect(dayAriaLabel(dia, { range_end: true, selected: true }, "checkin")).toBe(
      "25 de julho de 2026. Saída selecionada.",
    );
  });

  it("diz o que o clique faz, conforme a fase", () => {
    expect(dayAriaLabel(dia, {}, "checkout")).toBe("25 de julho de 2026. Escolher como saída.");
    expect(dayAriaLabel(dia, {}, "checkin")).toBe("25 de julho de 2026. Escolher como entrada.");
  });

  it("dia barrado é anunciado como indisponível", () => {
    expect(dayAriaLabel(dia, { disabled: true }, "checkout")).toBe(
      "25 de julho de 2026. Indisponível.",
    );
  });
});

describe("dayAriaLabel — miolo do intervalo", () => {
  it("dia entre as pontas é anunciado como parte do período", () => {
    expect(
      dayAriaLabel(new Date(2026, 6, 26), { range_middle: true, selected: true }, "checkin"),
    ).toBe("26 de julho de 2026. Dentro do período.");
  });
});

describe("previewRange — prévia do intervalo no hover", () => {
  const dia = (d: number) => new Date(2026, 6, d);

  it("escolhendo a saída, pinta da entrada até o dia sob o cursor", () => {
    const p = previewRange(dia(10), null, dia(14));
    expect(hhmm(p.middle!.after)).toBe("10/07 00:00");
    expect(hhmm(p.middle!.before)).toBe("14/07 00:00");
    expect(hhmm(p.end)).toBe("14/07 00:00");
  });

  it("sem entrada não há prévia (não existe de onde pintar)", () => {
    expect(previewRange(null, null, dia(14))).toEqual({ middle: null, end: null });
  });

  it("intervalo completo não tem prévia: o próximo clique recomeça", () => {
    expect(previewRange(dia(10), dia(20), dia(14))).toEqual({ middle: null, end: null });
  });

  it("cursor sobre a própria entrada não pinta nada", () => {
    expect(previewRange(dia(10), null, dia(10))).toEqual({ middle: null, end: null });
  });

  it("cursor antes da entrada não pinta pra trás", () => {
    expect(previewRange(dia(10), null, dia(7))).toEqual({ middle: null, end: null });
  });

  it("sem cursor não há prévia", () => {
    expect(previewRange(dia(10), null, null)).toEqual({ middle: null, end: null });
  });
});
