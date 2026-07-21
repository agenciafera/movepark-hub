// Edge Function: /voucher-pdf
// Gera (ou regenera) o PDF do voucher de uma reserva, guarda no bucket privado
// `vouchers` e devolve uma signed URL. Requer JWT (dono da reserva OU operador
// da empresa — a leitura usa o client do usuário, escopada pela RLS do booking).
//
// POST /functions/v1/voucher-pdf
// Authorization: Bearer <JWT>
// { "code": "MP-A8K7P2" }
// → { url, code }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapBookingRowToVoucher, VOUCHER_BOOKING_SELECT } from "../_shared/voucher/fields.ts";
import { buildVoucherPdf, voucherValidateUrl } from "../_shared/voucher/pdf.ts";
import { checkVoucherAuth, checkVoucherBooking, checkVoucherCode } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const authDenial = checkVoucherAuth(authHeader);
  if (authDenial) return jsonResponse({ error: authDenial.error }, authDenial.status);

  // @ts-expect-error - Deno env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  // @ts-expect-error - Deno env
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // @ts-expect-error - Deno env
  const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://hub.movepark.co";

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  let code: string;
  try {
    code = (await req.json()).code;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const codeDenial = checkVoucherCode(code);
  if (codeDenial) return jsonResponse({ error: codeDenial.error }, codeDenial.status);

  // Leitura escopada pela RLS (dono ou operador da empresa)
  const { data: b, error: bErr } = await userClient
    .from("booking")
    .select(VOUCHER_BOOKING_SELECT)
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();

  if (bErr) return jsonResponse({ error: bErr.message }, 500);
  const bookingDenial = checkVoucherBooking(b);
  if (bookingDenial) return jsonResponse({ error: bookingDenial.error }, bookingDenial.status);

  const voucher = mapBookingRowToVoucher(b);
  const pdfBytes = await buildVoucherPdf(voucher, voucherValidateUrl(SITE_URL, b.code));

  // Upload + voucher_url + signed URL (service role)
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const path = `${b.id}.pdf`;

  const { error: upErr } = await service.storage
    .from("vouchers")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (upErr) return jsonResponse({ error: `Falha ao gerar voucher: ${upErr.message}` }, 500);

  await service.from("booking").update({ voucher_url: path }).eq("id", b.id);

  const { data: signed, error: signErr } = await service.storage
    .from("vouchers")
    .createSignedUrl(path, 3600);
  if (signErr || !signed) {
    return jsonResponse({ error: `Falha ao assinar voucher: ${signErr?.message ?? ""}` }, 500);
  }

  return jsonResponse({ url: signed.signedUrl, code: b.code });
});
