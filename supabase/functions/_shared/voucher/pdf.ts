// Geração do PDF do voucher (pdf-lib + QR) e pré-geração server-side.
// Usado pela Edge `voucher-pdf` (sob demanda, leitura RLS pelo dono/operador) e pelo
// `pagarme-webhook` (pré-geração com service role assim que o pagamento é confirmado).

// @ts-expect-error - Deno remote import
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
// @ts-expect-error - Deno remote import
import QRCode from "https://esm.sh/qrcode@1.5.4";
import {
  mapBookingRowToVoucher,
  VOUCHER_BOOKING_SELECT,
  VOUCHER_BOOKING_STATUSES,
  voucherFields,
  type VoucherBooking,
} from "./fields.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function pngFromDataUrl(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Monta o PDF (A4) do voucher: cabeçalho, QR de validação e os campos da reserva. */
export async function buildVoucherPdf(
  voucher: VoucherBooking,
  validateUrl: string,
): Promise<Uint8Array> {
  const qrDataUrl: string = await QRCode.toDataURL(validateUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#29263F", light: "#FFFFFF" },
  });

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

  const qrImg = await pdf.embedPng(pngFromDataUrl(qrDataUrl));
  const qrSize = 200;
  y -= qrSize + 36;
  page.drawImage(qrImg, { x: (width - qrSize) / 2, y, width: qrSize, height: qrSize });

  y -= 28;
  center("Código", y, 10, helv, muted);
  y -= 26;
  center(voucher.code, y, 24, helvB, ink);
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

  return await pdf.save();
}

/** URL pública da página de validação do voucher (QR). */
export function voucherValidateUrl(siteUrl: string, code: string): string {
  return `${siteUrl}/voucher/validate?code=${encodeURIComponent(code)}`;
}

/**
 * Pré-gera o voucher com **service role** (sem RLS) e persiste em `booking.voucher_url`.
 * Chamado pelo webhook quando o pagamento confirma. Idempotente: faz upsert no bucket.
 * Não lança quando a reserva ainda não está confirmada — só pula (retorna null).
 */
export async function generateAndStoreVoucher(
  service: SupabaseClient,
  bookingId: string,
  siteUrl: string,
): Promise<string | null> {
  const { data: b, error } = await service
    .from("booking")
    .select(VOUCHER_BOOKING_SELECT)
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!b) return null;
  if (!VOUCHER_BOOKING_STATUSES.includes(b.status)) return null;

  const voucher = mapBookingRowToVoucher(b);
  const pdfBytes = await buildVoucherPdf(voucher, voucherValidateUrl(siteUrl, b.code));
  const path = `${b.id}.pdf`;

  const { error: upErr } = await service.storage
    .from("vouchers")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(upErr.message);

  await service.from("booking").update({ voucher_url: path }).eq("id", b.id);
  return path;
}
