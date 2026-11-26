import { describe, expect, it } from "vitest";
import type { ChangePaidDatesQuote } from "./customerApi";
import {
  cloudparkExtensionWarning,
  datesLanded,
  pixMessage,
  staffQuoteSummary,
  staffQuoteText,
  tierLanded,
  upgradeTargets,
} from "./staffChange.logic";

const base: ChangePaidDatesQuote = {
  mode: "quote",
  available: true,
  reason: null,
  days: 9,
  days_before: 8,
  price_source: "compra",
  current_total: null,
  new_total: null,
  delta: 18.9,
  delta_cents: 1890,
  effect: "charge",
  card_allowed: false,
  fare_upgrade: null,
  fare_upgrade_first: false,
  charge_amount: 18.9,
};
const upgrade = { tier: "flex" as const, cents: 1290, amount: 12.9 };
/** O formatador de moeda usa espaço fino (nbsp) depois do R$. */
const sp = (t: string) => t.replace(/\u00a0/g, " ");

describe("staffQuoteSummary", () => {
  it("Básica com diária a mais: um PIX com a diferença e o upgrade", () => {
    const s = staffQuoteSummary({ ...base, fare_upgrade: upgrade, charge_amount: 31.8 });
    expect(s).toEqual({ kind: "charge", days: 9, charge: 31.8, delta: 18.9, upgrade: 12.9 });
    expect(sp(staffQuoteText(s).titulo)).toBe("O cliente paga R$ 31,80 no PIX");
    expect(sp(staffQuoteText(s).detalhe)).toContain("R$ 12,90 do upgrade para o Flex");
  });

  it("Flex com diária a mais: só a diferença", () => {
    expect(staffQuoteSummary(base)).toEqual({ kind: "charge", days: 9, charge: 18.9, delta: 18.9, upgrade: null });
  });

  it("Básica encurtando: o upgrade vem antes e a devolução depois", () => {
    const s = staffQuoteSummary({ ...base, delta: -18.9, delta_cents: -1890, fare_upgrade: upgrade, fare_upgrade_first: true });
    expect(s).toEqual({ kind: "upgrade_first", days: 9, upgrade: 12.9, delta: -18.9 });
    expect(sp(staffQuoteText(s).detalhe)).toContain("recebe R$ 18,90 de volta");
  });

  it("mais barato sem upgrade: devolve na hora", () => {
    const s = staffQuoteSummary({ ...base, delta: -37.8, delta_cents: -3780, effect: "refund" });
    expect(s).toEqual({ kind: "refund", days: 9, refund: 37.8 });
  });

  it("mesmo valor: troca na hora", () => {
    expect(staffQuoteSummary({ ...base, delta: 0, delta_cents: 0, effect: "none" })).toEqual({ kind: "same", days: 9 });
  });

  it("período que a unidade não vende traz o motivo do servidor", () => {
    const s = staffQuoteSummary({ ...base, available: false, delta: null, reason: "Sem vaga para 12/12." });
    expect(s).toEqual({ kind: "unavailable", reason: "Sem vaga para 12/12." });
  });
});

describe("quando o PIX entrou", () => {
  it("as datas da reserva viram as pedidas (o mesmo instante em outro formato também conta)", () => {
    const alvo = { checkInAt: "2026-12-10T10:00:00.000Z", checkOutAt: "2026-12-19T10:00:00.000Z" };
    expect(datesLanded({ check_in_at: "2026-12-10T10:00:00+00:00", check_out_at: "2026-12-19T10:00:00+00:00" }, alvo)).toBe(true);
    expect(datesLanded({ check_in_at: "2026-12-10T10:00:00+00:00", check_out_at: "2026-12-18T10:00:00+00:00" }, alvo)).toBe(false);
  });

  it("o plano chegou ao alvo", () => {
    expect(tierLanded("flex", "flex")).toBe(true);
    expect(tierLanded("superflex", "flex")).toBe(true);
    expect(tierLanded("basica", "flex")).toBe(false);
  });
});

describe("upgradeTargets", () => {
  it("só os planos acima do atual", () => {
    expect(upgradeTargets("basica")).toEqual(["flex", "superflex"]);
    expect(upgradeTargets("flex")).toEqual(["superflex"]);
    expect(upgradeTargets("superflex")).toEqual([]);
  });
});

describe("pixMessage", () => {
  it("diz o valor, o motivo e a reserva", () => {
    expect(sp(pixMessage({ code: "MP-1", amount: 31.8, what: "datas" }))).toBe(
      "Olá! Segue o PIX de R$ 31,80 para a alteração de datas da reserva MP-1 na Movepark. É só copiar o código abaixo no app do seu banco.",
    );
  });
});

describe("cloudparkExtensionWarning", () => {
  it("diz até quando a cancela libera a placa e pede para validar sem cobrar", () => {
    expect(cloudparkExtensionWarning(60)).toBe(
      "A extensão não chega à cancela da Cloudpark, que libera esta placa só até 1 hora depois da saída reservada. Depois disso, valide a saída no sistema da Cloudpark sem cobrar: o cliente já pagou pelo Hub.",
    );
  });

  it("escreve a folga em horas ou minutos, e 1 hora quando não vem", () => {
    expect(cloudparkExtensionWarning(120)).toContain("até 2 horas depois");
    expect(cloudparkExtensionWarning(90)).toContain("até 90 minutos depois");
    expect(cloudparkExtensionWarning(null)).toContain("até 1 hora depois");
    expect(cloudparkExtensionWarning(0)).toContain("só até a saída reservada.");
  });
});
