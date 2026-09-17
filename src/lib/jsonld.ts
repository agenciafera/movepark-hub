import { getLocationCapabilities } from "@/features/listing/capabilities";
import { showcaseFromPrice, type PriceShowcase } from "@/features/listing/reservation.logic";
import type { ListingDetail } from "@/features/listing/api";
import { SITE_URL } from "@/lib/site";
import { caminhoDestino, caminhoFicha } from "@/lib/urls";
import { REDES } from "@/lib/redes";
import { EMAIL_SUPORTE } from "@/lib/suporte";

/**
 * A URL absoluta da ficha. Uma por estacionamento, sem o tipo de vaga: o schema tem que
 * dizer o mesmo que o canonical da página, senão o Google recebe duas identidades.
 */
function urlDaFicha(listing: ListingDetail): string {
  const destino = listing.location.destination?.public_slug;
  const lote = listing.location.public_slug;
  return destino && lote ? `${SITE_URL}${caminhoFicha(destino, lote)}` : SITE_URL;
}

/**
 * A escada de tarifa progressiva como `UnitPriceSpecification`, uma por janela
 * de diárias, com `eligibleQuantity` dizendo a faixa em que aquela diária vale.
 * É a tabela inteira legível por máquina: quem compara preço por IA lê "1 a 6
 * dias custa X/dia, 7 a 14 custa Y/dia" em vez de só a faixa low/high.
 */
function escadaDePreco(porDuracao: { days: number; total: number }[]) {
  if (porDuracao.length < 2) return undefined;
  return porDuracao.map((linha, i) => {
    const proxima = porDuracao[i + 1];
    return {
      "@type": "UnitPriceSpecification",
      price: (Math.round((linha.total / linha.days) * 100) / 100).toFixed(2),
      priceCurrency: "BRL",
      unitText: "dia",
      eligibleQuantity: {
        "@type": "QuantitativeValue",
        minValue: linha.days,
        ...(proxima ? { maxValue: proxima.days - 1 } : {}),
        unitText: "dias",
      },
    };
  });
}

/**
 * Quanto tempo um preço publicado por nós continua valendo como referência.
 *
 * 90 dias é o mesmo teto de frescor que o projeto já aplica a preço pesquisado
 * (`preco_pesquisado_fresco`, na vitrine do lote mapeado): passado o prazo, o número é
 * velho por regra nossa, e não por acidente.
 */
const VALIDADE_DE_PRECO_DIAS = 90;

/**
 * A validade do número, para o schema dizer até quando ele vale.
 *
 * `validFrom` é o dia em que a página consultou o motor, o mesmo que sai visível em
 * "Conferido no motor de reservas em". `priceValidUntil` é ele mais os 90 dias acima.
 *
 * Isto não é congelamento de preço: a tabela do parceiro pode mudar antes, e quando muda
 * a publicação automática regera a página (ver `deploy-automatico.md`) com uma janela
 * nova. O campo existe porque modelo de linguagem não tem como saber a idade do número
 * que está lendo, e sem ele a citação de preço envelhece sem aviso nenhum. É a mesma
 * razão por que a data de conferência aparece na tela: o que muda é o leitor.
 *
 * Substitui a decisão anterior de deixar `priceValidUntil` fora. Ela protegia contra
 * cravar validade que ninguém garante, e o que resolve isso é a janela ser larga e
 * declarada, não o campo sumir: sem ele, quem lê assume que o preço é de hoje.
 */
function janelaDeValidade(geradoEm: string) {
  const inicio = new Date(geradoEm);
  if (Number.isNaN(inicio.getTime())) return undefined;
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + VALIDADE_DE_PRECO_DIAS);
  return {
    validFrom: inicio.toISOString().slice(0, 10),
    priceValidUntil: fim.toISOString().slice(0, 10),
  };
}

