import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { siteUrl, tplApprovalInvite, tplLeadAlert, tplLeadReceived, tplRejection, tplReviewRequest } from "./email.ts";

Deno.test("siteUrl remove barra(s) final(is)", () => {
  Deno.env.set("PUBLIC_SITE_URL", "https://hub.movepark.co//");
  assertEquals(siteUrl(), "https://hub.movepark.co");
  Deno.env.delete("PUBLIC_SITE_URL");
});

Deno.test("siteUrl cai no localhost sem env", () => {
  Deno.env.delete("PUBLIC_SITE_URL");
  assertEquals(siteUrl(), "http://localhost:5173");
});

Deno.test("tplLeadReceived: assunto + nome no corpo", () => {
  const m = tplLeadReceived("Kallef");
  assertStringIncludes(m.subject, "Recebemos seu cadastro");
  assertStringIncludes(m.html, "Kallef");
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
