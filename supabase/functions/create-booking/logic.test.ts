import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decidirUtm, montarArgsRpc, validarEntrada } from "./logic.ts";

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
