import { describe, expect, it } from "vitest";
import { maxWithdrawReason, negativeRecipientAlert, releaseLabel, summarizeMovements, transferCycleLabel, type AccountMovement } from "./account.logic";

const base: AccountMovement = {
  kind: "sale", at: "2026-09-16T18:31:00Z", booking_code: "MP-1", gross_cents: 1440, fee_cents: 18,
  debt_recovered_cents: 0, net_cents: 1422, debt_delta_cents: 0, release_at: "2026-09-16", release_status: "released",
  origin: null, status: null, note: null,
};

describe("transferCycleLabel", () => {
  it("descreve o ciclo de transferência como o gateway o executa", () => {
    expect(transferCycleLabel({ transfer_enabled: null, transfer_interval: null, transfer_day: null })).toBe("Padrão da conta Pagar.me");
    expect(transferCycleLabel({ transfer_enabled: true, transfer_interval: "Monthly", transfer_day: 10 })).toBe("Automático, todo dia 10");
    expect(transferCycleLabel({ transfer_enabled: true, transfer_interval: "Weekly", transfer_day: 5 })).toBe("Automático, toda sexta");
    expect(transferCycleLabel({ transfer_enabled: false, transfer_interval: "Daily", transfer_day: null })).toBe("Só por saque manual");
  });
});

describe("releaseLabel", () => {
  it("saque: quando caiu, quando cai, ou sem previsão", () => {
    const fmt = (iso: string) => iso.slice(0, 10);
    expect(releaseLabel({ kind: "withdrawal", release_status: "released", release_at: "2026-09-18T13:00:00Z" }, fmt)).toBe("TED enviada em 2026-09-18");
    expect(releaseLabel({ kind: "withdrawal", release_status: "waiting", release_at: "2026-09-18T20:00:00Z" }, fmt)).toBe("cai em 2026-09-18");
    expect(releaseLabel({ kind: "withdrawal", release_status: "unknown", release_at: null }, fmt)).toBe("sem previsão");
    expect(releaseLabel({ kind: "withdrawal", release_status: null, release_at: null }, fmt)).toBe("");
  });

  const fmt = (iso: string) => iso.slice(0, 10);
  it("venda liberada, a liberar com data, ou sem previsão; outras linhas ficam em branco", () => {
    expect(releaseLabel(base, fmt)).toBe("liberado");
    expect(releaseLabel({ ...base, release_status: "waiting", release_at: "2026-10-16" }, fmt)).toBe("libera em 2026-10-16");
    expect(releaseLabel({ ...base, release_status: "unknown", release_at: null }, fmt)).toBe("sem previsão");
    expect(releaseLabel({ ...base, kind: "debt" }, fmt)).toBe("");
  });
});

describe("summarizeMovements", () => {
  it("separa entradas, saídas e o que mudou na dívida", () => {
    const r = summarizeMovements([
      base,
      { ...base, kind: "refund", net_cents: -1422, gross_cents: -1440 },
      { ...base, kind: "debt", net_cents: 0, debt_delta_cents: 2880 },
      { ...base, kind: "settlement", net_cents: 0, debt_delta_cents: -1000 },
    ]);
    expect(r).toEqual({ in_cents: 1422, out_cents: 1422, debt_delta: 1880 });
  });
});

describe("maxWithdrawReason", () => {
  const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
  const base = {
    release_days: 30,
    released_cents: 0,
    retained_cents: 0,
    debt_cents: 0,
    withdrawn_cents: 0,
    gateway_available_cents: 12849,
    recipient_status: "active",
    recipient_missing: false,
    available_cents: 0,
  };

  it("sem cálculo ainda, avisa que está calculando", () => {
    expect(maxWithdrawReason(undefined, brl)).toMatch(/Calculando/);
  });

  it("com disponível, não há motivo (botão habilitado)", () => {
    expect(maxWithdrawReason({ ...base, released_cents: 2120, available_cents: 2120 }, brl)).toBeNull();
  });

  it("recebedor inexistente ou não apto vem antes de qualquer conta", () => {
    expect(maxWithdrawReason({ ...base, recipient_missing: true }, brl)).toMatch(/não existe no gateway/);
    expect(maxWithdrawReason({ ...base, recipient_status: "affiliation" }, brl)).toMatch(/não está apto/);
  });

  it("tudo retido pelo prazo: diz o prazo e quanto está retido", () => {
    expect(maxWithdrawReason({ ...base, retained_cents: 1422 }, brl)).toBe(
      "Nada liberado ainda: cada venda libera 30 dias depois do pagamento. Retido: R$ 14,22.",
    );
  });

  it("dívida consome o liberado", () => {
    expect(maxWithdrawReason({ ...base, released_cents: 2000, debt_cents: 2880 }, brl)).toBe(
      "A dívida com a Movepark (R$ 28,80) consome o que está liberado.",
    );
  });

  it("liberado no nosso lado mas gateway zerado", () => {
    expect(maxWithdrawReason({ ...base, released_cents: 2000, gateway_available_cents: 0 }, brl)).toMatch(/gateway está zerado/);
  });

  it("nada em lugar nenhum", () => {
    expect(maxWithdrawReason(base, brl)).toBe("Nada disponível para saque.");
  });
});

describe("negativeRecipientAlert", () => {
  const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

  it("silencioso sem leitura ou com saldo zero/positivo", () => {
    expect(negativeRecipientAlert(null, "manager", brl)).toBeNull();
    expect(negativeRecipientAlert(undefined, "partner", brl)).toBeNull();
    expect(negativeRecipientAlert(0, "manager", brl)).toBeNull();
    expect(negativeRecipientAlert(1422, "partner", brl)).toBeNull();
  });

  it("manager vê o buraco e o efeito no master; parceiro vê o que muda para ele", () => {
    expect(negativeRecipientAlert(-1422, "manager", brl)).toBe(
      "Recebedor negativo em R$ 14,22 na Pagar.me. Esse valor está saindo do saldo do master até as próximas vendas desta empresa cobrirem; enquanto isso nada libera para saque aqui.",
    );
    expect(negativeRecipientAlert(-1422, "partner", brl)).toBe(
      "Sua conta no gateway está negativa em R$ 14,22. As próximas vendas cobrem esse valor primeiro; até lá não há saque.",
    );
  });
});
