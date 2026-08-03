/**
 * Lógica pura do resumo de indicações (design "Minha Conta Cliente", blocos
 * "Ganhos" e "Convites"). Tudo é derivado da lista que a RPC já devolve.
 */

import type { ReferralInfo } from "./api";

type Referral = ReferralInfo["referrals"][number];

/** Quanto o cliente já recebeu de fato: só indicação recompensada virou dinheiro. */
export function referralEarnings(referrals: Referral[]): { total: number; count: number } {
  const pagas = referrals.filter((r) => r.status === "rewarded");
  return {
    total: pagas.reduce((sum, r) => sum + r.reward_amount, 0),
    count: pagas.length,
  };
}

export type FunnelStep = {
  key: "rewarded" | "qualified" | "pending";
  label: string;
  count: number;
  /** Fração da barra, 0 a 100. */
  share: number;
};

/**
 * O funil da indicação, do fim pro começo. As três etapas são as do banco
 * (`referral.status`).
 *
 * O design tem uma quarta linha, "Só clicaram no link", que não existe no modelo:
 * a indicação só nasce quando o amigo se cadastra com o código, então não há como
 * contar clique sem inventar número.
 */
export function referralFunnel(referrals: Referral[]): FunnelStep[] {
  const conta = (s: string) => referrals.filter((r) => r.status === s).length;
  const passos: Omit<FunnelStep, "share">[] = [
    { key: "rewarded", label: "Recompensadas", count: conta("rewarded") },
    { key: "qualified", label: "Reserva concluída", count: conta("qualified") },
    { key: "pending", label: "Aguardando 1ª reserva", count: conta("pending") },
  ];
  const total = passos.reduce((sum, p) => sum + p.count, 0);
  return passos.map((p) => ({ ...p, share: total === 0 ? 0 : (p.count / total) * 100 }));
}

export type InviteRow = {
  id: string;
  /** Quem foi indicado. O e-mail é o que o banco guarda; sem ele, fica anônimo. */
  name: string;
  initials: string;
  status: string;
  /** `true` quando a indicação já virou crédito, pra pintar o selo. */
  paid: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "aguardando 1ª reserva",
  qualified: "reserva concluída",
  rewarded: "crédito pago",
  expired: "expirada",
  void: "cancelada",
};

/** Uma linha por convite, pronta pra lista. Mais recente primeiro. */
export function inviteRows(referrals: Referral[]): InviteRow[] {
  return referrals.map((r) => {
    const email = r.referred_email?.trim() || "";
    const nome = email || "Convite sem cadastro";
    return {
      id: r.id,
      name: nome,
      // Do e-mail dá pra tirar uma inicial; sem e-mail, um traço, porque duas
      // letras inventadas parecem um nome que ninguém deu.
      initials: email ? email.slice(0, 2).toUpperCase() : "—",
      status: STATUS_LABEL[r.status] ?? r.status,
      paid: r.status === "rewarded",
    };
  });
}
