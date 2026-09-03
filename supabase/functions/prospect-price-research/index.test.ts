import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  htmlParaTexto,
  parseExtracao,
  robotsPermite,
  selectCandidatos,
} from "./logic.ts";

const NOW = new Date("2026-11-12T12:00:00Z");
const ficha = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  name: "Park Confins",
  google_place_id: "ChIJ1",
  researched_at: null,
  ...over,
}) as Parameters<typeof selectCandidatos>[0][number];

Deno.test("selectCandidatos: ficha sem preço nenhum entra na frente", () => {
  const fichas = [
    ficha({ id: "com", name: "Com preço", researched_at: "2026-09-01" }),
    ficha({ id: "sem", name: "Sem preço", researched_at: null }),
  ];
  assertEquals(
    selectCandidatos(fichas, [], NOW).map((f) => f.id),
    ["sem", "com"],
  );
});

Deno.test("selectCandidatos: preço longe do vencimento não gasta passada", () => {
  // Pesquisado em 05/11, vence em 03/02: 83 dias de folga, muito além dos 30.
  const fichas = [ficha({ researched_at: "2026-11-05" })];
  assertEquals(selectCandidatos(fichas, [], NOW), []);
});

Deno.test("selectCandidatos: a 30 dias do vencimento, entra", () => {
  // Pesquisado em 15/08, vence em 13/11: um dia de folga.
  const fichas = [ficha({ researched_at: "2026-08-15" })];
  assertEquals(selectCandidatos(fichas, [], NOW).length, 1);
});

Deno.test("selectCandidatos: ficha sem place_id fica fora (é por ele que o site é achado)", () => {
  assertEquals(selectCandidatos([ficha({ google_place_id: null })], [], NOW), []);
});

Deno.test("selectCandidatos: proposta em aberto bloqueia, senão a semana seguinte cria a segunda", () => {
  const propostas = [
    { prospect_location_id: "f1", status: "pending", created_at: "2026-11-05T00:00:00Z" },
  ];
  assertEquals(selectCandidatos([ficha()], propostas, NOW), []);
});

Deno.test("selectCandidatos: falha recente segura a ficha por 30 dias, depois solta", () => {
  const recente = [
    { prospect_location_id: "f1", status: "failed", created_at: "2026-11-01T00:00:00Z" },
  ];
  const antiga = [
    { prospect_location_id: "f1", status: "failed", created_at: "2026-09-01T00:00:00Z" },
  ];
  assertEquals(selectCandidatos([ficha()], recente, NOW), []);
  assertEquals(selectCandidatos([ficha()], antiga, NOW).length, 1);
});

Deno.test("selectCandidatos: respeita o teto da passada", () => {
  const fichas = Array.from({ length: 20 }, (_, i) =>
    ficha({ id: `f${i}`, name: `Lote ${String(i).padStart(2, "0")}` }),
  );
  assertEquals(selectCandidatos(fichas, [], NOW).length, 8);
});

Deno.test("robotsPermite: sem regra para o caminho, libera", () => {
  assertEquals(robotsPermite("User-agent: *\nDisallow: /admin", "/precos", "MoveparkPriceBot"), true);
});

Deno.test("robotsPermite: Disallow que casa o caminho bloqueia", () => {
  assertEquals(robotsPermite("User-agent: *\nDisallow: /precos", "/precos", "MoveparkPriceBot"), false);
});

Deno.test("robotsPermite: Disallow vazio libera tudo, por definição do formato", () => {
  assertEquals(robotsPermite("User-agent: *\nDisallow:", "/qualquer", "MoveparkPriceBot"), true);
});

Deno.test("robotsPermite: Allow mais específico vence o Disallow", () => {
  const txt = "User-agent: *\nDisallow: /\nAllow: /precos";
  assertEquals(robotsPermite(txt, "/precos", "MoveparkPriceBot"), true);
  assertEquals(robotsPermite(txt, "/outra", "MoveparkPriceBot"), false);
});

Deno.test("robotsPermite: grupo do nosso agente vence o grupo geral", () => {
  const txt = "User-agent: *\nDisallow:\n\nUser-agent: MoveparkPriceBot\nDisallow: /";
  assertEquals(robotsPermite(txt, "/precos", "MoveparkPriceBot"), false);
});

Deno.test("robotsPermite: comentário e linha solta não confundem o parser", () => {
  const txt = "# nada aqui\nUser-agent: *   # geral\nDisallow: /interno\nSitemap: /s.xml";
  assertEquals(robotsPermite(txt, "/interno/x", "MoveparkPriceBot"), false);
  assertEquals(robotsPermite(txt, "/precos", "MoveparkPriceBot"), true);
});

Deno.test("htmlParaTexto: script e style saem inteiros", () => {
  const html = `<style>.a{content:"R$ 999"}</style><script>var p="R$ 888"</script><p>R$ 35,00</p>`;
  const txt = htmlParaTexto(html);
  assertEquals(txt.includes("999"), false);
  assertEquals(txt.includes("888"), false);
  assertEquals(txt.includes("R$ 35,00"), true);
});

Deno.test("htmlParaTexto: tag no meio do número vira espaço, não emenda", () => {
  assertEquals(htmlParaTexto("<b>R$ 35</b><span>,90</span>"), "R$ 35 ,90");
});

Deno.test("parseExtracao: número sem trecho que o sustente não vira proposta", () => {
  const r = parseExtracao({ daily_brl: 35, evidence: "", notes: "" });
  assertEquals(r.daily_brl, null);
  assertEquals(r.evidence, null);
});

Deno.test("parseExtracao: valor absurdo é leitura errada, não preço", () => {
  const r = parseExtracao({ daily_brl: 9999, evidence: "diária R$ 9999" });
  assertEquals(r.daily_brl, null);
});

Deno.test("parseExtracao: zero e negativo caem fora", () => {
  assertEquals(parseExtracao({ daily_brl: 0, evidence: "x" }).daily_brl, null);
  assertEquals(parseExtracao({ weekly_brl: -10, evidence: "x" }).weekly_brl, null);
});

Deno.test("parseExtracao: duração sem preço volta nula, sem extrapolar a diária", () => {
  const r = parseExtracao({ daily_brl: "34,90", evidence: "Diária: R$ 34,90" });
  assertEquals(r.daily_brl, 34.9);
  assertEquals(r.weekly_brl, null);
  assertEquals(r.monthly_brl, null);
});

Deno.test("parseExtracao: página sem tabela explica em notes", () => {
  const r = parseExtracao({ evidence: null, notes: null });
  assertEquals(r.daily_brl, null);
  assertEquals(r.notes, "A página lida não publica tabela de preço.");
});
