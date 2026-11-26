// Quem está agindo numa reserva, e se pode (26/11/2026, ADR-005).
//
// Antes, cada Edge de alteração (cancelar, trocar placa, alterar datas, proteção de voo) tratava como
// equipe qualquer pessoa com linha em `profile_company`, sem olhar o escopo: o papel Financeiro, que
// só lê reservas, cancelava com estorno chamando a Edge. Agora a equipe precisa do escopo da ação,
// conferido por `member_has_scope` com o JWT de quem chama (a função lê `auth.uid()`).
// Spec: docs/superpowers/specs/2026-11-26-acoes-do-cliente-no-operador-design.md §3.1.

export type BookingActor =
  | { kind: "owner" }
  | { kind: "staff"; hubAdmin: boolean }
  | { kind: "denied"; status: 403; error: string };

export const SEM_PERMISSAO = "Sem permissão para alterar esta reserva.";
export const PAPEL_NAO_PERMITE = "Seu papel na empresa não permite esta ação.";

/**
 * A decisão, sem rede. O dono vence: mesmo quando também é da equipe, ele segue os gates de cliente
 * (é a reserva dele). hub_admin é equipe de qualquer empresa. Da empresa, só com o escopo.
 */
export function decideActor(i: {
  isOwner: boolean;
  isHubAdmin: boolean;
  isMember: boolean;
  hasScope: boolean;
}): BookingActor {
  if (i.isOwner) return { kind: "owner" };
  if (i.isHubAdmin) return { kind: "staff", hubAdmin: true };
  if (!i.isMember) return { kind: "denied", status: 403, error: SEM_PERMISSAO };
  if (!i.hasScope) return { kind: "denied", status: 403, error: PAPEL_NAO_PERMITE };
  return { kind: "staff", hubAdmin: false };
}

/** Lê papel, vínculo e escopo e decide. `admin` é o client de serviço; `userClient`, o do JWT. */
export async function resolveBookingActor(opts: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  // deno-lint-ignore no-explicit-any
  userClient: any;
  userId: string;
  ownerId: string | null | undefined;
  companyId: string | null | undefined;
  scope: string;
}): Promise<BookingActor> {
  const isOwner = !!opts.ownerId && opts.ownerId === opts.userId;
  if (isOwner) return decideActor({ isOwner, isHubAdmin: false, isMember: false, hasScope: false });

  const { data: caller } = await opts.admin
    .from("profiles")
    .select("role")
    .eq("id", opts.userId)
    .maybeSingle();
  const isHubAdmin = caller?.role === "hub_admin";
  if (isHubAdmin || !opts.companyId) {
    return decideActor({ isOwner, isHubAdmin, isMember: false, hasScope: false });
  }

  const { data: membership } = await opts.admin
    .from("profile_company")
    .select("company_id")
    .eq("profile_id", opts.userId)
    .eq("company_id", opts.companyId)
    .maybeSingle();
  if (!membership) return decideActor({ isOwner, isHubAdmin, isMember: false, hasScope: false });

  const { data: pode } = await opts.userClient.rpc("member_has_scope", {
    p_company_id: opts.companyId,
    p_scope: opts.scope,
  });
  return decideActor({ isOwner, isHubAdmin, isMember: true, hasScope: pode === true });
}

/** Quem pode ver o dinheiro da reserva: dono, hub_admin ou quem tem `finance:read` na empresa. */
export async function actorSeesMoney(opts: {
  actor: BookingActor;
  // deno-lint-ignore no-explicit-any
  userClient: any;
  companyId: string | null | undefined;
}): Promise<boolean> {
  if (opts.actor.kind === "owner") return true;
  if (opts.actor.kind !== "staff") return false;
  if (opts.actor.hubAdmin) return true;
  if (!opts.companyId) return false;
  const { data } = await opts.userClient.rpc("member_has_scope", {
    p_company_id: opts.companyId,
    p_scope: "finance:read",
  });
  return data === true;
}
