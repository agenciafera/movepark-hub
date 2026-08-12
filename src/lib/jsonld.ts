import { getLocationCapabilities } from "@/features/listing/capabilities";
import { showcaseFromPrice } from "@/features/listing/reservation.logic";
import type { ListingDetail } from "@/features/listing/api";

const SITE_URL = "https://hub.movepark.co";

export function localBusinessSchema(listing: ListingDetail, opts?: { description?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "ParkingFacility"],
    name: `${listing.location.name} · ${listing.parking_type.name}`,
    // TLDR-first: prefere o resumo extraível quando fornecido; senão a descrição do tipo de vaga.
    description: opts?.description ?? listing.parking_type.description ?? undefined,
    image: listing.location.photos?.length ? listing.location.photos : undefined,
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
export function productOfferSchema(
  listing: ListingDetail,
  reviews: SchemaReview[] = [],
  opts?: { description?: string },
) {
  const caps = getLocationCapabilities(listing.location);
  const count = caps.reviews ? (listing.location.review_count ?? 0) : 0;
  const avg = caps.reviews ? listing.location.review_avg : null;
  const hasRating = count > 0 && avg != null;
  // Zero não é preço, e `Offer` sem `price` é inválido para o Google. Então sem preço não há
  // oferta: some o bloco inteiro, em vez de publicar R$ 0,00 como se fosse o valor da diária.
  const price = showcaseFromPrice(listing.company_parking_type.base_price);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${listing.parking_type.name} · ${listing.location.name}`,
    // TLDR-first: prefere o resumo extraível quando fornecido; senão a descrição do tipo de vaga.
    description: opts?.description ?? listing.parking_type.description ?? undefined,
    // `image` é exigido pelo Google pro rich result de Product: usa as fotos da unidade.
    image: listing.location.photos?.length ? listing.location.photos : undefined,
    offers:
      price != null
        ? {
            "@type": "Offer",
            priceCurrency: "BRL",
            price: price.toFixed(2),
            // `InStock` afirma que a vaga está disponível, e quem controla a disponibilidade da
            // unidade externa é o parceiro. É a capacidade `guaranteedSpot`, na superfície do
            // schema. Sem ela, a oferta segue existindo com o preço e cala sobre o estoque.
            availability: caps.guaranteedSpot ? "https://schema.org/InStock" : undefined,
            url: `${SITE_URL}/p/${listing.company.slug}/${listing.location.slug}/${listing.parking_type.code}`,
          }
        : undefined,
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
}) {
  const image = Array.isArray(d.image) ? (d.image.length ? d.image : undefined) : (d.image ?? undefined);
  return {
    "@context": "https://schema.org",
    "@type": "Place",
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
    // "https://hub.movepark.cohttps://…", que nenhum crawler resolve, e deixou os
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
