import { assertEquals } from "jsr:@std/assert";
import { type FareRow, presentFares } from "./fares.ts";

// O catálogo como está no banco em 02/10/2026 (tabela `fare`).
const CATALOGO: FareRow[] = [
  { tier: "superflex", label: "Superflex", price_cents: 2490, is_popular: false, sort_order: 2, cancel_window_minutes: 1,
    benefits: { date_change: true, plate_change: true, guaranteed_spot: true, priority_support: false, free_cancellation: true, notifications_sms: true, email_confirmation: true, flight_delay_protection: true } },
  { tier: "basica", label: "Básica", price_cents: 0, is_popular: false, sort_order: 0, cancel_window_minutes: 1440,
    benefits: { date_change: false, plate_change: false, guaranteed_spot: true, priority_support: false, free_cancellation: true, notifications_sms: false, email_confirmation: true, flight_delay_protection: false } },
  { tier: "flex", label: "Flex", price_cents: 1290, is_popular: true, sort_order: 1, cancel_window_minutes: 1440,
    benefits: { date_change: true, plate_change: true, guaranteed_spot: true, priority_support: false, free_cancellation: true, notifications_sms: true, email_confirmation: true, flight_delay_protection: false } },
];

Deno.test("presentFares: ordem do site, preço em reais e cancelamento em texto", () => {
  const { fares } = presentFares(CATALOGO);
  assertEquals(fares.map((f) => f.tier), ["basica", "flex", "superflex"]);
  assertEquals(fares.map((f) => f.price), [0, 12.9, 24.9]);
  assertEquals(fares[1].is_popular, true);
  assertEquals(fares.map((f) => f.cancellation), [
    "Cancelamento grátis até 24h antes",
    "Cancelamento grátis até 24h antes",
    "Cancelamento grátis até 1 min antes",
  ]);
});

Deno.test("presentFares: incluídos e não incluídos com o rótulo do site", () => {
  const { fares } = presentFares(CATALOGO);
  assertEquals(fares[0].included, ["Vaga garantida", "Confirmação por e-mail"]);
  assertEquals(fares[0].not_included, [
    "Troca de placa/veículo",
    "Alteração de data/horário",
    "Avisos por WhatsApp",
    "Proteção de voo: atraso ou cancelamento",
  ]);
  assertEquals(fares[2].not_included, []);
});

// Benefício que nenhuma tarifa tem não aparece, como no comparativo do site (o suporte prioritário
// saiu do catálogo em 25/09/2026). Mostrá-lo como "não incluído" anunciaria uma tarifa que o tem.
Deno.test("presentFares: benefício fora do catálogo não aparece em lista nenhuma", () => {
  const { fares } = presentFares(CATALOGO);
  for (const f of fares) {
    assertEquals([...f.included, ...f.not_included].includes("Suporte prioritário"), false, f.tier);
  }
});

Deno.test("presentFares: explica a proteção de voo só quando alguma tarifa a oferece", () => {
  const com = presentFares(CATALOGO).details;
  assertEquals(Object.keys(com), ["Proteção de voo: atraso ou cancelamento"]);
  const sem = presentFares(CATALOGO.filter((f) => f.tier !== "superflex")).details;
  assertEquals(Object.keys(sem), []);
});

Deno.test("presentFares: tarifa sem janela diz que não tem cancelamento grátis", () => {
  const { fares } = presentFares([{ ...CATALOGO[1], cancel_window_minutes: null }]);
  assertEquals(fares[0].cancellation, "Sem cancelamento grátis");
});
