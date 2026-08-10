// deno test: partes puras do cliente WL.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAvailabilityUrl,
  normalizeWlDomain,
  parseAvailabilityResponse,
  parseCategories,
  parseCategoryProducts,
  parseMinimumStayDays,
  wlReady,
} from "./client.ts";

Deno.test("normalizeWlDomain tira protocolo/path/caixa", () => {
  assertEquals(
    normalizeWlDomain("https://ferapark.movepark.com.br/api/v3/backend"),
    "ferapark.movepark.com.br",
  );
  assertEquals(normalizeWlDomain("FeraPark.Movepark.com.br/"), "ferapark.movepark.com.br");
  assertEquals(normalizeWlDomain(""), null);
  assertEquals(normalizeWlDomain(null), null);
});

Deno.test("wlReady exige toggle + domínio + tenant", () => {
  assertEquals(wlReady({ wl_domain: "x.com", wl_tenant_key: "t", wl_sync_enabled: true }), true);
  assertEquals(wlReady({ wl_domain: "x.com", wl_tenant_key: "t", wl_sync_enabled: false }), false);
  assertEquals(wlReady({ wl_domain: null, wl_tenant_key: "t", wl_sync_enabled: true }), false);
  assertEquals(wlReady({ wl_domain: "x.com", wl_tenant_key: null, wl_sync_enabled: true }), false);
});

Deno.test("buildAvailabilityUrl monta query com path fixo", () => {
  const url = buildAvailabilityUrl("ferapark.movepark.com.br", {
    category_slug: "unidade-aeroporto",
    product_slug: "vaga-coberta",
    start_date: "2026-06-22",
    end_date: "2026-07-05",
  });
  assertEquals(
    url,
    "https://ferapark.movepark.com.br/api/v3/backend/availability?category_slug=unidade-aeroporto&product_slug=vaga-coberta&start_date=2026-06-22&end_date=2026-07-05",
  );
});

Deno.test("buildAvailabilityUrl omite product/end opcionais", () => {
  const url = buildAvailabilityUrl("x.com", { category_slug: "c", start_date: "2026-06-22" });
  assertEquals(url, "https://x.com/api/v3/backend/availability?category_slug=c&start_date=2026-06-22");
});

Deno.test("parseAvailabilityResponse aceita array, {data} e {days}", () => {
  const row = { date: "2026-06-22", capacity: 1100, sold_wl: 3, sold_external: 1, available: 1096 };
  const expected = [{ date: "2026-06-22", capacity: 1100, sold_wl: 3, sold_external: 1, available: 1096 }];
  assertEquals(parseAvailabilityResponse([row]), expected);
  assertEquals(parseAvailabilityResponse({ data: [row] }), expected);
  assertEquals(parseAvailabilityResponse({ days: [row] }), expected);
  assertEquals(parseAvailabilityResponse(null), []);
  assertEquals(parseAvailabilityResponse({}), []);
});

Deno.test("parseAvailabilityResponse extrai data.units[].days[] (shape real do WL)", () => {
  const json = {
    data: {
      category_slug: "virapark",
      units: [
        {
          product_slug: "vaga-coberta",
          days: [
            { date: "2026-06-22", capacity: 1100, sold_wl: 834, sold_external: 0, available: 266 },
            { date: "2026-06-23", capacity: 1100, sold_wl: 767, sold_external: 0, available: 333 },
          ],
        },
      ],
    },
  };
  assertEquals(parseAvailabilityResponse(json), [
    { date: "2026-06-22", capacity: 1100, sold_wl: 834, sold_external: 0, available: 266 },
    { date: "2026-06-23", capacity: 1100, sold_wl: 767, sold_external: 0, available: 333 },
  ]);
});

Deno.test("parseAvailabilityResponse filtra a unidade pelo product_slug pedido", () => {
  const json = {
    data: {
      units: [
        { product_slug: "vaga-coberta", days: [{ date: "2026-06-22", sold_wl: 834 }] },
        { product_slug: "vaga-descoberta", days: [{ date: "2026-06-22", sold_wl: 12 }] },
      ],
    },
  };
  // pedindo coberta, NÃO pode vir a descoberta (evita sobrescrever sold_wl da mesma data)
  assertEquals(parseAvailabilityResponse(json, "vaga-coberta"), [
    { date: "2026-06-22", capacity: 0, sold_wl: 834, sold_external: 0, available: 0 },
  ]);
  // sem product_slug → comportamento antigo (todas as unidades)
  assertEquals(parseAvailabilityResponse(json).length, 2);
});

