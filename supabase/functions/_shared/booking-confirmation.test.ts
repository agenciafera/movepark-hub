import { assertEquals } from "jsr:@std/assert";
import { withEmailMedia } from "./booking-confirmation.ts";
import type { VoucherBooking } from "./voucher/fields.ts";

const base: VoucherBooking = {
  code: "MP-1",
  check_in_at: "2026-12-01T13:00:00Z",
  check_out_at: "2026-12-05T13:00:00Z",
  total_amount: 200,
  company_name: "Pare Seguro",
  location_name: "Aeroporto de Guarulhos",
  location_address: "Av. Monteiro Lobato, 2738",
  parking_type_name: null,
  vehicle: null,
  location_lat: -23.4637952,
  location_lng: -46.5015367,
  location_photo: "/Estacionamentos/pare-seguro/pare-seguro-2.avif",
};

const responde = (status: number) =>
  (async () => new Response(null, { status })) as unknown as typeof fetch;

Deno.test("withEmailMedia: usa a foto JPG quando ela existe e monta o mapa com a chave", async () => {
  const v = await withEmailMedia(base, { site: "https://movepark.co", mapsKey: "k", fetcher: responde(200) });
  assertEquals(v.email_photo_url, "https://movepark.co/Estacionamentos/pare-seguro/email/pare-seguro-2.jpg");
  assertEquals(v.email_map_url?.startsWith("https://maps.googleapis.com/maps/api/staticmap?"), true);
});

Deno.test("withEmailMedia: JPG ausente não vira imagem quebrada, e sem chave não há mapa", async () => {
  const v = await withEmailMedia(base, { site: "https://movepark.co", mapsKey: null, fetcher: responde(404) });
  assertEquals(v.email_photo_url, null);
  assertEquals(v.email_map_url, null);
});

Deno.test("withEmailMedia: falha de rede na checagem da foto não derruba o envio", async () => {
  const falha = (async () => {
    throw new Error("timeout");
  }) as unknown as typeof fetch;
  const v = await withEmailMedia(base, { site: "https://movepark.co", mapsKey: null, fetcher: falha });
  assertEquals(v.email_photo_url, null);
});
