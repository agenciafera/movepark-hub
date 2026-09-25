import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { decodeBase64 } from "jsr:@std/encoding/base64";
import {
  htmlToBase64,
  siteUrl,
  tplApprovalInvite,
  tplBookingConfirmation,
  tplLeadAlert,
  tplLeadReceived,
  tplRejection,
  tplReviewRequest,
  tplWithdrawalRequested,
  tplWithdrawalPaid,
  tplWithdrawalFailed,
  tplPartnerDebtCreated,
  tplBookingCancelled,
  tplBookingReminderCheckin,
  tplBookingReminderCheckout,
  tplBookingDatesChanged,
  tplBookingVehicleChanged,
  tplBookingExtended,
  tplSupportTicketTeam,
  tplSupportTicketCustomer,
  tplFlightProtectionUnit,
} from "./email.ts";
import { DEFAULT_SITE_URL } from "./site.ts";
import type { VoucherBooking } from "./voucher/fields.ts";

Deno.test("siteUrl remove barra(s) final(is)", () => {
  Deno.env.set("PUBLIC_SITE_URL", "https://movepark.co//");
  assertEquals(siteUrl(), "https://movepark.co");
  Deno.env.delete("PUBLIC_SITE_URL");
});

Deno.test("siteUrl cai no host canônico sem env, e nunca no localhost", () => {
  Deno.env.delete("PUBLIC_SITE_URL");
  // Link de e-mail apontando para localhost é link morto para quem recebe.
  assertEquals(siteUrl(), DEFAULT_SITE_URL);
});

Deno.test("tplLeadReceived: assunto + primeiro nome no corpo", () => {
  const m = tplLeadReceived("Kallef Souza");
  assertStringIncludes(m.subject, "Recebemos o cadastro");
  // Saudação usa só o primeiro nome.
  assertStringIncludes(m.html, "Olá, Kallef.");
});

Deno.test("shell: logo real, sem newline e sem travessão (regressão do artefato =20)", () => {
  const html = tplLeadReceived("Kallef").html;
  // O denomailer codifica em quoted-printable; a indentação/newline entre tags
  // virava um "=20" solto no corpo. shell() remove esse whitespace estrutural.
  assert(!html.includes("\n"), "html final não pode ter quebra de linha");
  // O logo é a imagem real da marca (PNG hospedado), não texto.
  assertStringIncludes(html, "/brand/logo-movepark-email.png");
  assertStringIncludes(html, 'alt="Movepark"');
  // Regra de marca: nada de travessão em texto do projeto.
  assert(!html.includes("—") && !html.includes("–"), "sem travessão");
});

Deno.test("tplApprovalInvite: inclui o link de ação", () => {
  const link = "https://x.supabase.co/auth/v1/verify?token=abc&redirect_to=y";
  const m = tplApprovalInvite("Kallef", link);
  assertStringIncludes(m.html, link);
  assertStringIncludes(m.subject, "aprovado");
});

Deno.test("htmlToBase64: link longo chega íntegro e nenhuma linha começa com '.' (regressão do ponto comido pelo SMTP dot-stuffing)", () => {
  // Link real que quebrou em produção: o QP soft-wrap deixou uma linha começando com
  // ".supabase.co" e o dot-stuffing comeu o ponto → "...qiofcfsupabase.co" (NXDOMAIN).
  const link =
    "https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/verify?token=9872e9be6a60a81f2c000477706ff7ab52dc530f975d1452b1957760&type=magiclink&redirect_to=https://hub.movepark.co/onboarding";
  const html = tplApprovalInvite("Léo", link).html;
  const encoded = htmlToBase64(html);

  // Base64 não tem "." no alfabeto → nenhuma linha começa com ponto (é o que corrige o bug).
  for (const line of encoded.split("\r\n")) {
    assert(!line.startsWith("."), `linha base64 não pode começar com ponto: ${line.slice(0, 12)}`);
    assert(line.length <= 76, "linha base64 respeita o limite de 76 chars (RFC 2045)");
  }

  // Round-trip: o HTML decodificado preserva o domínio COM o ponto.
  const decoded = new TextDecoder().decode(decodeBase64(encoded.replaceAll("\r\n", "")));
  assertStringIncludes(decoded, "mgaigbezdalbyuqiofcf.supabase.co");
  assertStringIncludes(decoded, link);
});

Deno.test("tplRejection: inclui o motivo quando informado", () => {
  assertStringIncludes(tplRejection("Kallef", "fora de cobertura").html, "fora de cobertura");
});

