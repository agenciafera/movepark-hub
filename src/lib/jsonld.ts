import type { ListingDetail } from "@/features/listing/api";

const SITE_URL = "https://hub.movepark.co";

export function localBusinessSchema(listing: ListingDetail) {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "ParkingFacility"],
    name: `${listing.location.name} — ${listing.parking_type.name}`,
    description: listing.parking_type.description ?? undefined,
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

// Modelado como Product/Offer (não LocalBusiness) — a regra "self-serving" do Google
// só habilita o rich snippet de estrela em avaliações de produto. AggregateRating/Review
// só entram quando há avaliações publicadas (count > 0).
export function productOfferSchema(listing: ListingDetail, reviews: SchemaReview[] = []) {
  const count = listing.location.review_count ?? 0;
  const avg = listing.location.review_avg;
  const hasRating = count > 0 && avg != null;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${listing.parking_type.name} — ${listing.location.name}`,
    description: listing.parking_type.description ?? undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: listing.company_parking_type.base_price.toFixed(2),
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/p/${listing.company.slug}/${listing.location.slug}/${listing.parking_type.code}`,
    },
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
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: d.name,
    description: d.meta_description ?? undefined,
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