/** Dígitos verificadores do CNPJ: módulo 11 sobre os 12 e depois os 13 primeiros. */
function cnpjValido(digitos: string): boolean {
  if (/^(\d)\1{13}$/.test(digitos)) return false;
  const dv = (fatia: string) => {
    let peso = fatia.length - 7;
    let soma = 0;
    for (const d of fatia) {
      soma += Number(d) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return (
    dv(digitos.slice(0, 12)) === Number(digitos[12]) &&
    dv(digitos.slice(0, 13)) === Number(digitos[13])
  );
}

/**
 * CNPJ no formato de registro (XX.XXX.XXX/XXXX-XX). Só formata o que É CNPJ:
 * 14 dígitos com dígito verificador válido, com ou sem pontuação. Qualquer outra
 * coisa (campo de teste, dado sujo) não vira `taxID`, porque identidade errada é
 * pior que ausente.
 */
export function cnpjFormatado(taxId: string | null | undefined): string | undefined {
  if (!taxId) return undefined;
  const digitos = taxId.replace(/\D/g, "");
  if (digitos.length !== 14 || !cnpjValido(digitos)) return undefined;
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

const DIA_SCHEMA: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** Horário curado vira OpeningHoursSpecification; default de catálogo não vira horário. */
function horariosDaUnidade(bh: ListingDetail["location"]["business_hours"]) {
  if (!bh) return undefined;
  const specs = Object.entries(bh)
    .filter(([dia, faixa]) => DIA_SCHEMA[dia] && faixa != null)
    .map(([dia, faixa]) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DIA_SCHEMA[dia],
      opens: faixa!.open,
      closes: faixa!.close,
    }));
  return specs.length ? specs : undefined;
}

const REAL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export function localBusinessSchema(
  listing: ListingDetail,
  opts?: { description?: string; showcase?: PriceShowcase | null },
) {
  const caps = getLocationCapabilities(listing.location);
  const dest = listing.location.destination;
  const showcase = opts?.showcase ?? null;
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "ParkingFacility"],
    name: listing.location.public_name ?? `${listing.company.name} - ${listing.location.name}`,
    // TLDR-first: prefere o resumo extraível quando fornecido; senão a descrição do tipo de vaga.
    description: opts?.description ?? listing.parking_type.description ?? undefined,
    // Metade das unidades guarda a foto como caminho relativo do legado
    // (`/Estacionamentos/...`), e URL relativa em JSON-LD o buscador não resolve.
    image: listing.location.photos?.length ? listing.location.photos.map(absoluta) : undefined,
    url: urlDaFicha(listing),
    telephone: listing.location.phone ?? undefined,
    email: listing.location.email ?? undefined,
    // Identidade legal do catálogo, conferida no registro público: a da unidade
    // quando existe (Aerovalet tem um CNPJ por praça), senão a da empresa. É o
    // lastro que liga a página à operação real.
    legalName: listing.location.legal_name ?? listing.company.legal_name ?? undefined,
    taxID: cnpjFormatado(listing.location.tax_id ?? listing.company.tax_id),
    // Perfil no Google Maps (snapshot do Place): âncora local, mesma função do
    // botão "como chegar" visível.
    hasMap: listing.google?.maps_uri ?? undefined,
    // Comodidades são fato da unidade (ADR-009) e já saem na tela; aqui é o espelho.
    amenityFeature: listing.amenities?.length
      ? listing.amenities.map((a) => ({
          "@type": "LocationFeatureSpecification",
          name: a.name,
          value: true,
        }))
      : undefined,
    // Liga a unidade à entidade do aeroporto (mesmo nó com iataCode da página de destino).
    containedInPlace:
      dest && dest.type === "airport" && dest.code
        ? { "@type": "Airport", name: dest.name, iataCode: dest.code }
        : undefined,
    openingHoursSpecification: horariosDaUnidade(listing.location.business_hours),
    // Espelho da tabela de diárias visível; sem preço na tela, sem faixa no schema.
    priceRange: showcase ? `${REAL(showcase.lowDaily)} - ${REAL(showcase.highDaily)} por diária` : undefined,
    // Meio de pagamento é promessa de transação: só onde a reserva fecha no Hub.
    paymentAccepted: caps.hubCheckout ? "PIX, Cartão de crédito" : undefined,
    currenciesAccepted: caps.hubCheckout ? "BRL" : undefined,
    address: listing.location.address
      ? {
          "@type": "PostalAddress",
          streetAddress: listing.location.address,
          addressCountry: "BR",
        }
      : undefined,
    geo:
      listing.location.latitude != null && listing.location.longitude != null
        ? {
            "@type": "GeoCoordinates",
            latitude: listing.location.latitude,
            longitude: listing.location.longitude,
          }
        : undefined,
  };
}

export type SchemaReview = {
  author: string | null;
  rating: number;
  comment: string | null;
  date: string;
};

