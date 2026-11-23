import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { decodeBase64 } from "jsr:@std/encoding/base64";
import {
  composeRawEmail,
  pdfAttachment,
  siteUrl,
  tplApprovalInvite,
  tplDuplicatePaymentTeam,
  tplPartnerDailyDigest,
  teamDigestDelta,
  teamDigestEmailAlert,
  tplTeamDailyDigest,
  tplBookingConfirmation,
  partnerNoticeBlock,
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
  datesChangedMoneyLine,
  tplBookingVehicleChanged,
  tplBookingExtended,
  tplSupportTicketTeam,
  tplSupportTicketCustomer,
  tplFlightProtectionUnit,
  tplAccessCodeUpdated,
  tplIntegrationAlert,
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

Deno.test("tplBookingConfirmation: avisa que o voucher vai em anexo (02/10/2026)", () => {
  const b: VoucherBooking = {
    code: "MP-F3FC9F", check_in_at: "2026-10-02T13:00:00-03:00", check_out_at: "2026-10-05T13:00:00-03:00",
    total_amount: 83.7, currency: "BRL", company_name: "Abbapark", location_name: "Aeroporto Afonso Pena",
    location_address: null, parking_type_name: "Vaga Coberta", vehicle: null,
  };
  const m = tplBookingConfirmation(b, "Kallef", "https://movepark.co/bookings/MP-F3FC9F");
  assertStringIncludes(m.html, "O voucher vai em anexo neste e-mail");
});

Deno.test("pdfAttachment: nome do voucher e tipo application/pdf, bytes intactos", () => {
  const bytes = new TextEncoder().encode("%PDF-1.7 fake");
  const a = pdfAttachment("voucher-MP-F3FC9F.pdf", bytes);
  assertEquals(a.filename, "voucher-MP-F3FC9F.pdf");
  assertEquals(a.contentType, "application/pdf");
  assertEquals(a.content, bytes);
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

Deno.test("shell: casco minimalista, marca Movepark pequena e rodapé sem endereço", () => {
  const html = tplLeadReceived("Kallef").html;
  // Marca pequena no topo (wordmark de 16px), sem a faixa violeta com o símbolo branco.
  assertStringIncludes(html, "/brand/logo-movepark-email.png");
  assertStringIncludes(html, "height:16px");
  assertEquals(html.includes("simbolo-movepark-white-email.png"), false);
  // Sem régua de cores, banda de ajuda nem redes sociais.
  assertEquals(html.includes("Ficou com alguma dúvida?"), false);
  assertEquals(html.includes("/brand/social-"), false);
  // Rodapé: razão social sim, endereço da Movepark não (o cliente confundia com o da vaga).
  assertStringIncludes(html, "Movepark Tecnologia Ltda.");
  assertEquals(html.includes("Rua Tito"), false);
  assertEquals(html.includes("05051-000"), false);
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

Deno.test("saque automático: assunto de repasse mensal e taxa por conta da Movepark", () => {
  const base = { contactName: "Kallef Souza", companyName: "Agência Fera", amountCents: 4633, feeCents: 367, expectedAt: "2026-10-10T18:00:00.000Z", accountTail: "5482-1", automatic: true };
  const pedido = tplWithdrawalRequested(base);
  assertStringIncludes(pedido.subject, "Seu repasse mensal de");
  assertStringIncludes(pedido.html, "Sem taxa para você");
  assertStringIncludes(pedido.html, "por conta da Movepark");
  assertEquals(pedido.html.includes("—"), false);
  const caiu = tplWithdrawalPaid({ ...base, paidAt: "2026-10-10T13:05:00.000Z" });
  assertStringIncludes(caiu.subject, "Repasse mensal de");
  assertStringIncludes(caiu.html, "por conta da Movepark");
  const falhou = tplWithdrawalFailed({ ...base, failureReason: "conta inválida" });
  assertStringIncludes(falhou.html, "O repasse automático");
});

Deno.test("tplDuplicatePaymentTeam: lista as cobranças e diz que a reserva segue confirmada", () => {
  const t = tplDuplicatePaymentTeam({
    bookingCode: "MP-07DAE9",
    charges: [
      { chargeId: "ch_kmY2OjpF2sdBZ7Lw", method: "card", amount: 219.7, paidAt: "2026-10-17T12:58:45Z" },
      { chargeId: "ch_yjbZvXwFlEFDQaMd", method: "card", amount: 219.7, paidAt: "2026-10-17T12:58:44Z" },
    ],
  });
  assertEquals(t.subject, "Cobrança em dobro na reserva MP-07DAE9");
  assertStringIncludes(t.html, "ch_kmY2OjpF2sdBZ7Lw");
  assertStringIncludes(t.html, "ch_yjbZvXwFlEFDQaMd");
  assertStringIncludes(t.html, "cartão, R$");
  assertStringIncludes(t.html, "/manager/bookings/MP-07DAE9");
  assertStringIncludes(t.html, "não a cancela");
  assert(!t.html.includes("—"), "sem travessão");
});

// Estorno avulso (19/10/2026): o parceiro não pode ler "foi cancelada" quando a reserva continuou.
Deno.test("tplPartnerDebtCreated: estorno com a reserva mantida não fala em cancelamento", () => {
  const m = tplPartnerDebtCreated({
    contactName: "Pedro Araujo", companyName: "Abbapark", bookingCode: "MP-07DAE9",
    debtCents: 17576, totalDebtCents: 17576, reason: "estorno avulso (reserva mantida): cobrança em dobro", bookingKept: true,
  });
  assertEquals(m.subject.startsWith("Estorno na reserva MP-07DAE9"), true);
  assertStringIncludes(m.html, "A reserva continua de pé.");
  assert(!m.html.includes("foi cancelada"), "não diz que foi cancelada");
});

// Resumo diário do parceiro (20/10/2026).
Deno.test("tplPartnerDailyDigest: entradas, saídas e novas com hora local, placa e detalhes de atendimento", () => {
  const base = {
    timezone: "America/Sao_Paulo", location_name: "Aeroporto Afonso Pena", veiculo: "Onix prata",
    vaga: "Vaga Descoberta", passageiros: null, pcd: false, protecao_voo: false, voo: null, adicionais: [],
  };
  const t = tplPartnerDailyDigest({
    companyName: "Abbapark & Cia",
    dayIso: "2026-10-20",
    entradas: [{
      ...base, code: "MP-AAA111", check_in_at: "2026-10-20T13:00:00Z", check_out_at: "2026-10-23T21:00:00Z",
      cliente: "Ana Souza", placa: "RSM1A23", passageiros: 2, pcd: true, protecao_voo: true, voo: "G3 1234", adicionais: ["Lavagem"],
    }],
    saidas: [{ ...base, code: "MP-BBB222", check_in_at: "2026-10-16T11:00:00Z", check_out_at: "2026-10-21T01:00:00Z", cliente: "Bruno Lima", placa: "XYZ9K87" }],
    novas: [],
  });
  assertEquals(t.subject, "Movimento de hoje: Abbapark & Cia");
  // As contagens saem do assunto e ficam na prévia.
  assertStringIncludes(t.html, "1 entrada e 1 saída</span>");
  assertStringIncludes(t.html, "Abbapark &amp; Cia");
  assertStringIncludes(t.html, "10:00 · Ana Souza");
  assertStringIncludes(t.html, "RSM1A23 · Onix prata · Vaga Descoberta");
  assertStringIncludes(t.html, "2 passageiros · PCD · voo G3 1234 · Superflex com proteção de voo · adicionais: Lavagem");
  assertStringIncludes(t.html, "Sai em 23/10 às 18:00 · MP-AAA111");
  // saída às 22h de Brasília do dia 20 (01h UTC do dia 21)
  assertStringIncludes(t.html, "22:00 · Bruno Lima");
  assertStringIncludes(t.html, "Entrou em 16/10 às 08:00 · MP-BBB222");
  assertStringIncludes(t.html, "Entram hoje (1)");
  assert(!t.html.includes("Reservas novas"), "seção vazia não aparece");
  assertStringIncludes(t.html, "/operator/bookings");
  assert(!t.html.includes("—"), "sem travessão");
});

Deno.test("tplPartnerDailyDigest: só reservas novas; duas unidades mostram o nome da unidade", () => {
  const item = {
    code: "MP-CCC333", check_in_at: "2026-10-25T12:00:00Z", check_out_at: "2026-10-27T12:00:00Z", timezone: "America/Sao_Paulo",
    cliente: null, placa: null, veiculo: null, vaga: "Vaga Coberta", passageiros: null, pcd: null, protecao_voo: null, voo: null, adicionais: null,
  };
  const t = tplPartnerDailyDigest({
    companyName: "Parque", dayIso: "2026-10-20", entradas: [], saidas: [],
    novas: [{ ...item, location_name: "Unidade A" }, { ...item, code: "MP-DDD444", location_name: "Unidade B" }],
  });
  assertEquals(t.subject, "Movimento de hoje: Parque");
  // Parte fixa só com ASCII: não depende de codificar acento no cabeçalho.
  assert(/^[\x20-\x7e]+$/.test(t.subject.replace("Parque", "")), "parte fixa do assunto sem acento");
  assertStringIncludes(t.html, "Cliente · entra 25/10 às 09:00");
  assertStringIncludes(t.html, "placa não informada · Vaga Coberta · Unidade A");
});

Deno.test("tplPartnerDailyDigest: fuso inválido na unidade cai para Brasília em vez de quebrar", () => {
  const t = tplPartnerDailyDigest({
    companyName: "Parque", dayIso: "2026-10-20", saidas: [], novas: [],
    entradas: [{
      code: "MP-EEE555", check_in_at: "2026-10-20T13:00:00Z", check_out_at: "2026-10-21T13:00:00Z", timezone: "Fuso/Errado",
      location_name: null, cliente: "Ana", placa: "AAA1B23", veiculo: null, vaga: null, passageiros: null, pcd: null,
      protecao_voo: null, voo: null, adicionais: null,
    }],
  });
  assertStringIncludes(t.html, "10:00 · Ana");
});

// 30/10/2026: integração com a cancela (docs/specs/integracoes.md § 5.6 e § 5.10).
Deno.test("tplAccessCodeUpdated: voucher novo para a cancela, sem citar o provedor", () => {
  const b = { code: "MP-855347", location_name: "Aeroporto Afonso Pena", check_in_at: "2026-11-04T07:30:00Z", check_out_at: "2026-11-11T02:00:00Z", vehicle: null };
  const m = tplAccessCodeUpdated(b, "Bruno Lima", "https://movepark.co/bookings/MP-855347");
  assertStringIncludes(m.subject, "MP-855347");
  assertStringIncludes(m.html, "Bruno");
  assertStringIncludes(m.html, "abre a cancela do Aeroporto Afonso Pena");
  assertStringIncludes(m.html, "https://movepark.co/bookings/MP-855347");
  assertEquals(/cloudpark/i.test(m.html + m.subject), false, "o cliente não precisa saber o nome do sistema da cancela");
  assertEquals(/[\u2014\u2013]/.test(m.html + m.subject), false);
});

Deno.test("tplIntegrationAlert: reserva, placa, motivo e a ação certa para cada caso", () => {
  const base = {
    bookingCode: "MP-A67A17", providerName: "Cloudpark", locationName: "Aeroporto Afonso Pena",
    checkInAt: "2026-10-31T10:00:00Z", plate: "BBR4H93", error: "Falha de rede <x>",
    bookingUrl: "https://movepark.co/operator/bookings/MP-A67A17",
  };
  const tentando = tplIntegrationAlert({ ...base, retrying: true });
  assertEquals(tentando.subject, "Reserva MP-A67A17 sem QR da Cloudpark");
  assertStringIncludes(tentando.html, "placa BBR4H93");
  assertStringIncludes(tentando.html, "31/10/2026");
  assertStringIncludes(tentando.html, "segue tentando");
  assertStringIncludes(tentando.html, "Falha de rede &lt;x&gt;");
  assertStringIncludes(tentando.html, base.bookingUrl);
  const parou = tplIntegrationAlert({ ...base, retrying: false, error: null, plate: null });
  assertStringIncludes(parou.html, "parou de tentar");
  assertEquals(parou.html.includes("Motivo"), false);
  assertEquals(parou.html.includes("placa"), false);
  for (const m of [tentando, parou]) assertEquals(/[\u2014\u2013]/.test(m.html + m.subject), false);
});

const resumoEquipe = {
  day: "2026-11-09",
  atual: { hub_reservas: 10, hub_receita_cents: 178210, hub_comissao_cents: 30077, hub_cartao: 7, hub_pix: 3,
    wl_reservas: 389, wl_receita_cents: 7687369, clientes_novos: 25, cancelamentos: 0, estornos_cents: 0 },
  semana_passada: { hub_reservas: 5, hub_receita_cents: 0, hub_comissao_cents: 0, hub_cartao: 0, hub_pix: 0,
    wl_reservas: 270, wl_receita_cents: 5682381, clientes_novos: 13, cancelamentos: 0, estornos_cents: 0 },
  canais: [{ canal: "Site do Pare Seguro", reservas: 6, receita_cents: 111150 }, { canal: "hub", reservas: 4, receita_cents: 67060 }],
  compradores: { primeira: 10, recompra: 0 },
  repasses: [{ empresa: "Abbapark", valor_cents: 115785, origem: "automatic", status: "paid" }],
  divida_cents: 0,
  hoje: { entradas: 3, saidas: 3 },
  chamados: { novos: 0, abertos: 0 },
  avaliacoes: { n: 1, media: 2, baixas: [{ unidade: "Unidade <X>", nota: 2, comentario: "Demorou" }] },
  alertas: { leads_parceiro: [{ empresa: "Lead Park", cidade: "Campinas/SP" }], integracao_falhas: 1, cartao_recusado: 2,
    publicacao_ok: false, publicacao_motivo: "sem deploy hook" },
};

Deno.test("teamDigestDelta: percentual contra a semana passada, e sem divisão por zero", () => {
  assertEquals(teamDigestDelta(10, 5), "+100% contra 5 na semana passada");
  assertEquals(teamDigestDelta(389, 270), "+44% contra 270 na semana passada");
  assertEquals(teamDigestDelta(3, 4), "-25% contra 4 na semana passada");
  assertEquals(teamDigestDelta(0, 0), "igual à semana passada");
  assertEquals(teamDigestDelta(178210, 0, true).startsWith("semana passada: R$"), true);
});

Deno.test("tplTeamDailyDigest: assunto com Hub e white-label, blocos, alertas e escape", () => {
  const m = tplTeamDailyDigest(resumoEquipe);
  assertEquals(m.subject.includes("10 reservas no Hub"), true);
  assertEquals(m.subject.includes("389 no white-label"), true);
  for (const t of ["Vendas", "Canais do Hub", "Clientes", "Dinheiro", "Hoje", "Avaliações", "Atenção"]) {
    assertEquals(m.html.includes(t), true, t);
  }
  assertEquals(m.html.includes("Site do Pare Seguro"), true);
  assertEquals(m.html.includes(">Movepark<"), true, "canal hub vira Movepark");
  assertEquals(m.html.includes("Abbapark"), true);
  assertEquals(m.html.includes("repasse automático"), true);
  assertEquals(m.html.includes("A publicação do site está parada: sem deploy hook"), true);
  assertEquals(m.html.includes("1 entrega para integração de parceiro falhou."), true);
  assertEquals(m.html.includes("2 cartões recusados no checkout."), true);
  assertEquals(m.html.includes("Lead de parceiro: Lead Park, Campinas/SP."), true);
  assertEquals(m.html.includes("Unidade &lt;X&gt;"), true, "escapa HTML vindo do banco");
  assertEquals(/[–—]/.test(m.subject + m.html), false, "sem travessão");
});

Deno.test("tplTeamDailyDigest: dia sem nada mostra 'nenhum' e 'Nada pedindo atenção'", () => {
  const vazio = {
    ...resumoEquipe, canais: [], repasses: [], compradores: { primeira: 0, recompra: 0 },
    avaliacoes: { n: 0, media: null, baixas: [] },
    alertas: { leads_parceiro: [], integracao_falhas: 0, cartao_recusado: 0, publicacao_ok: true, publicacao_motivo: null },
  };
  const m = tplTeamDailyDigest(vazio);
  assertEquals(m.html.includes("Nenhuma venda no Hub."), true);
  assertEquals(m.html.includes("Nada pedindo atenção."), true);
  assertEquals(m.html.includes("Nenhuma avaliação nova."), true);
});

// 17/11/2026: troca de datas de reserva paga diz o que aconteceu com o dinheiro.
Deno.test("datas alteradas: diferença paga, devolvida (PIX, cartão) ou na fila manual; sem diferença, nada", () => {
  const b = { code: "MP-ABC123", location_name: "Pare Seguro", location_address: "Av. X, 1", check_in_at: "2026-12-10T12:00:00Z", check_out_at: "2026-12-12T15:30:00Z", vehicle: null };
  assertStringIncludes(tplBookingDatesChanged(b, "Ana", "u", { chargedCents: 5780 }).html, "pagou <strong>R$");
  assertStringIncludes(datesChangedMoneyLine({ refundedCents: 5780, method: "pix" }), "em minutos");
  assertStringIncludes(datesChangedMoneyLine({ refundedCents: 5780, method: "card" }), "duas faturas");
  assertStringIncludes(datesChangedMoneyLine({ refundedCents: 5780, refundManual: true }), "2 dias úteis");
  assertEquals(datesChangedMoneyLine({ chargedCents: 0, refundedCents: 0 }), "");
  assertEquals(datesChangedMoneyLine(null), "");
  for (const m of [{ chargedCents: 100 }, { refundedCents: 100, method: "card" as const }, { refundedCents: 100, refundManual: true }]) {
    assertEquals(/[\u2014\u2013]/.test(datesChangedMoneyLine(m)), false);
  }
});

// E-mail cru montado pela nodemailer (19/11/2026). O denomailer partia o assunto acentuado e
// deixava espaço no fim do "boundary=", e o Outlook clássico da Pare Seguro mostrava o corpo em
// branco. Estes testes travam o formato que o Outlook lê.
function partesDoEmail(raw: string) {
  const fim = raw.indexOf("\r\n\r\n");
  return { cabecalho: raw.slice(0, fim), corpo: raw.slice(fim + 4) };
}

function decodificaPartes(raw: string): { tipo: string; conteudo: Uint8Array }[] {
  // Cada parte começa depois de uma linha "--boundary"; cabeçalho e corpo separados por linha vazia.
  return raw.split(/\r\n--[^\r\n]+\r\n/).slice(1).flatMap((parte) => {
    const fim = parte.indexOf("\r\n\r\n");
    if (fim < 0) return [];
    const cab = parte.slice(0, fim);
    if (!/Content-Transfer-Encoding: base64/.test(cab)) return [];
    const tipo = cab.match(/Content-Type: ([^;\r\n]+)/)?.[1] ?? "";
    const corpo = parte.slice(fim + 4).split("\r\n--")[0].replaceAll("\r\n", "");
    return [{ tipo, conteudo: decodeBase64(corpo) }];
  });
}

Deno.test("composeRawEmail: assunto acentuado e longo sai codificado, sem linha solta no cabeçalho", async () => {
  const subject = "Pare Seguro, movimento de hoje: 3 entradas, 2 saídas e 8 reservas novas";
  const raw = await composeRawEmail({ from: "contato@movepark.co", to: "a@b.com", subject, html: "<p>oi</p>" });
  const { cabecalho } = partesDoEmail(raw);
  assert(/^[\x20-\x7e\r\n\t]*$/.test(cabecalho), "cabeçalho só com ASCII");
  for (const linha of cabecalho.split("\r\n")) {
    assert(/^[A-Za-z-]+: |^[ \t]/.test(linha), `linha de cabeçalho bem formada: ${linha}`);
    assert(linha.length <= 998, "linha dentro do limite da RFC 5322");
  }
  assertStringIncludes(cabecalho, "Subject: =?UTF-8?");
});

Deno.test("composeRawEmail: separador das partes entre aspas e sem espaço sobrando (Outlook clássico)", async () => {
  const raw = await composeRawEmail({ from: "contato@movepark.co", to: "a@b.com", subject: "Teste", html: "<p>oi</p>" });
  const boundaries = [...raw.matchAll(/boundary="([^"]+)"/g)].map((m) => m[1]);
  assert(boundaries.length >= 1, "boundary declarado entre aspas");
  for (const linha of raw.split("\r\n")) {
    assert(!/boundary=\S+\s+$/.test(linha), `boundary sem espaço no fim: ${linha}`);
  }
  for (const b of boundaries) assertStringIncludes(raw, `\r\n--${b}--`);
  assertStringIncludes(raw, "multipart/alternative");
});

Deno.test("composeRawEmail: HTML em base64 preserva link longo e nenhuma linha começa com ponto", async () => {
  // Link real que quebrou em 10/07/2026: o ponto do domínio era comido no dot-stuffing (NXDOMAIN).
  const link =
    "https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/verify?token=9872e9be6a60a81f2c000477706ff7ab52dc530f975d1452b1957760&type=magiclink&redirect_to=https://hub.movepark.co/onboarding";
  const html = tplApprovalInvite("Léo", link).html;
  const raw = await composeRawEmail({ from: "contato@movepark.co", to: "a@b.com", subject: "Aprovado", html });
  for (const linha of partesDoEmail(raw).corpo.split("\r\n")) {
    assert(!linha.startsWith("."), `linha não pode começar com ponto: ${linha.slice(0, 12)}`);
  }
  const htmlParte = decodificaPartes(raw).find((p) => p.tipo === "text/html");
  assert(htmlParte, "parte text/html em base64");
  const decodificado = new TextDecoder().decode(htmlParte.conteudo);
  assertEquals(decodificado, html);
  assertStringIncludes(decodificado, link);
});

Deno.test("composeRawEmail: anexo PDF vai inteiro, como application/pdf", async () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0xff, 0x00, 0x2e]);
  const raw = await composeRawEmail({
    from: "contato@movepark.co", to: "a@b.com", subject: "Voucher", html: "<p>oi</p>",
    attachments: [pdfAttachment("voucher-MP-F3FC9F.pdf", bytes)],
  });
  assertStringIncludes(raw, "multipart/mixed");
  assertStringIncludes(raw, 'filename=voucher-MP-F3FC9F.pdf');
  const pdf = decodificaPartes(raw).find((p) => p.tipo === "application/pdf");
  assert(pdf, "parte application/pdf em base64");
  assertEquals(pdf.conteudo, bytes);
});

// Eventos do SES (19/11/2026): o resumo da Pare Seguro sumiu por dias sem ninguém no Hub ver.
Deno.test("teamDigestEmailAlert: devolução, temporária, reclamação e recusa", () => {
  assertEquals(
    teamDigestEmailAlert({ destinatario: "a@ex.com", tipo: "bounce", bounce_type: "Permanent", assunto: "Movimento de hoje: X", n: 3 }),
    'E-mail para a@ex.com devolveu (3 vezes), último assunto "Movimento de hoje: X".',
  );
  assertEquals(
    teamDigestEmailAlert({ destinatario: "a@ex.com", tipo: "bounce", bounce_type: "Transient", assunto: null, n: 1 }),
    "E-mail para a@ex.com devolveu temporariamente.",
  );
  assertStringIncludes(teamDigestEmailAlert({ destinatario: "c@ex.com", tipo: "complaint", bounce_type: "abuse", assunto: null, n: 1 }), "como spam");
  assertStringIncludes(teamDigestEmailAlert({ destinatario: "c@ex.com", tipo: "reject", bounce_type: null, assunto: null, n: 1 }), "O SES recusou");
});

Deno.test("tplTeamDailyDigest: e-mail devolvido entra em Atenção, escapado", () => {
  const m = tplTeamDailyDigest({
    ...resumoEquipe,
    alertas: { ...resumoEquipe.alertas, emails_problema: [{ destinatario: "x<y>@ex.com", tipo: "bounce", bounce_type: "Permanent", assunto: "Oi", n: 2 }] },
  });
  assertStringIncludes(m.html, "E-mail para x&lt;y&gt;@ex.com devolveu (2 vezes)");
  const vazio = tplTeamDailyDigest({
    ...resumoEquipe,
    alertas: { leads_parceiro: [], integracao_falhas: 0, cartao_recusado: 0, publicacao_ok: true, publicacao_motivo: null, emails_problema: [] },
  });
  assertStringIncludes(vazio.html, "Nada pedindo atenção.");
});

Deno.test("composeRawEmail: header do configuration set só quando SES_CONFIGURATION_SET existe", async () => {
  const args = { from: "contato@movepark.co", to: "a@ex.com", subject: "Teste", html: "<p>oi</p>" };
  const antes = Deno.env.get("SES_CONFIGURATION_SET");
  try {
    Deno.env.delete("SES_CONFIGURATION_SET");
    assertEquals(/X-SES-CONFIGURATION-SET/i.test(await composeRawEmail(args)), false);
    Deno.env.set("SES_CONFIGURATION_SET", "movepark-eventos");
    // A nodemailer grafa "X-Ses-Configuration-Set"; nome de header não diferencia maiúscula.
    assertEquals(/^X-SES-CONFIGURATION-SET: movepark-eventos\r$/im.test(await composeRawEmail(args)), true);
  } finally {
    if (antes === undefined) Deno.env.delete("SES_CONFIGURATION_SET");
    else Deno.env.set("SES_CONFIGURATION_SET", antes);
  }
});

const PS: VoucherBooking = {
  code: "MP-PS0001",
  check_in_at: "2026-12-01T10:00:00-03:00",
  check_out_at: "2026-12-05T10:00:00-03:00",
  total_amount: 200,
  company_name: "Pare Seguro",
  location_name: "Aeroporto de Guarulhos",
  location_address: "Av. Monteiro Lobato, 2738, Guarulhos",
  parking_type_name: "Vaga coberta",
  vehicle: null,
};

Deno.test("tplBookingConfirmation: endereço da unidade com Como chegar, e nenhum endereço da Movepark", () => {
  const m = tplBookingConfirmation(PS, "Ana", "https://movepark.co/bookings/MP-PS0001");
  assertStringIncludes(m.html, "Av. Monteiro Lobato, 2738, Guarulhos");
  assertStringIncludes(m.html, "https://www.google.com/maps/search/?api=1&amp;query=Av.%20Monteiro%20Lobato");
  assertEquals(m.html.includes("Rua Tito"), false);
  // Sem logo, o nome do estacionamento vai em texto no bloco.
  assertStringIncludes(m.html, "Pare Seguro · Aeroporto de Guarulhos");
});

Deno.test("e-mail de reserva: logo colorido do parceiro no topo e Movepark no rodapé", () => {
  const m = tplBookingConfirmation(
    { ...PS, parking_logo: { light: "https://cdn.test/ps.png", dark: "https://cdn.test/ps-branco.png" } },
    null,
    "https://movepark.co/bookings/MP-PS0001",
  );
  const logo = m.html.indexOf('src="https://cdn.test/ps.png"');
  const titulo = m.html.indexOf("<h1");
  const movepark = m.html.indexOf("/brand/logo-movepark-email.png");
  const rodape = m.html.indexOf("Central de Ajuda</a>");
  assert(logo > 0 && logo < titulo, "o logo do parceiro abre o e-mail");
  assert(movepark > titulo && movepark < rodape, "a Movepark vai no rodapé");
  assertEquals(m.html.match(/logo-movepark-email\.png/g)?.length, 1);
  assertEquals(m.html.includes("ps-branco.png"), false);
});

Deno.test("e-mail de reserva sem logo: o nome do parceiro no topo, Movepark no rodapé", () => {
  const m = tplBookingReminderCheckin(
    { code: "MP-1", location_name: "Aeroporto de Guarulhos", check_in_at: PS.check_in_at, check_out_at: PS.check_out_at, company_name: "Pare Seguro", parking_logo: { light: null, dark: null } },
    "Ana",
    "https://movepark.co/bookings/MP-1",
  );
  assert(m.html.indexOf(">Pare Seguro</p>") < m.html.indexOf("<h1"));
  assert(m.html.indexOf("/brand/logo-movepark-email.png") > m.html.indexOf("<h1"));
});

Deno.test("e-mail sem parceiro (lead, equipe): a Movepark segue no topo", () => {
  const html = tplLeadReceived("Kallef").html;
  assert(html.indexOf("/brand/logo-movepark-email.png") < html.indexOf("<h1"));
});

Deno.test("tplReviewRequest: com o parceiro, o logo dele abre o e-mail", () => {
  const m = tplReviewRequest("Ana", "Aeroporto de Guarulhos", "https://movepark.co/bookings/MP-1", {
    company_name: "Pare Seguro",
    parking_logo: { light: "https://cdn.test/ps.png", dark: null },
  });
  assert(m.html.indexOf("https://cdn.test/ps.png") < m.html.indexOf("<h1"));
});

Deno.test("tplBookingConfirmation: foto da fachada e mapa lado a lado, o mapa abre o Maps", () => {
  const m = tplBookingConfirmation(
    { ...PS, email_photo_url: "https://movepark.co/f.jpg", email_map_url: "https://maps.googleapis.com/maps/api/staticmap?x=1" },
    null,
    "https://movepark.co/bookings/MP-PS0001",
  );
  assertStringIncludes(m.html, 'src="https://movepark.co/f.jpg"');
  assertStringIncludes(m.html, 'src="https://maps.googleapis.com/maps/api/staticmap?x=1"');
  assertEquals((m.html.match(/class="mp-col"/g) ?? []).length, 2);
  assertEquals(m.html.includes("Ver no mapa"), false);
});

Deno.test("tplBookingConfirmation: sem chave de mapa, cartão de endereço no lugar da miniatura", () => {
  const m = tplBookingConfirmation(
    { ...PS, email_photo_url: "https://movepark.co/f.jpg", email_map_url: null },
    null,
    "https://movepark.co/bookings/MP-PS0001",
  );
  assertStringIncludes(m.html, "Ver no mapa");
  assertStringIncludes(m.html, "Abrir no Google Maps");
  // O endereço não se repete embaixo quando o cartão já o mostra.
  assertEquals((m.html.match(/Av\. Monteiro Lobato/g) ?? []).length, 1);
});

Deno.test("tplBookingConfirmation: sem foto, sem mapa e sem endereço, o bloco não deixa buraco", () => {
  const m = tplBookingConfirmation({ ...PS, location_address: null }, null, "https://movepark.co/bookings/MP-PS0001");
  assertEquals(m.html.includes("mp-col\""), false);
  assertEquals(m.html.includes("Como chegar"), false);
  assertEquals(m.html.includes("Ver no mapa"), false);
});

const AVISO_MALAS =
  "**Malas extras são cobradas pelo estacionamento.**\nA van do traslado tem espaço limitado para bagagem.\n- Acima do limite, taxa por mala, paga na chegada\n- Veja as [regras](https://exemplo.com/regras)";

Deno.test("tplBookingConfirmation: aviso do estacionamento entre o bloco da unidade e o resumo, em HTML escapado", () => {
  const m = tplBookingConfirmation({ ...PS, partner_notice_md: AVISO_MALAS }, "Ana", "https://movepark.co/bookings/MP-PS0001");
  const titulo = m.html.indexOf("Aviso do estacionamento");
  const unidade = m.html.indexOf("Pare Seguro · Aeroporto de Guarulhos");
  const resumo = m.html.indexOf(">Reserva</td>");
  assert(titulo > 0, "o bloco tem título");
  assert(unidade < titulo && titulo < resumo, "vem depois da unidade e antes do resumo da reserva");
  assertStringIncludes(m.html, "<strong style=\"color:#29263F;\">Malas extras são cobradas pelo estacionamento.</strong>");
  assertStringIncludes(m.html, "<li style=\"margin:0 0 4px;\">Acima do limite, taxa por mala, paga na chegada</li>");
  assertStringIncludes(m.html, '<a href="https://exemplo.com/regras" target="_blank"');
  assertEquals(m.html.includes("—"), false);
});

Deno.test("tplBookingConfirmation: sem aviso (nulo ou só espaço) o bloco não existe, nem o título", () => {
  for (const vazio of [undefined, null, "", "  \n "]) {
    const m = tplBookingConfirmation({ ...PS, partner_notice_md: vazio }, "Ana", "https://movepark.co/bookings/MP-PS0001");
    assertEquals(m.html.includes("Aviso do estacionamento"), false, `vazio=${JSON.stringify(vazio)}`);
  }
});

Deno.test("partnerNoticeBlock: HTML cru no aviso sai como texto, nunca como tag", () => {
  const html = partnerNoticeBlock({ partner_notice_md: 'Aviso <img src=x onerror="alert(1)"> **ok**' });
  assertEquals(html.includes("<img"), false);
  assertStringIncludes(html, "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});
