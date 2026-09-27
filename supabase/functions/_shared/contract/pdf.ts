// Geração do PDF do contrato de parceria aceito (pdf-lib, mesmo gerador do voucher).
// Usado pela Edge `contract-pdf`. O corpo vem de `partner_contract_version` (o texto que o dono
// aceitou), e o bloco de prova (versão, data, hash, quem, IP) vem de `company`.

// @ts-expect-error - Deno remote import
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { wrapParagraph } from "../../contract-pdf/logic.ts";

export interface ContractPdfInput {
  version: string;
  sha256: string;
  body: string;
  /** Nome fantasia da empresa (company.name). */
  companyName: string;
  /** Razão social e CNPJ do cadastro de recebimento, quando existem. */
  legalName?: string | null;
  document?: string | null;
  acceptedAt: string;
  acceptedByName?: string | null;
  acceptedIp?: string | null;
}

/** Linhas do bloco de prova do aceite, na ordem em que saem no PDF e no .txt. */
export function contractProofLines(input: ContractPdfInput): string[] {
  const quando = new Date(input.acceptedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const partes = [`Parceiro: ${input.companyName}`];
  if (input.legalName) partes.push(`Razão social: ${input.legalName}`);
  if (input.document) partes.push(`CNPJ: ${input.document}`);
  partes.push(`Versão aceita: ${input.version}`);
  partes.push(`Aceito em: ${quando} (horário de Brasília)`);
  if (input.acceptedByName) partes.push(`Aceito por: ${input.acceptedByName}`);
  if (input.acceptedIp) partes.push(`IP do aceite: ${input.acceptedIp}`);
  partes.push(`SHA-256 do texto: ${input.sha256}`);
  return partes;
}

/** Monta o PDF (A4, quantas páginas precisar) do contrato aceito. */
export async function buildContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Contrato de parceria Movepark ${input.version}`);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const ink = rgb(0.16, 0.149, 0.247);
  const muted = rgb(0.45, 0.45, 0.5);
  const hair = rgb(0.9, 0.9, 0.92);

  const W = 595.28;
  const H = 841.89;
  const M = 56;
  const maxWidth = W - 2 * M;
  const bodySize = 10.5;
  const lineHeight = 15;
  const footerY = 40;

  let page = pdf.addPage([W, H]);
  let y = 0;
  let pageNo = 0;

  const drawHeader = () => {
    pageNo += 1;
    y = H - 64;
    page.drawText("Movepark", { x: M, y, size: 20, font: helvB, color: ink });
    const tr = `Contrato de parceria · ${input.version}`;
    page.drawText(tr, { x: W - M - helv.widthOfTextAtSize(tr, 11), y: y + 4, size: 11, font: helv, color: muted });
    y -= 24;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: hair });
    y -= 28;
  };
  const drawFooter = () => {
    const left = `SHA-256 ${input.sha256.slice(0, 12)}…`;
    page.drawText(left, { x: M, y: footerY, size: 8, font: mono, color: muted });
    const right = `página ${pageNo}`;
    page.drawText(right, { x: W - M - helv.widthOfTextAtSize(right, 8), y: footerY, size: 8, font: helv, color: muted });
  };
  const ensureRoom = (needed: number) => {
    if (y - needed < footerY + 24) {
      drawFooter();
      page = pdf.addPage([W, H]);
      drawHeader();
    }
  };
  const fits = (font: typeof helv, size: number) => (s: string) =>
    font.widthOfTextAtSize(s, size) <= maxWidth;

  drawHeader();

  // Corpo: uma linha do texto por vez, com wrap pela largura real da fonte.
  for (const raw of input.body.split("\n")) {
    if (raw.trim() === "") {
      y -= lineHeight * 0.6;
      continue;
    }
    const isTitle = /^\d+\.\s+[A-ZÀ-Ú]/.test(raw) || raw === raw.toUpperCase();
    const font = isTitle ? helvB : helv;
    for (const line of wrapParagraph(raw, fits(font, bodySize))) {
      ensureRoom(lineHeight);
      page.drawText(line, { x: M, y, size: bodySize, font, color: ink });
      y -= lineHeight;
    }
  }

  // Bloco de prova do aceite.
  y -= 10;
  ensureRoom(lineHeight * (contractProofLines(input).length + 3));
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: hair });
  y -= 24;
  page.drawText("Prova do aceite", { x: M, y, size: 11, font: helvB, color: ink });
  y -= lineHeight + 2;
  for (const line of contractProofLines(input)) {
    const useMono = line.startsWith("SHA-256");
    for (const l of wrapParagraph(line, fits(useMono ? mono : helv, 9.5))) {
      ensureRoom(lineHeight);
      page.drawText(l, { x: M, y, size: 9.5, font: useMono ? mono : helv, color: ink });
      y -= lineHeight;
    }
  }
  drawFooter();

  return await pdf.save();
}
