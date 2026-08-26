import { getLocationCapabilities } from "@/features/listing/capabilities";
import { showcaseFromPrice, type PriceShowcase } from "@/features/listing/reservation.logic";
import type { ListingDetail } from "@/features/listing/api";
import { SITE_URL } from "@/lib/site";
import { REDES } from "@/lib/redes";
import { EMAIL_SUPORTE } from "@/lib/suporte";

/**
 * A escada de tarifa progressiva como `UnitPriceSpecification`, uma por janela
 * de diárias, com `eligibleQuantity` dizendo a faixa em que aquela diária vale.
 * É a tabela inteira legível por máquina: quem compara preço por IA lê "1 a 6
 * dias custa X/dia, 7 a 14 custa Y/dia" em vez de só a faixa low/high.
 * `priceValidUntil` segue fora (ver destinationOffersSchema): validade cravada
 * ninguém garante; o que sustenta o número é a regeração a cada build.
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

export function localBusinessSchema(listing: ListingDetail, opts?: { description?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "ParkingFacility"],
    name: `${listing.location.name} · ${listing.parking_type.name}`,
    // TLDR-first: prefere o resumo extraível quando fornecido; senão a descrição do tipo de vaga.
    description: opts?.description ?? listing.parking_type.description ?? undefined,
    // Metade das unidades guarda a foto como caminho relativo do legado
    // (`/Estacionamentos/...`), e URL relativa em JSON-LD o buscador não resolve.
    image: listing.location.photos?.length ? listing.location.photos.map(absoluta) : undefined,
    url: `${SITE_URL}/p/${listing.company.slug}/${listing.location.slug}/${listing.parking_type.code}`,
    telephone: listing.location.phone ?? undefined,
    email: listing.location.email ?? undefined,
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
  const url = `${SITE_URL}/p/${listing.company.slug}/${listing.location.slug}/${listing.parking_type.code}`;

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
    name: `${listing.parking_type.name} · ${listing.location.name}`,
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
    url: `${SITE_URL}/destinos/${d.slug}`,
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
    author: { "@type": "Organization", name: p.authorName || "Movepark" },
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
 * A entidade Movepark, para a home: nome, logo e descrição num bloco só. É o que
 * ancora o knowledge panel e a desambiguação de marca nos LLMs (o mesmo papel do
 * bloco de desambiguação do llms.txt, em dado estruturado).
 */
/**
 * A entidade Movepark com lastro: redes oficiais (`sameAs`, de src/lib/redes.ts),
 * contato de suporte e a promessa da garantia como slogan. Só entra aqui dado com
 * fonte no repo; `taxID` (CNPJ) e `foundingDate` ficam de fora até existirem numa
 * fonte verificável, porque entidade com dado inventado é pior que entidade magra.
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Movepark",
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
export function datasetSchema(args: { dateModified: string }) {
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
    creator: {
      "@type": "Organization",
      name: "Movepark",
      url: SITE_URL,
    },
    distribution: [
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
 * `priceValidUntil` não entra: a tabela é regerada a cada build e a data de conferência
 * fica visível na página, que é o que sustenta o número sem cravar validade que ninguém
 * garante.
 */
export function destinationOffersSchema(args: {
  partners: {
    name: string;
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
}) {
  const itens = [
    ...args.partners.map((p) =>
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
    ...args.mapped.map((m) => ({
      "@type": "ParkingFacility" as const,
      name: m.name,
      url: absoluta(m.url),
    })),
  ];

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: itens.length,
    itemListElement: itens.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item,
    })),
  };
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