// Modelado como Product/Offer, e não LocalBusiness, porque a regra "self-serving" do Google só
// habilita o rich snippet de estrela em avaliações de produto. AggregateRating/Review só entram
// quando há avaliações publicadas (count > 0).
//
// **Gateado por capacidade desde 12/08/2026 (ADR-009).** A função irmã `parkingFacilitySchema`
// logo abaixo já dizia a regra na doc dela, que `Offer` é promessa e o ADR vale para dado
// estruturado igual vale para bloco na tela. Esta aqui não cumpria: nas nove unidades externas
// emitia `price: "0.00"`, `availability: InStock` e `aggregateRating` de avaliação que a página
// esconde. As capacidades são lidas da própria `listing`, não recebidas por parâmetro, para que
// não exista chamada desprotegida.
//
// **Devolve `null` quando não sobra nada que qualifique o `Product` (19/08/2026).** O gate acima
// consertou o conteúdo e deixou a casca: nas dezessete páginas de unidade do sitemap, todas de
// checkout externo e com `base_price = 0`, saía um `Product` só com `name`, `description` e
// `image`. O Google exige `offers`, `review` ou `aggregateRating` e reprova o resto como item
// inválido ("Especifique offers, review ou aggregateRating", no Search Console). A saída não é
// reinventar a promessa para preencher o campo: é não publicar o nó. O que descreve o lugar
// continua saindo no `LocalBusiness`/`ParkingFacility` ao lado, que não exige oferta.
//
// **A oferta passou a vir do motor de preço (19/08/2026).** O `null` acima resolvia o erro
// apagando o nó, e apagar era desperdício: as dezessete unidades TÊM preço, só não em
// `company_parking_type.base_price`, que é campo de catálogo que ninguém preencheu e que o
// `simulate_price` sequer lê. Com a faixa vinda do motor (`opts.showcase`, buscada no loader do
// SSG), toda página volta a publicar `Product` válido, com o mesmo número que o card mostra
// quando a pessoa escolhe as datas. `base_price` fica de reserva para quando a faixa não vier,
// e o `null` continua de rede: nó sem nada que qualifique não é publicado.
export function productOfferSchema(
  listing: ListingDetail,
  reviews: SchemaReview[] = [],
  opts?: { description?: string; showcase?: PriceShowcase | null },
) {
  const caps = getLocationCapabilities(listing.location);
  const count = caps.reviews ? (listing.location.review_count ?? 0) : 0;
  const avg = caps.reviews ? listing.location.review_avg : null;
  const hasRating = count > 0 && avg != null;
  // Zero não é preço, e `Offer` sem `price` é inválido para o Google. Então sem preço não há
  // oferta: some o bloco inteiro, em vez de publicar R$ 0,00 como se fosse o valor da diária.
  const price = showcaseFromPrice(listing.company_parking_type.base_price);
  const showcase = opts?.showcase ?? null;

  // `InStock` afirma que a vaga está disponível, e quem controla a disponibilidade da unidade
  // externa é o parceiro. É a capacidade `guaranteedSpot` na superfície do schema. Sem ela, a
  // oferta segue existindo com o preço e cala sobre o estoque.
  const availability = caps.guaranteedSpot ? "https://schema.org/InStock" : undefined;
  const url = urlDaFicha(listing);

  // A faixa do motor manda; `base_price` é reserva. `AggregateOffer` e não `Offer` porque a
  // tabela é escalonada: uma diária só cravaria o preço de uma duração e calaria sobre as
  // outras três.
  const offers =
    showcase != null
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "BRL",
          lowPrice: showcase.lowDaily.toFixed(2),
          highPrice: showcase.highDaily.toFixed(2),
          offerCount: showcase.offerCount,
          priceSpecification: escadaDePreco(showcase.porDuracao),
          availability,
          url,
        }
      : price != null
        ? { "@type": "Offer", priceCurrency: "BRL", price: price.toFixed(2), availability, url }
        : undefined;

  // Nó vazio é item inválido, não item incompleto: o Google reprova a página inteira no rich
  // result de Product. Sem oferta e sem nota, o nó não existe.
  if (offers == null && !hasRating) return null;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.location.public_name ?? `${listing.company.name} - ${listing.location.name}`,
    // TLDR-first: prefere o resumo extraível quando fornecido; senão a descrição do tipo de vaga.
    description: opts?.description ?? listing.parking_type.description ?? undefined,
    // `image` é exigido pelo Google pro rich result de Product: usa as fotos da unidade,
    // absolutas, porque caminho relativo o buscador não resolve.
    image: listing.location.photos?.length ? listing.location.photos.map(absoluta) : undefined,
    offers,
    aggregateRating: hasRating
      ? {
          "@type": "AggregateRating",
          ratingValue: avg,
          reviewCount: count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined,
    review: hasRating && reviews.length
      ? reviews.map((r) => ({
          "@type": "Review",
          author: { "@type": "Person", name: r.author ?? "Cliente Movepark" },
          datePublished: r.date.slice(0, 10),
          reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
          reviewBody: r.comment ?? undefined,
        }))
      : undefined,
  };
}