Deno.test("tplLeadAlert: tabela com dados do lead", () => {
  const m = tplLeadAlert({
    companyName: "Estac X", contactName: "Op", contactEmail: "op@x.com", contactPhone: "+5511",
    city: "SP", state: "SP", estimatedSpots: 50, utmSource: "google",
  });
  assertStringIncludes(m.subject, "Estac X");
  assertStringIncludes(m.html, "op@x.com");
});

Deno.test("tplReviewRequest: assunto + estrelas clicáveis com deep link de 1 clique (?rating=N)", () => {
  const m = tplReviewRequest("Kallef", "Aeropark GRU", "https://hub.movepark.co/bookings/MP-ABC123");
  assertStringIncludes(m.subject, "Aeropark GRU");
  assertStringIncludes(m.html, "Kallef");
  // 5 estrelas, cada uma com ?rating=N (deep link de 1 clique já com a nota)
  for (let n = 1; n <= 5; n++) {
    assertStringIncludes(m.html, `https://hub.movepark.co/bookings/MP-ABC123?rating=${n}`);
  }
});

Deno.test("escapeHtml: nome com < > é escapado (anti-injeção)", () => {
  const m = tplLeadReceived("<script>alert(1)</script>");
  assert(!m.html.includes("<script>"));
  assertStringIncludes(m.html, "&lt;script&gt;");
});

Deno.test("tplBookingConfirmation: resumo, total, checklist e link da reserva", () => {
  const b: VoucherBooking = {
    code: "MP-7K2Q9X",
    check_in_at: "2026-08-25T19:00:00-03:00",
    check_out_at: "2026-08-28T19:00:00-03:00",
    total_amount: 219.96,
    currency: "BRL",
    company_name: "Ponce Park Estacionamento",
    location_name: "Ponce Park GRU",
    location_address: "Rua X, 100",
    parking_type_name: "Vaga coberta",
    vehicle: { license_plate: "NME3344", model: "VW Nivus" },
  };
  const m = tplBookingConfirmation(b, "Diego Guedes Gomes", "https://hub.movepark.co/bookings/MP-7K2Q9X");
  assertStringIncludes(m.subject, "MP-7K2Q9X");
  // Saudação usa só o primeiro nome.
  assertStringIncludes(m.html, "Tudo certo, Diego!");
  // Resumo com os dados-chave e total formatado em BRL.
  assertStringIncludes(m.html, "Ponce Park GRU");
  assertStringIncludes(m.html, "NME3344");
  assertStringIncludes(m.html, "219,96");
  // Data por extenso no checklist + CTA linkando a reserva do cliente.
  assertStringIncludes(m.html, "de agosto");
  assertStringIncludes(m.html, "https://hub.movepark.co/bookings/MP-7K2Q9X");
  // Sem travessão (regra de marca).
  assert(!m.html.includes("—") && !m.html.includes("–"));
});

Deno.test("tplBookingConfirmation: sem nome cai em saudação genérica", () => {
  const b: VoucherBooking = {
    code: "MP-0", check_in_at: "2026-08-25T19:00:00-03:00", check_out_at: "2026-08-26T19:00:00-03:00",
    total_amount: 10, currency: "BRL", company_name: "X", location_name: "Y",
    location_address: null, parking_type_name: null, vehicle: null,
  };
  const m = tplBookingConfirmation(b, null, "https://hub.movepark.co/bookings/MP-0");
  assertStringIncludes(m.html, "Tudo certo!");
});

Deno.test("shell: casco da marca (hero, régua, banda de ajuda, redes, rodapé legal)", () => {
  const html = tplLeadReceived("Kallef").html;
  // Hero: símbolo branco da marca sobre fundo colorido.
  assertStringIncludes(html, "/brand/simbolo-movepark-white-email.png");
  // Régua de marca (as 4 cores da identidade).
  for (const hex of ["#29263F", "#5D5FEF", "#DA455E", "#A6DBDF"]) {
    assertStringIncludes(html, hex);
  }
  // Banda de ajuda.
  assertStringIncludes(html, "Ficou com alguma dúvida?");
  // Redes sociais como PNG hospedado (email-safe).
  assertStringIncludes(html, "/brand/social-instagram-email.png");
  assertStringIncludes(html, "/brand/social-linkedin-email.png");
  assertStringIncludes(html, "/brand/social-whatsapp-email.png");
  // Rodapé legal.
  assertStringIncludes(html, "Movepark Tecnologia Ltda.");
  assertStringIncludes(html, "Rua Tito, 479");
  // Links institucionais apontam para as rotas reais do site.
  assertStringIncludes(html, "/termos");
  assertStringIncludes(html, "/privacidade");
  assertStringIncludes(html, "/contato");
});

