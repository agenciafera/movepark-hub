// Regras da entrada da fila do Instagram. O que passa daqui vira linha em social_post.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  caminhoNoBucket,
  chaveConfere,
  draftKey,
  lerRascunho,
  podeCorrigirLegenda,
  podeReenviar,
  urlPublica,
} from "./logic.ts";

const BOM = {
  origem: "preco-do-estacionamento-no-aeroporto-de-confins",
  corte: 2,
  destination: "aeroporto-de-confins",
  keyphrase: "estacionamento no aeroporto de Confins",
  publicar_em: "2026-10-28T12:00:00-03:00",
  cta_url: "https://movepark.co/destinos/aeroporto-de-confins?utm_source=instagram",
  price_date: "2026-10-21",
  caption: "Legenda do post.",
  slides: [
    { arquivo: "preco-estacionamento-aeroporto-confins-01.jpg", alt: "pátio", texto: "R$ 45 a diária" },
    { arquivo: "preco-estacionamento-aeroporto-confins-02.jpg", alt: "van", texto: null },
  ],
};

Deno.test("rascunho bom é lido e a data vira ISO em UTC", () => {
  const r = lerRascunho(BOM);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.rascunho.publicarEm, "2026-10-28T15:00:00.000Z");
    assertEquals(r.rascunho.corte, 2);
    assertEquals(r.rascunho.slides.length, 2);
  }
});

Deno.test("origem é obrigatória e em kebab-case", () => {
  for (const origem of [undefined, "", "Preço Confins", "confins_preco"]) {
    const r = lerRascunho({ ...BOM, origem });
    assertEquals(r.ok, false, String(origem));
  }
});

Deno.test("publicar_em sem fuso é recusado, porque a hora mudaria de sentido", () => {
  assertEquals(lerRascunho({ ...BOM, publicar_em: "2026-10-28T12:00:00" }).ok, false);
  assertEquals(lerRascunho({ ...BOM, publicar_em: "amanhã" }).ok, false);
});

Deno.test("corte fora de 1 a 4 é recusado; sem corte vale", () => {
  assertEquals(lerRascunho({ ...BOM, corte: 5 }).ok, false);
  const sem = lerRascunho({ ...BOM, corte: undefined });
  assertEquals(sem.ok && sem.rascunho.corte, null);
});

Deno.test("arquivo do slide precisa ser kebab-case .jpg e não repetir", () => {
  assertEquals(lerRascunho({ ...BOM, slides: [{ arquivo: "Slide 1.png" }] }).ok, false);
  assertEquals(lerRascunho({ ...BOM, slides: [BOM.slides[0], BOM.slides[0]] }).ok, false);
  assertEquals(lerRascunho({ ...BOM, slides: [] }).ok, false);
});

Deno.test("price_date fora do formato é recusada", () => {
  assertEquals(lerRascunho({ ...BOM, price_date: "21/10/2026" }).ok, false);
});

Deno.test("chave do rascunho, caminho no bucket e URL com versão", () => {
  assertEquals(draftKey("confins", 2), "confins:2");
  assertEquals(draftKey("confins", null), "confins:0");
  assertEquals(caminhoNoBucket("confins", "a.jpg"), "social/confins/a.jpg");
  assertEquals(
    urlPublica("https://x.supabase.co/", "social/confins/a.jpg", "abc"),
    "https://x.supabase.co/storage/v1/object/public/assets-public/social/confins/a.jpg?v=abc",
  );
});

Deno.test("só rascunho esperando aprovação é sobrescrito; legenda corrige até aprovado", () => {
  assertEquals(podeReenviar("pending_review"), true);
  assertEquals(podeReenviar("approved"), false);
  assertEquals(podeCorrigirLegenda("approved"), true);
  assertEquals(podeCorrigirLegenda("published"), false);
});

Deno.test("chave confere só quando configurada e igual", () => {
  assertEquals(chaveConfere("k", "k"), true);
  assertEquals(chaveConfere("k", "x"), false);
  assertEquals(chaveConfere(undefined, null), false);
});