Deno.test("parseAvailabilityResponse coage tipos/ausências", () => {
  assertEquals(parseAvailabilityResponse([{ date: "2026-06-22" }]), [
    { date: "2026-06-22", capacity: 0, sold_wl: 0, sold_external: 0, available: 0 },
  ]);
});

Deno.test("parseCategories desembrulha {data:[...]} e filtra sem slug", () => {
  assertEquals(parseCategories({ data: [{ slug: "unidade-aeroporto", name: "Unidade aeroporto" }] }), [
    { slug: "unidade-aeroporto", name: "Unidade aeroporto" },
  ]);
  // sem name → usa slug; sem slug → descartado
  assertEquals(parseCategories({ data: [{ slug: "x" }, { name: "sem slug" }] }), [
    { slug: "x", name: "x" },
  ]);
  assertEquals(parseCategories(null), []);
});

Deno.test("parseCategoryProducts pega data.products aninhado e injeta a categoria", () => {
  const json = {
    data: {
      slug: "unidade-aeroporto",
      products: [
        { slug: "vaga-coberta", name: "Vaga coberta" },
        { slug: "vaga-descoberta", name: "Vaga descoberta" },
      ],
    },
  };
  assertEquals(parseCategoryProducts(json, "unidade-aeroporto"), [
    { slug: "vaga-coberta", name: "Vaga coberta", category_slug: "unidade-aeroporto" },
    { slug: "vaga-descoberta", name: "Vaga descoberta", category_slug: "unidade-aeroporto" },
  ]);
  assertEquals(parseCategoryProducts({ data: {} }, "u"), []);
  assertEquals(parseCategoryProducts(null, "u"), []);
});

Deno.test("parseMinimumStayDays lê o piso do 400 do parceiro", () => {
  // Corpo REAL do Abbapark, byte a byte, capturado em 10/08/2026 pedindo 1 diária. Repare nos
  // `í`: o October escapa os acentos, e é por isso que este teste não pode ser escrito com
  // `JSON.stringify` de um objeto com "í" (o stringify preserva o acento e o servidor não).
  // A primeira versão do parser passava naquele teste e falhava nas dez vagas de produção.
  const body =
    '{"errors":{"message":"Oops! Parece que algo deu errado. Por favor, verifique os campos ' +
    'abaixo e corrija os erros indicados.","fields":[{"field":"reservas",' +
    '"message":"Per\\u00edodo m\\u00ednimo de perman\\u00eancia: 3 dia(s)"}]}}';
  assertEquals(parseMinimumStayDays(body), 3);
});

Deno.test("parseMinimumStayDays também acha o piso quando o corpo não é JSON", () => {
  // Rede de segurança para o dia em que o parceiro devolver página de exceção em HTML.
  assertEquals(parseMinimumStayDays("<h1>Período mínimo de permanência: 4 dia(s)</h1>"), 4);
});

Deno.test("parseMinimumStayDays aguenta o texto sem acento e com espaçamento solto", () => {
  // O texto vem do painel do parceiro, então é editável por ele. O que não pode acontecer é a
  // troca de um acento derrubar a amostragem inteira da vaga.
  assertEquals(parseMinimumStayDays("Periodo minimo de permanencia:  2 dias"), 2);
  assertEquals(parseMinimumStayDays("Período mínimo de permanência: 10 dia(s)"), 10);
});

Deno.test("parseMinimumStayDays devolve null no que não é recusa por estadia", () => {
  assertEquals(parseMinimumStayDays('{"errors":{"message":"Produto indisponível"}}'), null);
  assertEquals(parseMinimumStayDays("<html>500</html>"), null);
  // Zero não é piso: seria um "mínimo" que não restringe nada e viraria laço infinito.
  assertEquals(parseMinimumStayDays("Período mínimo de permanência: 0 dia(s)"), null);
});
