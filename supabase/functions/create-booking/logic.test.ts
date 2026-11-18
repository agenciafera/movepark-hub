import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decidirGa, decidirUtm, MAX_CHEGADAS, montarArgsRpc, montarAtribuicao, montarChegadas, validarEntrada } from "./logic.ts";

const BASE = {
  location_parking_type_id: "lpt-1",
  check_in_at: "2027-03-10T08:00:00Z",
  check_out_at: "2027-03-15T18:00:00Z",
};

Deno.test("entrada completa passa", () => {
  assertEquals(validarEntrada(BASE).ok, true);
});

Deno.test("sem tipo de vaga, recusa com a mensagem do campo", () => {
  const v = validarEntrada({ ...BASE, location_parking_type_id: undefined });
  if (v.ok) throw new Error("deveria recusar");
  assertEquals(v.status, 400);
  assertEquals(v.erro, "location_parking_type_id é obrigatório");
});

Deno.test("faltando uma das duas datas, recusa", () => {
  for (const campo of ["check_in_at", "check_out_at"] as const) {
    const v = validarEntrada({ ...BASE, [campo]: undefined });
    assertEquals(v.ok, false, `sem ${campo} deveria recusar`);
  }
});

Deno.test("os defaults do wrapper são has_pcd false e tarifa basica", () => {
  // Quem não manda tarifa cai na mais barata, nunca na mais cara: errar para o lado
  // de cobrar a mais seria cobrar sem a pessoa ter pedido.
  const args = montarArgsRpc("u1", BASE);
  assertEquals(args.p_has_pcd, false);
  assertEquals(args.p_fare_tier, "basica");
});

Deno.test("opcionais ausentes viram null, não undefined", () => {
  // undefined some no JSON e a RPC receberia menos parâmetros do que espera.
  const args = montarArgsRpc("u1", BASE);
  assertEquals(args.p_passenger_count, null);
  assertEquals(args.p_vehicle_id, null);
  assertEquals(args.p_add_on_ids, null);
  assertEquals(args.p_coupon_code, null);
  assertEquals(args.p_origin, null);
});

Deno.test("o perfil vem da sessão, nunca do corpo", () => {
  // A assinatura mais importante deste arquivo: se o profile_id viesse do JSON,
  // qualquer pessoa reservaria no nome de outra.
  const args = montarArgsRpc("u1", { ...BASE, p_profile_id: "u2", profile_id: "u2" });
  assertEquals(args.p_profile_id, "u1");
});

Deno.test("campo extra no corpo não alcança a RPC", () => {
  const args = montarArgsRpc("u1", { ...BASE, status: "confirmed", total_amount: 0 });
  assertEquals("status" in args, false);
  assertEquals("total_amount" in args, false);
  assertEquals(Object.keys(args).length, 11);
});

Deno.test("sem UTM nenhum, o update não roda", () => {
  assertEquals(decidirUtm("bk-1", BASE).gravar, false);
});

Deno.test("sem booking_id, o update não roda", () => {
  assertEquals(decidirUtm(undefined, { ...BASE, utm_source: "google" }).gravar, false);
});

Deno.test("um UTM só já dispara o update, e os outros dois vão nulos", () => {
  const d = decidirUtm("bk-1", { ...BASE, utm_source: "google" });
  if (!d.gravar) throw new Error("deveria gravar");
  assertEquals(d.patch, { utm_source: "google", utm_medium: null, utm_campaign: null });
});

Deno.test("o patch de UTM carrega SÓ os três campos, mesmo com lixo no corpo", () => {
  // Este é o teste que justifica o arquivo. O update roda com service_role, que
  // ignora RLS: se o patch fosse o corpo inteiro, mandar status junto confirmaria
  // a reserva sem pagar, e mandar total_amount zeraria o valor.
  const d = decidirUtm("bk-1", {
    ...BASE,
    utm_campaign: "verao",
    status: "confirmed",
    total_amount: 0,
    profile_id: "outra-pessoa",
  });
  if (!d.gravar) throw new Error("deveria gravar");
  assertEquals(Object.keys(d.patch).sort(), ["utm_campaign", "utm_medium", "utm_source"]);
  assertEquals(JSON.stringify(d.patch).includes("confirmed"), false);
});

// ── prova da origem (E0.3.12) ────────────────────────────────────────────────
Deno.test("sem UTM não há prova: a reserva é do Hub", () => {
  assertEquals(montarAtribuicao(BASE), null);
  assertEquals(montarAtribuicao({ ...BASE, attribution: { clicked_at: "2026-09-10T12:00:00Z" } }), null);
});

Deno.test("a prova leva UTM, hora do clique, página de entrada e referrer", () => {
  assertEquals(
    montarAtribuicao({
      ...BASE,
      utm_source: " abbapark ",
      utm_medium: "site",
      attribution: {
        clicked_at: "2026-09-10T12:00:00Z",
        landing_url: "/p/abbapark?utm_source=abbapark",
        referrer: "https://abbapark.com.br/reservar",
      },
    }),
    {
      utm_source: "abbapark",
      utm_medium: "site",
      utm_campaign: null,
      clicked_at: "2026-09-10T12:00:00.000Z",
      landing_url: "/p/abbapark?utm_source=abbapark",
      referrer: "https://abbapark.com.br/reservar",
    },
  );
});

