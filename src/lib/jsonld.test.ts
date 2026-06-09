import { describe, expect, it } from "vitest";
import type { ListingDetail } from "@/features/listing/api";
import {
  breadcrumbSchema,
  destinationSchema,
  faqSchema,
  localBusinessSchema,
  productOfferSchema,
} from "./jsonld";

type Overrides = {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
};

function makeListing(o: Overrides = {}): ListingDetail {
  // usa "key in o" pra honrar override explícito como null (??  cairia no default)
  const address = "address" in o ? o.address : "Rua X, 100";
  const latitude = "latitude" in o ? o.latitude : -23.5;
  const longitude = "longitude" in o ? o.longitude : -46.6;
  const description = "description" in o ? o.description : "Coberta e segura";
  return {
    company: { slug: "aeropark" },
    location: {
      name: "Aeroporto Guarulhos",
      slug: "aeroporto-guarulhos",
      phone: "+551130000000",
      email: "contato@aeropark",
      address,
      latitude,
      longitude,
    },
    parking_type: { name: "Vaga Coberta", code: "covered", description },
    company_parking_type: { base_price: 30 },
    // demais campos de ListingDetail não são usados pelos schemas
  } as unknown as ListingDetail;
}

describe("localBusinessSchema", () => {
  it("monta LocalBusiness/ParkingFacility com url canônica do hub", () => {
    const s = localBusinessSchema(makeListing());
    expect(s["@type"]).toEqual(["LocalBusiness", "ParkingFacility"]);
    expect(s.name).toBe("Aeroporto Guarulhos — Vaga Coberta");
    expect(s.url).toBe("https://hub.movepark.co/p/aeropark/aeroporto-guarulhos/covered");
    expect(s.address).toMatchObject({ "@type": "PostalAddress", addressCountry: "BR" });
    expect(s.geo).toMatchObject({ "@type": "GeoCoordinates", latitude: -23.5 });
  });

  it("omite address e geo quando ausentes", () => {
    const s = localBusinessSchema(makeListing({ address: null, latitude: null, longitude: null }));
    expect(s.address).toBeUndefined();
    expect(s.geo).toBeUndefined();
  });
});

describe("productOfferSchema", () => {
  it("usa base_price com 2 casas e moeda BRL", () => {
    const s = productOfferSchema(makeListing());
    expect(s["@type"]).toBe("Product");
    expect(s.offers).toMatchObject({
      "@type": "Offer",
      priceCurrency: "BRL",
      price: "30.00",
      availability: "https://schema.org/InStock",
    });
  });
});

describe("breadcrumbSchema", () => {
  it("numera as posições a partir de 1", () => {
    const s = breadcrumbSchema([
      { name: "Home", url: "https://hub.movepark.co" },
      { name: "Busca", url: "https://hub.movepark.co/search" },
    ]);
    expect(s["@type"]).toBe("BreadcrumbList");
    expect(s.itemListElement).toHaveLength(2);
    expect(s.itemListElement[0]).toMatchObject({ position: 1, name: "Home" });
    expect(s.itemListElement[1]).toMatchObject({ position: 2, item: "https://hub.movepark.co/search" });
  });
});

describe("destinationSchema", () => {
  const base = {
    name: "Aeroporto de Guarulhos",
    slug: "aeroporto-de-guarulhos",
    city: "Guarulhos",
    state: "SP" as string | null,
    country: "BR",
    latitude: -23.43,
    longitude: -46.47,
    meta_description: "Estacionamento perto do GRU.",
  };

  it("monta Place com url canônica de /destinos e endereço/geo", () => {
    const s = destinationSchema(base);
    expect(s["@type"]).toBe("Place");
    expect(s.name).toBe("Aeroporto de Guarulhos");
    expect(s.url).toBe("https://hub.movepark.co/destinos/aeroporto-de-guarulhos");
    expect(s.description).toBe("Estacionamento perto do GRU.");
    expect(s.address).toMatchObject({
      "@type": "PostalAddress",
      addressLocality: "Guarulhos",
      addressRegion: "SP",
      addressCountry: "BR",
    });
    expect(s.geo).toMatchObject({
      "@type": "GeoCoordinates",
      latitude: -23.43,
      longitude: -46.47,
    });
  });

  it("omite description e addressRegion quando ausentes", () => {
    const s = destinationSchema({ ...base, state: null, meta_description: null });
    expect(s.description).toBeUndefined();
    expect(s.address.addressRegion).toBeUndefined();
  });
});

describe("faqSchema", () => {
  it("monta FAQPage com Question/Answer", () => {
    const s = faqSchema([{ question: "Posso cancelar?", answer: "Sim." }]);
    expect(s["@type"]).toBe("FAQPage");
    expect(s.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: "Posso cancelar?",
      acceptedAnswer: { "@type": "Answer", text: "Sim." },
    });
  });
});
