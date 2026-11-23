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
import { activeAccessCode } from "../integrations/access-code.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/**
 * Baixa o logo do estacionamento para o PDF (docs/specs/logo-do-estacionamento.md). Só PNG e JPG,
 * que é o que o pdf-lib embute e o que o banco aceita. Best-effort com prazo curto: logo que não
 * baixa não segura o voucher, que sai sem ele, como antes.
 *
 * Só baixa do Storage do próprio projeto (host de `SUPABASE_URL`), que é para onde o upload do
 * Manager manda o arquivo. A coluna aceita qualquer https, e quem tem escrita na unidade poderia
 * apontar a Edge para outro host; o fetch do servidor não segue para fora do nosso Storage.
 */
export async function fetchLogoImage(
  url: string | null | undefined,
  timeoutMs = 4000,
): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  const u = (url ?? "").trim();
  if (!isOwnStorageUrl(u)) return null;
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const kind = logoKind(bytes);
    return kind ? { bytes, kind } : null;
  } catch {
    return null;
  }
}

/** URL https do Storage deste projeto (mesmo host de `SUPABASE_URL`, caminho de objeto público). */
export function isOwnStorageUrl(url: string, supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""): boolean {
  try {
    const u = new URL(url);
    const own = new URL(supabaseUrl);
    return u.protocol === "https:" && u.host === own.host && u.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

/** Tipo pela assinatura do arquivo (não pela extensão nem pelo header, que podem mentir). */
export function logoKind(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

function pngFromDataUrl(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Monta o PDF (A4) do voucher: cabeçalho, QR (ver `voucherQrContent`) e os campos da reserva. */
export async function buildVoucherPdf(
  voucher: VoucherBooking,
  qrContent: string,
): Promise<Uint8Array> {
  const qrDataUrl: string = await QRCode.toDataURL(qrContent, {
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

  // Quem opera a vaga, como primeira linha do quadro, no mesmo desenho rótulo × valor dos campos.
  // A imagem vai alinhada à direita, com 22pt de altura e no máximo 140pt de largura.
  const logo = await fetchLogoImage(voucher.parking_logo?.light);
  if (logo) {
    try {
      const img = logo.kind === "png" ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes);
      const ratio = img.width / img.height;
      let h = 22;
      let w = ratio * h;
      if (w > 140) {
        w = 140;
        h = w / ratio;
      }
      page.drawText("Operado por", { x: M, y, size: 11, font: helv, color: muted });
      // Centro da imagem no centro óptico do texto de 11pt (baseline + 4).
      page.drawImage(img, { x: width - M - w, y: y + 4 - h / 2, width: w, height: h });
      y -= 34;
    } catch (e) {
      console.error("[voucher] logo não embutido:", voucher.code, e);
    }
  }

  // Valor longo (endereço completo) quebra em linhas alinhadas à direita; antes ele passava da
  // margem e saía cortado da folha. 150pt ficam reservados para o rótulo.
  const maxValueWidth = width - 2 * M - 150;
  for (const line of voucherFields(voucher)) {
    page.drawText(line.label, { x: M, y, size: 11, font: helv, color: muted });
    const rows = wrapText(line.value, maxValueWidth, (t) => helvB.widthOfTextAtSize(t, 11));
    rows.forEach((row, i) => {
      const vw = helvB.widthOfTextAtSize(row, 11);
      page.drawText(row, { x: width - M - vw, y: y - i * 15, size: 11, font: helvB, color: ink });
    });
    y -= 22 + (rows.length - 1) * 15;
  }

  return await pdf.save();
}

/** Quebra o texto por palavra para caber em `maxWidth`. Palavra maior que a linha fica inteira. */
export function wrapText(text: string, maxWidth: number, measure: (t: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next) > maxWidth) {
      rows.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) rows.push(cur);
  return rows.length ? rows : [""];
}

/** URL pública da página de validação do voucher (QR). */
export function voucherValidateUrl(siteUrl: string, code: string): string {
  return `${siteUrl}/voucher/validate?code=${encodeURIComponent(code)}`;
}

/**
 * O que vai no QR do voucher. Unidade com integração de cancela (Cloudpark) põe o código cru
 * devolvido pelo provedor, que é o que a cancela lê, como o legado fazia com `external_qrcode`.
 * Sem código, segue a página de validação do Hub. Spec: docs/specs/integracoes.md § 5.6.
 */
export function voucherQrContent(siteUrl: string, code: string, accessCode?: string | null): string {
  const c = (accessCode ?? "").trim();
  return c || voucherValidateUrl(siteUrl, code);
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
  const accessCode = await activeAccessCode(service, b.id);
  const pdfBytes = await buildVoucherPdf(voucher, voucherQrContent(siteUrl, b.code, accessCode));
  const path = `${b.id}.pdf`;

  const { error: upErr } = await service.storage
    .from("vouchers")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(upErr.message);

  await service.from("booking").update({ voucher_url: path }).eq("id", b.id);
  return path;
}