export function destinationSchema(d: {
  name: string;
  slug: string;
  public_slug?: string | null;
  city: string;
  state: string | null;
  country: string;
  latitude: number;
  longitude: number;
  meta_description?: string | null;
  image?: string | string[] | null;
  type?: string | null;
  code?: string | null;
}) {
  const image = Array.isArray(d.image) ? (d.image.length ? d.image : undefined) : (d.image ?? undefined);
  // Aeroporto ganha o subtipo e o código IATA: é o que liga a página à entidade
  // que buscador e LLM já conhecem ("GRU"), em vez de um Place genérico. O código
  // só entra quando tem cara de IATA (3 letras); "tiete" e "centro-sp" ficam de fora.
  const isAirport = d.type === "airport";
  const iata = d.code && /^[A-Z]{3}$/.test(d.code) ? d.code : undefined;
  return {
    "@context": "https://schema.org",
    "@type": isAirport ? ["Place", "Airport"] : "Place",
    iataCode: isAirport ? iata : undefined,
    name: d.name,
    description: d.meta_description ?? undefined,
    image,
    url: `${SITE_URL}${caminhoDestino(d.public_slug ?? d.slug)}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: d.city,
      addressRegion: d.state ?? undefined,
      addressCountry: d.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: d.latitude,
      longitude: d.longitude,
    },
  };
}

/**
 * Lote MAPEADO, sem contrato (E0.17-f · ADR-010).
 *
 * `ParkingFacility` é subtipo de `LocalBusiness`, e o que este schema NÃO emite é tão
 * decidido quanto o que ele emite:
 *
 * - **sem `offers` e sem `priceRange`.** `Offer` é promessa, e o ADR-009 vale para dado
 *   estruturado do mesmo jeito que vale para bloco na tela. Este lote não vende nada aqui.
 * - **sem `openingHoursSpecification`.** Não existe campo de horário em `prospect_location`,
 *   e emitir a partir de um default afirmaria ao Google um horário que ninguém verificou.
 * - **sem `aggregateRating`.** Não há avaliação: a Movepark nunca vendeu uma reserva ali.
 * - **sem `telephone`.** Q-021: o número é guardado e não exibido, e "não exibido" inclui
 *   o JSON-LD, que é justamente onde um dado escondido da tela continua legível.
 *
 * Isto é ganho líquido sobre o que existe hoje: a página do WordPress emite só `WebPage` e
 * `ImageObject` do Yoast, sem `LocalBusiness`, sem endereço estruturado e sem `geo`.
 */
export function parkingFacilitySchema(p: {
  name: string;
  url: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string;
  state: string | null;
  country: string;
  description?: string | null;
  amenities?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ParkingFacility",
    name: p.name,
    description: p.description ?? undefined,
    url: absoluta(p.url),
    address: {
      "@type": "PostalAddress",
      streetAddress: p.address ?? undefined,
      addressLocality: p.city,
      addressRegion: p.state ?? undefined,
      addressCountry: p.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: p.latitude,
      longitude: p.longitude,
    },
    amenityFeature: p.amenities?.length
      ? p.amenities.map((a) => ({
          "@type": "LocationFeatureSpecification",
          name: a,
          value: true,
        }))
      : undefined,
  };
}

/**
 * Post do blog.
 *
 * `mainEntityOfPage` amarra o dado estruturado à URL canônica, que é a mesma do
 * WordPress legado. Sem isso o buscador pode tratar a página migrada como outra
 * coisa e perder o histórico da URL.
 */
/** Deixa a URL absoluta sem duplicar o host quando ela já é absoluta. */
function absoluta(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function blogPostingSchema(p: {
  title: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  publishedAt: string;
  updatedAt?: string | null;
  authorName?: string | null;
  wordCount?: number;
}) {
  const url = `${SITE_URL}/blog/${p.slug}/`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.description ?? undefined,
    // A capa vem absoluta do bucket. Prefixar SITE_URL nela gerava
    // "https://movepark.cohttps://…", que nenhum crawler resolve, e deixou os
    // 94 posts sem imagem no rich result. Só caminho relativo ganha o prefixo.
    image: p.image ? absoluta(p.image) : undefined,
    datePublished: p.publishedAt,
    dateModified: p.updatedAt ?? p.publishedAt,
    wordCount: p.wordCount,
    inLanguage: "pt-BR",
    // Nome próprio assina como Person (E-E-A-T); sem autor, assina a casa.
  author: p.authorName
    ? { "@type": "Person", name: p.authorName }
    : { "@type": "Organization", name: "Movepark" },
    publisher: {
      "@type": "Organization",
      name: "Movepark",
      url: SITE_URL,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
  };
}

/**
 * A entidade Movepark, para a home: o bloco que ancora o knowledge panel e a
 * desambiguação de marca nos LLMs (o mesmo papel do bloco do llms.txt, em dado
 * estruturado). Só entra aqui dado com fonte verificável: redes oficiais
 * (`sameAs`, de src/lib/redes.ts), contato de suporte, o slogan da garantia e a
 * identidade legal (razão social e CNPJ, conferidos no registro público).
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Movepark",
    legalName: "Movepark Tecnologia Ltda",
    taxID: "68.183.164/0001-35",
    url: SITE_URL,
    logo: `${SITE_URL}/brand/logo-movepark.svg`,
    description:
      "Plataforma de reserva de estacionamentos em aeroportos e destinos do Brasil: busca, comparação de preços e reserva online com traslado até o terminal.",
    slogan: "Vaga garantida ou realocamos e cobrimos a diferença.",
    email: EMAIL_SUPORTE,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: EMAIL_SUPORTE,
      availableLanguage: "Portuguese",
    },
    sameAs: REDES.map((r) => r.url),
  };
}

/**
 * O site como entidade pesquisável: o `SearchAction` diz ao buscador e ao agente
 * como montar uma busca válida (`/search?dest=GRU`), no mesmo formato que o app
 * usa. Emitido na home, uma vez por site.
 */
export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Movepark",
    url: SITE_URL,
    inLanguage: "pt-BR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?dest={dest}`,
      },
      "query-input": "required name=dest",
    },
  };
}

