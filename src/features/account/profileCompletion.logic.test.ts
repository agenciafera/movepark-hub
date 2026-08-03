import { describe, expect, it } from "vitest";
import { accountSubline, daysUntil, profileCompletion } from "./profileCompletion.logic";

const VAZIO = {
  emailVerified: false,
  phoneVerified: false,
  hasTaxId: false,
  hasPaymentMethod: false,
  hasVehicle: false,
};
const CHEIO = {
  emailVerified: true,
  phoneVerified: true,
  hasTaxId: true,
  hasPaymentMethod: true,
  hasVehicle: true,
};

describe("profileCompletion", () => {
  it("conta as etapas feitas e a porcentagem", () => {
    const c = profileCompletion({ ...VAZIO, emailVerified: true, hasVehicle: true });
    expect(c.done).toBe(2);
    expect(c.total).toBe(5);
    expect(c.pct).toBe(40);
  });

  it("com nada feito, o arco fica zerado e a primeira etapa é a sugerida", () => {
    const c = profileCompletion(VAZIO);
    expect(c.pct).toBe(0);
    expect(c.dash).toBe("0.0 125.66");
    expect(c.next?.key).toBe("email");
  });

  it("com tudo feito, o arco fecha e não sobra etapa a sugerir", () => {
    const c = profileCompletion(CHEIO);
    expect(c.pct).toBe(100);
    expect(c.dash).toBe("125.7 125.66");
    expect(c.next).toBeNull();
  });

  /**
   * Regressão: o `dash` só faz sentido se o comprimento bater com o path do card
   * (`A 40 40`, meia volta de raio 40). Com a constante antiga, 60% já pintava o
   * arco inteiro porque o traço passava do fim do path.
   */
  it("o arco mede o semicírculo de raio 40, e o traço é proporcional", () => {
    const total = Number(profileCompletion(CHEIO).dash.split(" ")[1]);
    expect(total).toBeCloseTo(Math.PI * 40, 1);

    const c = profileCompletion({ ...CHEIO, hasTaxId: false, hasVehicle: false });
    expect(c.pct).toBe(60);
    expect(Number(c.dash.split(" ")[0])).toBeCloseTo(0.6 * Math.PI * 40, 1);
  });

  /** Um destino em etapa já feita viraria link pra lugar nenhum. */
  it("só a etapa pendente carrega destino", () => {
    const c = profileCompletion({ ...VAZIO, emailVerified: true });
    expect(c.steps.find((s) => s.key === "email")?.to).toBeNull();
    expect(c.steps.find((s) => s.key === "vehicle")?.to).toBe("/account/vehicles");
  });

  it("sugere a primeira pendente na ordem, não uma qualquer", () => {
    const c = profileCompletion({ ...CHEIO, hasTaxId: false, hasVehicle: false });
    expect(c.next?.key).toBe("taxId");
  });
});

describe("daysUntil", () => {
  const agora = new Date("2026-08-02T15:00:00Z");

  it("mesmo dia é hoje, mesmo com hora anterior à de agora", () => {
    const t = daysUntil("2026-08-02T08:00:00Z", agora);
    expect(t).toEqual({ days: 0, today: true });
  });

  it("conta em dias de calendário, não em blocos de 24 horas", () => {
    // 22h de distância, mas o check-in cai no dia seguinte: é 1 dia.
    expect(daysUntil("2026-08-03T13:00:00Z", agora)?.days).toBe(1);
  });

  it("data no passado não é próxima viagem", () => {
    expect(daysUntil("2026-08-01T10:00:00Z", agora)).toBeNull();
  });

  it("data inválida volta null em vez de NaN", () => {
    expect(daysUntil("nem data", agora)).toBeNull();
  });
});

describe("accountSubline", () => {
  const trip = { days: 3, today: false };

  it("junta a viagem com o que falta no cadastro", () => {
    const s = accountSubline(trip, profileCompletion(VAZIO));
    expect(s).toBe("Sua próxima viagem sai em 3 dias. Falta verificar o e-mail.");
  });

  it("usa o singular quando falta um dia", () => {
    const s = accountSubline({ days: 1, today: false }, profileCompletion(CHEIO));
    expect(s).toBe("Sua próxima viagem sai em 1 dia. Seu cadastro está completo.");
  });

  it("hoje não vira contagem de dias", () => {
    const s = accountSubline({ days: 0, today: true }, profileCompletion(CHEIO));
    expect(s).toBe("Sua próxima viagem é hoje. Seu cadastro está completo.");
  });

  it("sem viagem, sobra só o que falta", () => {
    const s = accountSubline(null, profileCompletion({ ...VAZIO, emailVerified: true }));
    expect(s).toBe("Falta verificar o telefone.");
  });

  /** Sem viagem e sem pendência não há frase verdadeira a dizer: melhor calar. */
  it("sem viagem e com cadastro completo, não escreve nada", () => {
    expect(accountSubline(null, profileCompletion(CHEIO))).toBeNull();
  });
});