Deno.test("campo torto vira null em vez de derrubar a reserva ou entrar no banco", () => {
  const a = montarAtribuicao({
    ...BASE,
    utm_source: "abbapark",
    attribution: {
      clicked_at: "ontem",
      landing_url: "https://site-de-fora.com/x",
      referrer: "javascript:alert(1)",
    },
  });
  assertEquals(a?.clicked_at, null);
  assertEquals(a?.landing_url, null);
  assertEquals(a?.referrer, null);
  // caminho "//host" é URL de outro site disfarçada de caminho
  assertEquals(montarAtribuicao({ ...BASE, utm_source: "x", attribution: { landing_url: "//evil.com" } })?.landing_url, null);
  // tipo errado também
  assertEquals(montarAtribuicao({ ...BASE, utm_source: "x", attribution: { clicked_at: 123, referrer: {} } })?.clicked_at, null);
});

Deno.test("a prova carrega SÓ os seis campos, mesmo com lixo no corpo", () => {
  const a = montarAtribuicao({
    ...BASE,
    utm_source: "abbapark",
    status: "confirmed",
    commission_take_rate_bps: 0,
    attribution: { clicked_at: "2026-09-10T12:00:00Z", take_rate_bps: 0 } as never,
  });
  assertEquals(Object.keys(a ?? {}).sort(), ["clicked_at", "landing_url", "referrer", "utm_campaign", "utm_medium", "utm_source"]);
});

Deno.test("UTM gigante é cortado", () => {
  assertEquals(montarAtribuicao({ ...BASE, utm_source: "a".repeat(999) })?.utm_source?.length, 200);
});

// ── chegada de outro site, sem UTM (18/11/2026) ──────────────────────────────
Deno.test("sem UTM mas vindo de outro site: a prova leva a chegada e nada do clique", () => {
  assertEquals(
    montarAtribuicao({
      ...BASE,
      attribution: {
        clicked_at: "2026-11-17T12:00:00Z",
        referrer: "https://pareseguro.com/",
        referrals: [{ referrer: "https://pareseguro.com/", arrived_at: "2026-11-17T12:00:00Z", landing_url: "/p/gru/pare-seguro" }],
      },
    }),
    {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      clicked_at: null,
      landing_url: null,
      referrer: null,
      referrals: [{ referrer: "https://pareseguro.com/", arrived_at: "2026-11-17T12:00:00.000Z", landing_url: "/p/gru/pare-seguro" }],
    },
  );
});

Deno.test("chegada sem hora ou com endereço que não é web é descartada", () => {
  assertEquals(
    montarChegadas([
      { referrer: "https://pareseguro.com/" },
      { referrer: "javascript:alert(1)", arrived_at: "2026-11-17T12:00:00Z" },
      { referrer: "https://pareseguro.com/", arrived_at: "ontem" },
      "lixo",
      null,
    ]),
    [],
  );
  assertEquals(montarAtribuicao({ ...BASE, attribution: { referrals: [{ referrer: "https://x.com/" }] } }), null);
  assertEquals(montarChegadas({ referrer: "https://x.com/" }), []);
});

Deno.test("chegadas vão da mais nova para a mais velha, no máximo cinco, só com os três campos", () => {
  const raw = Array.from({ length: 8 }, (_, i) => ({
    referrer: `https://site${i}.com/`,
    arrived_at: `2026-11-1${i}T12:00:00Z`,
    landing_url: "//evil.com",
    take_rate_bps: 0,
  }));
  const r = montarChegadas(raw);
  assertEquals(r.length, MAX_CHEGADAS);
  assertEquals(r[0].referrer, "https://site7.com/");
  assertEquals(r[4].referrer, "https://site3.com/");
  assertEquals(r[0].landing_url, null);
  assertEquals(Object.keys(r[0]).sort(), ["arrived_at", "landing_url", "referrer"]);
});

Deno.test("com UTM e chegada, a prova leva os dois", () => {
  const a = montarAtribuicao({
    ...BASE,
    utm_source: "google",
    attribution: {
      clicked_at: "2026-11-10T12:00:00Z",
      referrer: "https://pareseguro.com/",
      referrals: [{ referrer: "https://www.google.com/", arrived_at: "2026-11-12T12:00:00Z" }],
    },
  });
  assertEquals(a?.referrer, "https://pareseguro.com/");
  assertEquals(a?.referrals?.length, 1);
});

Deno.test("decidirGa: client_id e session_id no formato do GA viram patch", () => {
  const d = decidirGa("bk-1", { ...BASE, ga: { client_id: "1234567890.1699999999", session_id: "1762300000" } });
  assertEquals(d, { gravar: true, patch: { ga_client_id: "1234567890.1699999999", ga_session_id: "1762300000" } });
});

Deno.test("decidirGa: sessão fora do formato cai, client_id fica", () => {
  const d = decidirGa("bk-1", { ...BASE, ga: { client_id: "1.2", session_id: "GS1.1.x" } });
  assertEquals(d, { gravar: true, patch: { ga_client_id: "1.2", ga_session_id: null } });
});

Deno.test("decidirGa: sem client_id válido não grava nada (nem a sessão)", () => {
  assertEquals(decidirGa("bk-1", { ...BASE, ga: { client_id: "<script>", session_id: "1" } }), { gravar: false });
  assertEquals(decidirGa("bk-1", { ...BASE, ga: null }), { gravar: false });
  assertEquals(decidirGa("bk-1", { ...BASE }), { gravar: false });
  assertEquals(decidirGa(undefined, { ...BASE, ga: { client_id: "1.2" } }), { gravar: false });
});

Deno.test("decidirGa: o patch só tem os dois campos nomeados, nunca o corpo", () => {
  const d = decidirGa("bk-1", { ...BASE, status: "confirmed", ga: { client_id: "1.2", status: "confirmed" } });
  if (!d.gravar) throw new Error("deveria gravar");
  assertEquals(Object.keys(d.patch).sort(), ["ga_client_id", "ga_session_id"]);
});
