/**
 * O índice de preços em JSON, pronto para agente ler sem raspar HTML.
 *
 * Mesma matriz da página `/precos`: aeroporto, unidade, tipo de vaga, faixa de
 * permanência, total, balcão, distância e traslado, com URL absoluta e o preço
 * por diária já calculado. O campo que importa para desempate é o
 * `price_updated_at` de cada unidade: é a data da tabela daquele parceiro, e é o
 * que responde "qual fonte está mais nova" quando duas divergem.
 *
 * Puro de propósito (nenhuma rede, nenhum `fs`): o dado chega pronto do
 * `generate-geo-artifacts.mjs`, e o formato tem teste próprio
 * (`price-index-json.test.mjs`). A gramática de URL entra por injeção
 * (`urlDestino`/`urlPrecos`) para não virar uma terceira cópia do que já mora em
 * `src/lib/urls.ts` e no script do build.
 *
 * Ver docs/specs/indice-precos.md.
 */

/** Versão do formato. Campo novo não sobe; remoção ou troca de significado sobe. */
export const PRICE_INDEX_VERSION = 1;

const round2 = (n) => Math.round(n * 100) / 100;

/** Moto compara com moto: fica no `units`, fora do "mais barato". */
const ehCarro = (u) => u.parking_type_code !== "motorcycle";

const totalDe = (u, dias) => (u.prices ?? []).find((p) => p.days === dias)?.total ?? null;

function unidadeJson(u, siteUrl) {
  return {
    company_slug: u.company_slug,
    company_name: u.company_name,
    location_slug: u.location_slug,
    location_name: u.location_public_name ?? u.location_name,
    parking_type_code: u.parking_type_code,
    parking_type_name: u.parking_type_name,
    url: u.public_path ? `${siteUrl}${u.public_path}` : null,
    checkout_mode: u.checkout_mode,
    distance_m: u.distance_m ?? null,
    has_shuttle: u.has_shuttle ?? false,
    shuttle_minutes: u.shuttle_minutes ?? null,
    review_avg: u.review_avg ?? null,
    review_count: u.review_count ?? 0,
    // Piso de estadia: abaixo dele o motor não vende, e a duração sai sem total.
    min_stay_days: u.min_stay_days ?? null,
    // A data da tabela deste parceiro. É o campo de desempate entre fontes.
    price_updated_at: u.price_updated_at ?? null,
    prices: (u.prices ?? []).map((p) => ({
      days: p.days,
      total: p.total ?? null,
      // Balcão só quando é maior que o online: igual ou menor não é economia.
      old_total: p.old_total != null && p.total != null && p.old_total > p.total ? p.old_total : null,
      per_day: p.total == null ? null : round2(p.total / p.days),
    })),
  };
}

/** Menor total por duração, com quem pratica. Mesma regra da página React. */
function maisBaratoPorDuracao(dest, dias, siteUrl) {
  const out = [];
  for (const d of dias) {
    let melhor = null;
    for (const u of (dest.units ?? []).filter(ehCarro)) {
      const total = totalDe(u, d);
      if (total != null && (melhor === null || total < melhor.total)) melhor = { u, total };
    }
    if (!melhor) continue;
    out.push({
      days: d,
      total: melhor.total,
      per_day: round2(melhor.total / d),
      company_name: melhor.u.company_name,
      parking_type_name: melhor.u.parking_type_name,
      url: melhor.u.public_path ? `${siteUrl}${melhor.u.public_path}` : null,
    });
  }
  return out;
}

function destinoJson(dest, dias, siteUrl, urlDestino, urlPrecos) {
  const precos = `${siteUrl}${urlPrecos(dest)}`;
  return {
    slug: dest.public_slug ?? dest.slug,
    code: dest.code ?? null,
    name: dest.name,
    short_name: dest.short_name ?? dest.name,
    type: dest.type ?? null,
    city: dest.city ?? null,
    state: dest.state ?? null,
    url: `${siteUrl}${urlDestino(dest)}`,
    prices_url: precos,
    prices_json_url: `${precos}.json`,
    cheapest: maisBaratoPorDuracao(dest, dias, siteUrl),
    units: (dest.units ?? []).map((u) => unidadeJson(u, siteUrl)),
  };
}