/**
 * O Índice Movepark de Preços como `Dataset` citável: licença aberta com
 * atribuição, grátis, atualizado a cada build com o preço do motor. É a
 * engenharia de citabilidade: imprensa e IA citam dataset licenciado com muito
 * menos atrito do que página solta.
 */
/**
 * `WebPage` com data de modificação, para a página que publica dado que envelhece.
 *
 * Frescor é o critério de desempate entre duas fontes que dizem o mesmo número, e até aqui a
 * página de preço do destino não declarava data nenhuma. A data que entra é a da tabela do
 * parceiro, a mesma que o cabeçalho mostra: schema mais novo que o visível é frescor inventado.
 */
export function webPageSchema(args: { url: string; name: string; dateModified: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": args.url,
    url: args.url,
    name: args.name,
    inLanguage: "pt-BR",
    dateModified: args.dateModified,
  };
}

export function datasetSchema(args: { dateModified: string; spatial?: string[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Índice Movepark de Preços",
    description:
      "Quanto custa estacionar perto de cada aeroporto atendido pela Movepark, em 1, 7, 15 e 30 diárias, com o preço de balcão ao lado. Os valores saem do motor de reservas, os mesmos do checkout, e mudam quando a tabela do parceiro muda.",
    url: `${SITE_URL}/precos`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    inLanguage: "pt-BR",
    dateModified: args.dateModified,
    // O snapshot vale na data do build; a cobertura espacial são os aeroportos do índice.
    temporalCoverage: args.dateModified,
    spatialCoverage: args.spatial?.length
      ? args.spatial.map((name) => ({ "@type": "Place", name }))
      : undefined,
    creator: {
      "@type": "Organization",
      name: "Movepark",
      url: SITE_URL,
    },
    distribution: [
      // JSON primeiro: é a forma mais rica do mesmo dado, e quem lê o Dataset para
      // consumir programaticamente vai atrás dela antes do Markdown.
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${SITE_URL}/precos.json`,
      },
      {
        "@type": "DataDownload",
        encodingFormat: "text/markdown",
        contentUrl: `${SITE_URL}/precos.md`,
      },
      {
        "@type": "DataDownload",
        encodingFormat: "text/plain",
        contentUrl: `${SITE_URL}/llms-full.txt`,
      },
    ],
  };
}

/**
 * Ferramenta interativa como `WebApplication` (calculadora, comparador): grátis,
 * categoria de viagem, rodando no navegador. O conteúdo pré-computado da página
 * segue sendo o que o crawler lê; o schema diz o que a ferramenta é.
 */
export function webApplicationSchema(args: { name: string; url: string; description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: args.name,
    url: args.url,
    description: args.description,
    applicationCategory: "TravelApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
  };
}

export function breadcrumbSchema(
  crumbs: { name: string; url: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

/**
 * A vitrine do destino em dado estruturado: um `Product` com `AggregateOffer` por vaga
 * de parceiro precificada, e um `ParkingFacility` seco por lote mapeado (ADR-010).
 *
 * Substitui o `ItemList` de nome e URL que a página emitia antes. O motivo daquele ser
 * seco era bom e deixou de valer: enquanto a página não mostrava preço, afirmar preço no
 * JSON-LD seria descrever algo invisível, que é o que o Google trata como spam. Agora a
 * tabela de 1/7/15/30 diárias sai no HTML do build, vinda do mesmo motor, então o schema
 * espelha o que está na tela. Espelhar é a regra; o que mudou foi a tela.
 *
 * O que continua fora, e por quê:
 *
 * - **`availability`.** Afirmar `InStock` é prometer vaga garantida, e quem controla o
 *   estoque da unidade externa é o parceiro. É `guaranteedSpot` na superfície do schema
 *   (ADR-009), a mesma trava que `productOfferSchema` já aplica.
 * - **`aggregateRating`.** A nota é da unidade e mora na página dela. Agregar nota de
 *   parceiro num item de lista de destino infla estrela em página que não é a do produto.
 * - **preço no lote mapeado.** Ele não vende nada aqui, então não tem `offers` nem
 *   `priceRange`.
 *
 * `priceValidUntil` entrou em 16/09/2026, junto das páginas de preço: a data de conferência
 * visível resolve para quem lê a tela, e não para quem lê só o JSON-LD. A janela e o motivo
 * estão em `janelaDeValidade`.
 *
 * **Uma lista de nós, e não um `ItemList`, desde 17/09/2026.** O invólucro de lista o teste
 * de resultados ricos lê como tentativa de **carrossel**, que só existe para Course, Movie,
 * Recipe e Restaurant: a página aparecia com "Carousels: 1 invalid item" mesmo com os
 * produtos válidos ao lado. O mesmo conteúdo, solto num array, o Google lê como os produtos
 * e os lugares que a página descreve, que é o que ele é. (O `ItemList` de nome e URL do
 * índice de preços continua válido: lá os itens são links para outras páginas, que é o
 * formato de carrossel que o Google aceita.)
 *
 * **Uma entrada por URL, desde 16/09/2026.** O card é por VAGA e a ficha é do LOTE, então a
 * lista de Guarulhos saía com 19 itens para 15 fichas, e o teste de resultados ricos reprova
 * a lista inteira nisso ("Identical property values given, but unique values are required"):
 * para o Google, o item da lista é identificado pela URL. As vagas do mesmo lote viram um
 * item só, com a faixa cobrindo as duas tabelas, e o nome perde o tipo de vaga, que é o que
 * aquela URL descreve. `guaranteedSpot` só sobrevive à junção se valer para todas.
 */
export function destinationOffersSchema(args: {
  partners: {
    /** Nome do estacionamento ("Aerovalet"), sem o tipo de vaga. */
    name: string;
    /** Tipo de vaga do card ("Vaga Coberta"). Só entra no nome quando o lote tem uma só. */
    variant?: string | null;
    url: string;
    description?: string | null;
    /** Capa da unidade, a mesma do card visível. Vira `image`, que o Google pede no Product. */
    image?: string | null;
    /** Faixa de preço da matriz do build. Null quando o motor não cobriu a vaga. */
    price: {
      lowPrice: number;
      highPrice: number;
      offerCount: number;
      guaranteedSpot: boolean;
    } | null;
  }[];
  mapped: { name: string; url: string }[];
  /** Carimbo do "conferido em" da página. Sem ele a oferta sai sem validade. */
  generatedAt?: string;
}) {
  const validade = args.generatedAt ? janelaDeValidade(args.generatedAt) : undefined;

  // Junta as vagas que dividem a mesma ficha: uma entrada por URL (ver doc acima).
  const porUrl = new Map<string, (typeof args.partners)[number][]>();
  for (const parceiro of args.partners) {
    const url = absoluta(parceiro.url);
    const grupo = porUrl.get(url);
    if (grupo) grupo.push(parceiro);
    else porUrl.set(url, [parceiro]);
  }
  const parceiros = [...porUrl.values()].map((grupo) => {
    const base = grupo[0];
    const precos = grupo.map((g) => g.price).filter((x): x is NonNullable<typeof x> => x != null);
    return {
      ...base,
      name: grupo.length === 1 && base.variant ? `${base.name} · ${base.variant}` : base.name,
      image: grupo.find((g) => g.image)?.image ?? null,
      price: precos.length
        ? {
            lowPrice: Math.min(...precos.map((x) => x.lowPrice)),
            highPrice: Math.max(...precos.map((x) => x.highPrice)),
            offerCount: precos.reduce((n, x) => n + x.offerCount, 0),
            // Promessa de estoque só sobrevive à junção se valer para todas as vagas.
            guaranteedSpot: precos.every((x) => x.guaranteedSpot),
          }
        : null,
    };
  });

  const itens = [
    ...parceiros.map((p) =>
      // Sem preço na matriz do build, o parceiro entra como `ParkingFacility`, e não como
      // `Product` mudo. Chutar um valor seria afirmar preço que a página não mostra, e
      // `Product` sem `offers`, `review` nem `aggregateRating` o Google reprova como item
      // inválido, o que derruba a lista inteira junto. Nó de lugar não exige oferta.
      p.price
        ? {
            "@type": "Product" as const,
            name: p.name,
            description: p.description ?? undefined,
            url: absoluta(p.url),
            image: p.image ? [absoluta(p.image)] : undefined,
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "BRL",
              lowPrice: p.price.lowPrice.toFixed(2),
              highPrice: p.price.highPrice.toFixed(2),
              offerCount: p.price.offerCount,
              availability: p.price.guaranteedSpot ? "https://schema.org/InStock" : undefined,
              ...validade,
              url: absoluta(p.url),
            },
          }
        : {
            "@type": "ParkingFacility" as const,
            name: p.name,
            description: p.description ?? undefined,
            url: absoluta(p.url),
          },
    ),
    // Lote mapeado que já virou parceiro (conversão) repetiria a mesma ficha na lista.
    ...args.mapped
      .filter((m) => !porUrl.has(absoluta(m.url)))
      .map((m) => ({
        "@type": "ParkingFacility" as const,
        name: m.name,
        url: absoluta(m.url),
      })),
  ];

  return itens.map((item) => ({ "@context": "https://schema.org", ...item }));
}

/** Uma linha da tabela de preço: o estacionamento e o total de cada duração visível. */
export type PriceTableItem = {
  /** O nome do estacionamento ("Aerovalet"). */
  name: string;
  /** O tipo de vaga daquela linha ("Vaga Descoberta"), quando a tabela separa por vaga. */
  variant?: string | null;
  /** Ficha do estacionamento. Caminho relativo vira absoluto aqui, e é a chave do item. */
  url: string;
  description?: string | null;
  /** Capa da unidade. O Google pede `image` no `Product`. */
  image?: string | null;
  /** Total cobrado por duração. Só as durações que a página mostra com preço. */
  porDuracao: { days: number; total: number }[];
};

/**
 * A tabela de preço em dado estruturado: um `Product` por estacionamento, com
 * `AggregateOffer` e a escada de tarifa por duração.
 *
 * Nasceu como função local da página `/precos/<slug>` e subiu para cá em 16/09/2026,
 * quando as outras páginas de preço (o índice `/precos` e a de "mais barato") passaram a
 * precisar do mesmo bloco. Schema de preço em três cópias divergiria na primeira correção;
 * aqui a regra é uma só e tem teste.
 *
 * **Uma lista de `Product`, e não um `ItemList`.** O invólucro de lista era o formato
 * anterior, e o teste de resultados ricos do Google o lê como tentativa de **carrossel**,
 * que só existe para Course, Movie, Recipe e Restaurant: a página aparecia com "Carousels:
 * 1 invalid item" mesmo com os produtos todos válidos ao lado. Um array de `Product` no
 * mesmo `script` é o formato que o Google documenta para página que lista vários produtos,
 * e a ordem da tabela continua sendo a ordem do array.
 *
 * As decisões que o bloco carrega:
 *
 * - **Linha sem preço em nenhuma duração fica de fora.** A página mostra a linha, porque
 *   "consulte na página" é informação; o schema não, porque `Product` sem `offers` válida o
 *   Google reprova como item inválido. Nada precificado devolve `null` e o bloco não sai.
 * - **Uma entrada por URL.** A tabela tem uma linha por VAGA e a ficha é do LOTE, então o
 *   mesmo estacionamento aparece duas vezes quando tem coberta e descoberta. Dois `Product`
 *   com a mesma URL são a mesma entidade dita duas vezes (e, no formato de lista, o Google
 *   reprovava com "Identical property values given, but unique values are required").
 *   Linhas que dividem a ficha viram um `Product` só, com a faixa cobrindo as duas tabelas;
 *   aí o nome é o do lote, sem o tipo de vaga, que é o que aquela URL descreve. A escada
 *   some nesse caso: duas tabelas dariam dois preços para a mesma janela de dias.
 * - **Sem `availability`.** Afirmar `InStock` é prometer vaga garantida, e quem controla o
 *   estoque da unidade externa é o parceiro (ADR-009). O preço é fato da tabela; o estoque
 *   não é nosso para afirmar.
 * - **Sem `aggregateRating`.** A nota é da unidade e mora na página dela. Agregar nota num
 *   item de lista de preço infla estrela em página que não é a do produto.
 *
 * `lowPrice`/`highPrice` são o menor e o maior TOTAL da linha, não a diária: é o que a
 * célula mostra. Quem quiser a diária lê a escada, que traz preço por dia com a faixa de
 * diárias em que ele vale.
 */
export function priceTableOffersSchema(args: {
  itens: PriceTableItem[];
  /** Carimbo do "conferido em" da página, que vira a validade da oferta. */
  generatedAt: string;
}) {
  const comPreco = args.itens
    .map((item) => ({
      ...item,
      porDuracao: item.porDuracao
        .filter((d) => Number.isFinite(d.total) && d.total > 0)
        .sort((a, b) => a.days - b.days),
    }))
    .filter((item) => item.porDuracao.length > 0);

  if (comPreco.length === 0) return null;
  const validade = janelaDeValidade(args.generatedAt);

  // Uma entrada por ficha: linhas de vagas diferentes do mesmo lote compartilham a URL.
  const porUrl = new Map<string, typeof comPreco>();
  for (const item of comPreco) {
    const url = absoluta(item.url);
    const grupo = porUrl.get(url);
    if (grupo) grupo.push(item);
    else porUrl.set(url, [item]);
  }

  return [...porUrl.entries()].map(([url, grupo]) => {
    const primeiro = grupo[0];
    const duracoes = grupo.flatMap((g) => g.porDuracao);
    const totais = duracoes.map((d) => d.total);
    const soUmaTabela = grupo.length === 1;
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name:
        soUmaTabela && primeiro.variant ? `${primeiro.name} · ${primeiro.variant}` : primeiro.name,
      description: primeiro.description ?? undefined,
      image: primeiro.image ? [absoluta(primeiro.image)] : undefined,
      url,
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "BRL",
        lowPrice: Math.min(...totais).toFixed(2),
        highPrice: Math.max(...totais).toFixed(2),
        offerCount: totais.length,
        priceSpecification: soUmaTabela ? escadaDePreco(primeiro.porDuracao) : undefined,
        ...validade,
        url,
      },
    };
  });
}

/** Lista de itens (coleção), usada na página índice de destinos. */
export function itemListSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

export function faqSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

/**
 * VideoObject de um vídeo hospedado no YouTube e embutido numa página nossa.
 *
 * Existe por causa de um alerta do Search Console em 20/08/2026: "Nenhum URL de miniatura
 * enviado". O Google acha o iframe do vídeo no HTML, entende que a página tem vídeo e não
 * consegue descobrir a miniatura sozinho, então não indexa. Iframe sem dado estruturado é
 * exatamente esse caso: o player é do YouTube, mas quem precisa declarar o vídeo é a página
 * que o exibe.
 *
 * `thumbnailUrl`, `name`, `description` e `uploadDate` são os quatro campos obrigatórios do
 * Google para VideoObject. O guard `bun run lint:schema` reprova o build se algum sumir.
 *
 * A miniatura sai de `i.ytimg.com`, e `maxresdefault` (1280x720) é a maior que o YouTube
 * publica. O Google pede pelo menos 1200px de largura para a imagem aparecer nos resultados
 * ricos, e `hqdefault` tem 480: entrega o dado e perde a vaga na vitrine.
 */
export function youTubeVideoSchema(v: {
  videoId: string;
  name: string;
  description: string;
  /** ISO 8601, do próprio YouTube. Obrigatório para o Google. */
  uploadDate: string;
  /** ISO 8601 de duração (`PT24S`). Recomendado, e o que rende o selo de duração. */
  duration?: string;
  /** A página nossa onde o vídeo aparece. */
  pageUrl: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: v.name,
    description: v.description,
    thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`,
    uploadDate: v.uploadDate,
    duration: v.duration,
    embedUrl: `https://www.youtube.com/embed/${v.videoId}`,
    inLanguage: "pt-BR",
    publisher: {
      "@type": "Organization",
      name: "Movepark",
      url: SITE_URL,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": v.pageUrl },
  };
}
