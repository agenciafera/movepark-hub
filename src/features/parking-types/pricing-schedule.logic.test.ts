import { describe, expect, it } from "vitest";
import type { PricingSchedule } from "@/types/domain";
import {
  minScheduleDate,
  saveLabel,
  visibleSchedules,
  whyCannotSchedule,
} from "./pricing-schedule.logic";

const HOJE = new Date(2026, 10, 30, 15, 0); // 30/11/2026, 15h

describe("minScheduleDate", () => {
  it("é amanhã, atravessando a virada de mês", () => {
    expect(minScheduleDate(HOJE)).toBe("2026-12-01");
  });

  it("atravessa a virada de ano", () => {
    expect(minScheduleDate(new Date(2026, 11, 31, 23, 59))).toBe("2027-01-01");
  });
});

describe("whyCannotSchedule", () => {
  it("salvar agora não depende de data", () => {
    expect(whyCannotSchedule("now", null, HOJE)).toBeNull();
  });

  it("programar sem data é bloqueado", () => {
    expect(whyCannotSchedule("scheduled", null, HOJE)).toMatch(/Escolha o dia/);
  });

  it("hoje não serve: para hoje o parceiro salva sem agendar", () => {
    expect(whyCannotSchedule("scheduled", "2026-11-30", HOJE)).toMatch(/a partir de amanhã/);
  });

  it("amanhã serve", () => {
    expect(whyCannotSchedule("scheduled", "2026-12-01", HOJE)).toBeNull();
  });
});

describe("saveLabel", () => {
  it("diz o dia no botão quando a tabela é programada", () => {
    expect(saveLabel("scheduled", "2026-12-01")).toBe("Programar para 01/12/2026");
  });

  it("sem data ainda, o botão já avisa que é programação", () => {
    expect(saveLabel("scheduled", null)).toBe("Programar tabela");
  });

  it("agora mantém o rótulo de sempre", () => {
    expect(saveLabel("now", "2026-12-01")).toBe("Salvar precificação");
  });
});

describe("visibleSchedules", () => {
  const base = { id: "", effective_date: "" } as unknown as PricingSchedule;
  const s = (id: string, effective_date: string, status: string) =>
    ({ ...base, id, effective_date, status }) as PricingSchedule;

  it("mostra o que vai entrar e o que falhou, em ordem de data; esconde aplicado e cancelado", () => {
    const lista = [
      s("jan", "2027-01-01", "scheduled"),
      s("velho", "2026-10-01", "applied"),
      s("dez", "2026-12-01", "failed"),
      s("cancelado", "2026-12-15", "canceled"),
    ];
    expect(visibleSchedules(lista).map((x) => x.id)).toEqual(["dez", "jan"]);
  });
});