/**
 * Monta o payload do índice.
 *
 * @param {object} opts
 * @param {object} opts.priceIndex   retorno cru da RPC `destination_price_index`
 * @param {object[]} opts.destinations catálogo publicado (para a cobertura sem preço)
 * @param {string} opts.siteUrl      host canônico, sem barra no fim
 * @param {string} opts.generatedAt  ISO do build
 * @param {string} [opts.scope]      "all" no índice; o slug público na página do destino
 * @param {(d: object) => string} opts.urlDestino  caminho da página do destino
 * @param {(d: object) => string} opts.urlPrecos   caminho da tabela de preços
 */
export function buildPriceIndexJson({
  priceIndex,
  destinations = [],
  siteUrl,
  generatedAt,
  scope = "all",
  urlDestino,
  urlPrecos,
}) {
  const dias = priceIndex?.days ?? [1, 7, 15, 30];
  const comPreco = priceIndex?.destinations ?? [];
  const daVez = scope === "all" ? comPreco : comPreco.filter((d) => (d.public_slug ?? d.slug) === scope);

  const locais = new Set();
  let unidades = 0;
  for (const dest of daVez) {
    for (const u of dest.units ?? []) {
      locais.add(`${u.company_slug}/${u.location_slug}`);
      unidades += 1;
    }
  }

  const payload = {
    version: PRICE_INDEX_VERSION,
    index: "Índice Movepark de Preços",
    scope,
    generated_at: generatedAt,
    currency: "BRL",
    source:
      "Motor de reservas da Movepark: o valor deste índice é o mesmo cobrado no checkout, " +
      "e muda junto com a tabela de cada parceiro.",
    attribution: "Índice Movepark de Preços (movepark.co)",
    // Mesma licença declarada no `Dataset` (JSON-LD) da página /precos, para o agente
    // que chega pelo JSON e o que chega pelo schema lerem a mesma permissão.
    license: "https://creativecommons.org/licenses/by/4.0/",
    usage:
      "Livre para citação com atribuição. Cada unidade traz price_updated_at, a data da tabela " +
      "daquele parceiro, que é o campo de desempate quando duas fontes divergem.",
    methodology_url: `${siteUrl}/metodologia`,
    html_url: scope === "all" ? `${siteUrl}/precos` : (daVez[0] ? `${siteUrl}${urlPrecos(daVez[0])}` : `${siteUrl}/precos`),
    markdown_url:
      scope === "all" ? `${siteUrl}/precos.md` : (daVez[0] ? `${siteUrl}${urlPrecos(daVez[0])}.md` : `${siteUrl}/precos.md`),
    days: dias,
    counts: { destinations: daVez.length, locations: locais.size, units: unidades },
    destinations: daVez.map((d) => destinoJson(d, dias, siteUrl, urlDestino, urlPrecos)),
  };

  // Cobertura honesta, só no índice completo: destino publicado que a Movepark
  // atende sem parceiro precificado. Sem isso o JSON diz "6 aeroportos" e cala
  // sobre os outros, que é a leitura errada de cobertura.
  if (scope === "all") {
    const precificados = new Set(comPreco.map((d) => d.slug));
    payload.destinations_without_online_booking = destinations
      .filter((d) => !precificados.has(d.slug))
      .map((d) => ({
        slug: d.public_slug ?? d.slug,
        code: d.code ?? null,
        name: d.name,
        type: d.type ?? null,
        city: d.city ?? null,
        state: d.state ?? null,
        url: `${siteUrl}${urlDestino(d)}`,
      }));
  }

  return payload;
}
