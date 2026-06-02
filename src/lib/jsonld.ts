import type { ListingDetail } from "@/features/listing/api";

const SITE_URL = "https://movepark.com.br";

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

export function productOfferSchema(listing: ListingDetail) {
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