Deno.test("e-mails de saque: valor, taxa, previsão, data e motivo, sem travessão", () => {
  const base = { contactName: "Kallef Souza", companyName: "Agência Fera", amountCents: 633, feeCents: 367, expectedAt: "2026-09-18T03:00:00.000Z", accountTail: "5482-1" };
  const pedido = tplWithdrawalRequested(base);
  assertStringIncludes(pedido.subject, "6,33");
  assertStringIncludes(pedido.html, "Olá, Kallef.");
  assertStringIncludes(pedido.html, "final 5482-1");
  assertStringIncludes(pedido.html, "18/09/2026");
  assertStringIncludes(pedido.html, "3,67");
  const caiu = tplWithdrawalPaid({ ...base, paidAt: "2026-09-18T13:05:00.000Z" });
  assertStringIncludes(caiu.subject, "enviada ao seu banco");
  assertStringIncludes(caiu.html, "em 18/09/2026");
  const falhou = tplWithdrawalFailed({ ...base, failureReason: "conta encerrada" });
  assertStringIncludes(falhou.html, "conta encerrada");
  for (const m of [pedido, caiu, falhou]) {
    assert(!m.html.includes("—") && !m.html.includes("–") && !m.subject.includes("—"), "sem travessão");
    assert(!m.html.includes("\n"), "sem quebra de linha");
  }
});

Deno.test("e-mail de dívida: reserva, valor abatido, total e motivo, sem travessão", () => {
  const m = tplPartnerDebtCreated({ contactName: "Pedro Araujo", companyName: "Agência Fera", bookingCode: "MP-F65005", debtCents: 1422, totalDebtCents: 1422, reason: "cancelamento (staff)" });
  assertStringIncludes(m.subject, "MP-F65005");
  assertStringIncludes(m.subject, "14,22");
  assertStringIncludes(m.html, "Olá, Pedro.");
  assertStringIncludes(m.html, "cancelamento (staff)");
  assertStringIncludes(m.html, "Total a abater hoje");
  assert(!m.html.includes("—") && !m.html.includes("–") && !m.html.includes("\n"), "sem travessão nem quebra");
});

Deno.test("e-mail de cancelamento: diz o que acontece com o dinheiro por meio e situação", () => {
  const b = { code: "MP-F65005", check_in_at: "2026-09-20T12:00:00Z", check_out_at: "2026-09-21T12:00:00Z", total_amount: 18, currency: "BRL", company_name: "Agência Fera", location_name: "Agência Fera", location_address: null, parking_type_name: null, vehicle: null };
  const url = "https://movepark.co/bookings/MP-F65005";
  const pix = tplBookingCancelled(b, "Kallef Alexandre", { refund: "refunded", amount: 18, method: "pix", reason: "cancelamento (staff)" }, url);
  assertStringIncludes(pix.subject, "MP-F65005 cancelada");
  assertStringIncludes(pix.html, "Olá, Kallef.");
  assertStringIncludes(pix.html, "18,00");
  assertStringIncludes(pix.html, "No PIX");
  const card = tplBookingCancelled(b, null, { refund: "pending", amount: 30.9, method: "card", reason: null }, url);
  assertStringIncludes(card.html, "em processamento");
  assertStringIncludes(card.html, "fatura");
  const manual = tplBookingCancelled(b, null, { refund: "manual", amount: 18, method: "pix", reason: null }, url);
  assertStringIncludes(manual.html, "nossa equipe");
  const none = tplBookingCancelled(b, null, { refund: "none", amount: null, method: null, reason: null }, url);
  assertStringIncludes(none.html, "Não houve cobrança");
  for (const m of [pix, card, manual, none]) assert(!m.html.includes("—") && !m.html.includes("–") && !m.html.includes("\n"), "sem travessão nem quebra");
});

