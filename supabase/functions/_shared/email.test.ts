import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { decodeBase64 } from "jsr:@std/encoding/base64";
import { htmlToBase64, siteUrl, tplApprovalInvite, tplBookingConfirmation, tplLeadAlert, tplLeadReceived, tplRejection, tplReviewRequest } from "./email.ts";
import type { VoucherBooking } from "./voucher/fields.ts";

Deno.test("siteUrl remove barra(s) final(is)", () => {
  Deno.env.set("PUBLIC_SITE_URL", "https://hub.movepark.co//");
  assertEquals(siteUrl(), "https://hub.movepark.co");
  Deno.env.delete("PUBLIC_SITE_URL");
});

Deno.test("siteUrl cai no localhost sem env", () => {
  Deno.env.delete("PUBLIC_SITE_URL");
  assertEquals(siteUrl(), "http://localhost:5173");
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
