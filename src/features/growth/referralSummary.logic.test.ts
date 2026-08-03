import { describe, expect, it } from "vitest";
import { inviteRows, referralEarnings, referralFunnel } from "./referralSummary.logic";
import type { ReferralInfo } from "./api";

type Referral = ReferralInfo["referrals"][number];

function ref(over: Partial<Referral> & { id: string }): Referral {
  return {
    status: "pending",
    referred_email: null,
    reward_amount: 25,
    created_at: "2026-07-14T10:00:00Z",
    qualified_at: null,
    ...over,
  } as Referral;
}

describe("referralEarnings", () => {
  /** Só o que já virou dinheiro conta: prometer o que não foi pago é o pior erro aqui. */
  it("soma apenas as indicações recompensadas", () => {
    const r = referralEarnings([
      ref({ id: "1", status: "rewarded", reward_amount: 25 }),
      ref({ id: "2", status: "qualified", reward_amount: 25 }),
      ref({ id: "3", status: "pending", reward_amount: 25 }),
    ]);
    expect(r).toEqual({ total: 25, count: 1 });
  });

  it("respeita o valor de cada indicação, que pode ter mudado no programa", () => {
    const r = referralEarnings([
      ref({ id: "1", status: "rewarded", reward_amount: 25 }),
      ref({ id: "2", status: "rewarded", reward_amount: 40 }),
    ]);
    expect(r).toEqual({ total: 65, count: 2 });
  });

  it("sem indicação, fica zerado em vez de NaN", () => {
    expect(referralEarnings([])).toEqual({ total: 0, count: 0 });
  });
});

describe("referralFunnel", () => {
  it("conta cada etapa e reparte a barra entre elas", () => {
    const f = referralFunnel([
      ref({ id: "1", status: "rewarded" }),
      ref({ id: "2", status: "pending" }),
      ref({ id: "3", status: "pending" }),
      ref({ id: "4", status: "qualified" }),
    ]);
    expect(f.map((s) => [s.key, s.count])).toEqual([
      ["rewarded", 1],
      ["qualified", 1],
      ["pending", 2],
    ]);
    expect(f.find((s) => s.key === "pending")?.share).toBe(50);
  });

  /** Etapa fixa: sumir com ela esconderia o funil de quem está começando. */
  it("sem indicação, as três etapas continuam, zeradas e sem barra", () => {
    const f = referralFunnel([]);
    expect(f).toHaveLength(3);
    expect(f.every((s) => s.count === 0 && s.share === 0)).toBe(true);
  });

  /** `expired` e `void` existem no banco mas não são etapa do funil. */
  it("indicação expirada não entra em nenhuma etapa", () => {
    const f = referralFunnel([ref({ id: "1", status: "expired" })]);
    expect(f.every((s) => s.count === 0)).toBe(true);
  });
});

describe("inviteRows", () => {
  it("mostra quem foi convidado e em que pé está", () => {
    const [linha] = inviteRows([
      ref({ id: "1", status: "rewarded", referred_email: "rafael@exemplo.com" }),
    ]);
    expect(linha).toMatchObject({
      name: "rafael@exemplo.com",
      initials: "RA",
      status: "crédito pago",
      paid: true,
    });
  });

  /** Sem cadastro não há nome: duas letras inventadas parecem um nome que ninguém deu. */
  it("convite sem e-mail fica anônimo, sem iniciais falsas", () => {
    const [linha] = inviteRows([ref({ id: "1", referred_email: null })]);
    expect(linha.name).toBe("Convite sem cadastro");
    expect(linha.initials).toBe("—");
  });

  it("traduz cada status do banco", () => {
    const linhas = inviteRows([
      ref({ id: "1", status: "pending" }),
      ref({ id: "2", status: "qualified" }),
      ref({ id: "3", status: "expired" }),
    ]);
    expect(linhas.map((l) => l.status)).toEqual([
      "aguardando 1ª reserva",
      "reserva concluída",
      "expirada",
    ]);
    expect(linhas.every((l) => !l.paid)).toBe(true);
  });
});