// 23/09/2026: os avisos da reserva (fase 2 da tarifas-operacao), sem travessão e com o código.
Deno.test("avisos da reserva: assunto com o código, corpo com a unidade, sem travessão", () => {
  const b = { code: "MP-ABC123", location_name: "BePark Confins", location_address: "Av. X, 1", check_in_at: "2026-12-10T12:00:00Z", check_out_at: "2026-12-12T15:30:00Z", vehicle: { license_plate: "ABC1D23", model: "Onix" } };
  for (const tpl of [tplBookingReminderCheckin, tplBookingReminderCheckout, tplBookingDatesChanged, tplBookingVehicleChanged, tplBookingExtended]) {
    const m = tpl(b, "Ana Maria", "https://movepark.co/bookings/MP-ABC123");
    assertEquals(m.subject.includes("MP-ABC123") || m.subject.includes("BePark Confins"), true, tpl.name);
    assertEquals(m.html.includes("BePark Confins"), true, tpl.name);
    assertEquals(m.html.includes("Ana"), true, tpl.name);
    assertEquals(/[\u2014\u2013]/.test(m.html + m.subject), false, tpl.name);
  }
  assertEquals(tplBookingVehicleChanged(b, null, "u").html.includes("ABC1D23"), true);
});

Deno.test("tplSupportTicketTeam: motivo, reserva, mensagem escapada e os dois botões", () => {
  const m = tplSupportTicketTeam({
    ticketCode: "CH-K7M2PX", kindLabel: "Reclamação", message: "Portão <fechado> & escuro", bookingCode: "MP-1A2B3C",
    customerName: "Ana Souza", phone: "5541988149449", email: "ana@ex.com", unitName: "Agência Fera", whatsappSent: true,
  });
  assertEquals(m.subject, "Chamado CH-K7M2PX: Reclamação na reserva MP-1A2B3C");
  assertStringIncludes(m.html, "Portão &lt;fechado&gt; &amp; escuro");
  assertStringIncludes(m.html, "/manager/bookings/MP-1A2B3C");
  assertStringIncludes(m.html, "/manager/conversas");
  assertStringIncludes(m.html, "o agente está mudo");
  assert(!/[\u2013\u2014]/.test(m.html));
});

Deno.test("tplSupportTicketTeam: sem WhatsApp, pede resposta por e-mail", () => {
  const m = tplSupportTicketTeam({
    ticketCode: "CH-K7M2PX", kindLabel: "Dúvida", message: "Posso chegar mais cedo?", bookingCode: "MP-1A2B3C",
    customerName: "", phone: null, email: "ana@ex.com", unitName: "", whatsappSent: false,
  });
  assertStringIncludes(m.html, "Responda a este e-mail");
});

Deno.test("tplSupportTicketCustomer: código, reserva e horário comercial", () => {
  const m = tplSupportTicketCustomer("Ana", "MP-1A2B3C", "CH-K7M2PX", "https://movepark.co/bookings/MP-1A2B3C");
  assertStringIncludes(m.subject, "CH-K7M2PX");
  assertStringIncludes(m.html, "segunda a sexta, das 9h às 18h");
  assertStringIncludes(m.html, "https://movepark.co/bookings/MP-1A2B3C");
});

const noticeVoo = { code: "MP-1A2B3C", location_name: "Agência Fera", location_address: null, check_in_at: "2026-12-13T08:00:00Z", check_out_at: "2026-12-14T08:00:00Z", vehicle: null } as never;

Deno.test("tplBookingExtended: o bloco do excedente só aparece quando pedido", () => {
  const sem = tplBookingExtended(noticeVoo, "Ana", "https://movepark.co/bookings/MP-1A2B3C");
  assertStringIncludes(sem.html, "Nada a pagar");
  const com = tplBookingExtended(noticeVoo, "Ana", "https://movepark.co/bookings/MP-1A2B3C", { coveredAt: "2026-12-14T08:00:00Z", dailyCents: 2700 });
  assertStringIncludes(com.html, "R$ 27,00 por dia, pago no estacionamento");
  assert(!com.html.includes("Nada a pagar"));
  assert(!/[\u2013\u2014]/.test(com.html));
});

Deno.test("tplFlightProtectionUnit: voo, hora coberta, preço por dia e link do Operator", () => {
  const m = tplFlightProtectionUnit({ bookingCode: "MP-1A2B3C", kind: "cancellation", flightNumber: "LA3456", coveredAt: "2026-12-14T08:00:00Z", dailyCents: 2700, overageCents: 5400, vehicle: "ABC1D23", operatorUrl: "https://movepark.co/operator/bookings/MP-1A2B3C" });
  assertStringIncludes(m.subject, "MP-1A2B3C");
  assertStringIncludes(m.html, "voo cancelado");
  assertStringIncludes(m.html, "LA3456");
  assertStringIncludes(m.html, "R$ 27,00 por dia");
  assertStringIncludes(m.html, "R$ 54,00");
  assertStringIncludes(m.html, "/operator/bookings/MP-1A2B3C");
});
