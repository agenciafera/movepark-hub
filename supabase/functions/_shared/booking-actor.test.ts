import { assertEquals } from "jsr:@std/assert";
import { actorSeesMoney, decideActor, PAPEL_NAO_PERMITE, resolveBookingActor, SEM_PERMISSAO } from "./booking-actor.ts";

const base = { isOwner: false, isHubAdmin: false, isMember: false, hasScope: false };

Deno.test("decideActor: o dono segue os gates de cliente, mesmo sendo da equipe", () => {
  assertEquals(decideActor({ ...base, isOwner: true, isMember: true, hasScope: true }), { kind: "owner" });
});

Deno.test("decideActor: hub_admin é equipe de qualquer empresa", () => {
  assertEquals(decideActor({ ...base, isHubAdmin: true }), { kind: "staff", hubAdmin: true });
});

Deno.test("decideActor: membro com o escopo é equipe", () => {
  assertEquals(decideActor({ ...base, isMember: true, hasScope: true }), { kind: "staff", hubAdmin: false });
});

Deno.test("decideActor: membro sem o escopo (o Financeiro cancelando) é barrado", () => {
  assertEquals(decideActor({ ...base, isMember: true, hasScope: false }), {
    kind: "denied",
    status: 403,
    error: PAPEL_NAO_PERMITE,
  });
});

Deno.test("decideActor: quem não é da empresa é barrado", () => {
  assertEquals(decideActor(base), { kind: "denied", status: 403, error: SEM_PERMISSAO });
});

/** Client falso: responde por tabela e por RPC, e guarda o escopo pedido. */
function fakeClients(o: { role?: string; member?: boolean; scopes?: string[] }) {
  const pedidos: string[] = [];
  const query = (row: unknown) => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: () => Promise.resolve({ data: row }),
    };
    return q;
  };
  const admin = {
    from: (t: string) =>
      t === "profiles" ? query(o.role ? { role: o.role } : null) : query(o.member ? { company_id: "c1" } : null),
  };
  const userClient = {
    rpc: (_fn: string, args: { p_scope: string }) => {
      pedidos.push(args.p_scope);
      return Promise.resolve({ data: (o.scopes ?? []).includes(args.p_scope) });
    },
  };
  return { admin, userClient, pedidos };
}

Deno.test("resolveBookingActor: confere o escopo pedido com o JWT de quem chama", async () => {
  const c = fakeClients({ role: "company_operator", member: true, scopes: ["bookings:read", "finance:read"] });
  const actor = await resolveBookingActor({
    admin: c.admin,
    userClient: c.userClient,
    userId: "u1",
    ownerId: "dono",
    companyId: "c1",
    scope: "bookings:cancel",
  });
  assertEquals(actor.kind, "denied");
  assertEquals(c.pedidos, ["bookings:cancel"]);
});

Deno.test("resolveBookingActor: dono não consulta papel nem escopo", async () => {
  const c = fakeClients({});
  const actor = await resolveBookingActor({
    admin: c.admin,
    userClient: c.userClient,
    userId: "dono",
    ownerId: "dono",
    companyId: "c1",
    scope: "bookings:write",
  });
  assertEquals(actor, { kind: "owner" });
  assertEquals(c.pedidos, []);
});

Deno.test("actorSeesMoney: só dono, hub_admin ou finance:read", async () => {
  const balcao = fakeClients({ scopes: ["bookings:write"] });
  const financeiro = fakeClients({ scopes: ["finance:read"] });
  const staff = { kind: "staff", hubAdmin: false } as const;
  assertEquals(await actorSeesMoney({ actor: staff, userClient: balcao.userClient, companyId: "c1" }), false);
  assertEquals(await actorSeesMoney({ actor: staff, userClient: financeiro.userClient, companyId: "c1" }), true);
  assertEquals(
    await actorSeesMoney({ actor: { kind: "staff", hubAdmin: true }, userClient: balcao.userClient, companyId: "c1" }),
    true,
  );
  assertEquals(await actorSeesMoney({ actor: { kind: "owner" }, userClient: balcao.userClient, companyId: "c1" }), true);
});
