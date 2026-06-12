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
// @ts-expect-error - Deno remote import
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
// @ts-expect-error - Deno remote import
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { voucherFields, type VoucherBooking } from "./fields.ts";

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

function pngFromDataUrl(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

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
  if (!code) return jsonResponse({ error: "code é obrigatório" }, 400);

  // Leitura escopada pela RLS (dono ou operador da empresa)
  const { data: b, error: bErr } = await userClient
    .from("booking")
    .select(
      `id, code, status, check_in_at, check_out_at, total_amount, currency,
       location:location!inner(name, address, company:company!inner(name)),
       vehicle:vehicle(license_plate, model),
       items:booking_item(item_type, parking_type:parking_type(name))`,
    )
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();

  if (bErr) return jsonResponse({ error: bErr.message }, 500);
  if (!b) return jsonResponse({ error: "Reserva não encontrada" }, 404);
  if (!["confirmed", "checked_in", "completed"].includes(b.status)) {
    return jsonResponse({ error: "Voucher disponível só após a confirmação do pagamento." }, 422);
  }

  // deno-lint-ignore no-explicit-any
  const parkingItem = (b.items ?? []).find((i: any) => i.item_type === "parking");
  const voucher: VoucherBooking = {
    code: b.code,
    check_in_at: b.check_in_at,
    check_out_at: b.check_out_at,
    total_amount: Number(b.total_amount),
    currency: b.currency,
    company_name: b.location.company.name,
    location_name: b.location.name,
    location_address: b.location.address,
    parking_type_name: parkingItem?.parking_type?.name ?? null,
    vehicle: b.vehicle
      ? { license_plate: b.vehicle.license_plate, model: b.vehicle.model }
      : null,
  };

  // QR da página de validação
  const validateUrl = `${SITE_URL}/voucher/validate?code=${encodeURIComponent(b.code)}`;
  const qrDataUrl: string = await QRCode.toDataURL(validateUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#29263F", light: "#FFFFFF" },
  });

  // Monta o PDF
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.16, 0.149, 0.247);
  const muted = rgb(0.45, 0.45, 0.5);
  const hair = rgb(0.9, 0.9, 0.92);
  const M = 56;

  const center = (text: string, y: number, size: number, font: typeof helv, color = ink) =>
    page.drawText(text, { x: (width - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });

  let y = height - 64;
  page.drawText("Movepark", { x: M, y, size: 20, font: helvB, color: ink });
  const tr = "Voucher de reserva";
  page.drawText(tr, { x: width - M - helv.widthOfTextAtSize(tr, 11), y: y + 4, size: 11, font: helv, color: muted });
  y -= 24;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: hair });

  // QR centralizado
  const qrImg = await pdf.embedPng(pngFromDataUrl(qrDataUrl));
  const qrSize = 200;
  y -= qrSize + 36;
  page.drawImage(qrImg, { x: (width - qrSize) / 2, y, width: qrSize, height: qrSize });

  y -= 28;
  center("Código", y, 10, helv, muted);
  y -= 26;
  center(b.code, y, 24, helvB, ink);
  y -= 22;
  center("Apresente esse QR na chegada à vaga.", y, 10, helv, muted);

  y -= 28;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: hair });
  y -= 28;

  for (const line of voucherFields(voucher)) {
    page.drawText(line.label, { x: M, y, size: 11, font: helv, color: muted });
    const vw = helvB.widthOfTextAtSize(line.value, 11);
    page.drawText(line.value, { x: width - M - vw, y, size: 11, font: helvB, color: ink });
    y -= 22;
  }

  const pdfBytes = await pdf.save();

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
