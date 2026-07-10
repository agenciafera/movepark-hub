import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { decodeBase64 } from "jsr:@std/encoding/base64";
import { htmlToBase64, siteUrl, tplApprovalInvite, tplLeadAlert, tplLeadReceived, tplRejection, tplReviewRequest } from "./email.ts";

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
