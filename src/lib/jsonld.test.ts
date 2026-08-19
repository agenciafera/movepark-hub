import { describe, expect, it } from "vitest";
import type { ListingDetail } from "@/features/listing/api";
import type { GooglePlaceSnapshot } from "@/types/domain";
import {
  blogPostingSchema,
  breadcrumbSchema,
  destinationOffersSchema,
  destinationSchema,
  faqSchema,
  itemListSchema,
  parkingFacilitySchema,
  localBusinessSchema,
  productOfferSchema,
} from "./jsonld";

type Overrides = {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  review_avg?: number | null;
  review_count?: number;
  photos?: string[];
  base_price?: number;
  checkout_mode?: "hub" | "external";
  google?: GooglePlaceSnapshot | null;
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
      checkout_mode: o.checkout_mode ?? "hub",
      phone: "+551130000000",
      email: "contato@aeropark",
      address,
      latitude,
      longitude,
      review_avg: "review_avg" in o ? o.review_avg : null,
      review_count: o.review_count ?? 0,
      photos: o.photos ?? [],
    },
    parking_type: { name: "Vaga Coberta", code: "covered", description },
    company_parking_type: { base_price: o.base_price ?? 30 },
    google: "google" in o ? o.google : null,
    // demais campos de ListingDetail não são usados pelos schemas
  } as unknown as ListingDetail;
}

describe("localBusinessSchema", () => {
  it("monta LocalBusiness/ParkingFacility com url canônica do hub", () => {
    const s = localBusinessSchema(makeListing());
    expect(s["@type"]).toEqual(["LocalBusiness", "ParkingFacility"]);
    expect(s.name).toBe("Aeroporto Guarulhos · Vaga Coberta");
    expect(s.url).toBe("https://movepark.co/p/aeropark/aeroporto-guarulhos/covered");
    expect(s.address).toMatchObject({ "@type": "PostalAddress", addressCountry: "BR" });
    expect(s.geo).toMatchObject({ "@type": "GeoCoordinates", latitude: -23.5 });
  });

  it("omite address e geo quando ausentes", () => {
    const s = localBusinessSchema(makeListing({ address: null, latitude: null, longitude: null }));
    expect(s.address).toBeUndefined();
    expect(s.geo).toBeUndefined();
  });

  it("inclui image com as fotos da unidade quando há fotos; omite quando não há", () => {
    const fotos = ["https://cdn/p1.jpg", "https://cdn/p2.jpg"];
    expect(localBusinessSchema(makeListing({ photos: fotos })).image).toEqual(fotos);
    expect(localBusinessSchema(makeListing()).image).toBeUndefined();
  });

  it("usa o resumo TLDR como description quando fornecido (senão a descrição do tipo)", () => {
    expect(localBusinessSchema(makeListing()).description).toBe("Coberta e segura");
    expect(localBusinessSchema(makeListing(), { description: "Resumo TLDR." }).description).toBe(
      "Resumo TLDR.",
    );
  });
});

/**
 * Casos que esperam o `Product` publicado. Falha alto em vez de espalhar `!`, porque o nó nulo
 * tem describe próprio: se um caso destes começar a devolver nulo, o erro é aqui e não um
 * `undefined` silencioso três linhas abaixo.
 */
function produto(...args: Parameters<typeof productOfferSchema>) {
  const s = productOfferSchema(...args);
  if (!s) throw new Error("esperava Product publicado, veio null");
  return s;
}

describe("productOfferSchema", () => {
  it("usa base_price com 2 casas e moeda BRL", () => {
    const s = produto(makeListing());
    expect(s["@type"]).toBe("Product");
    expect(s.offers).toMatchObject({
      "@type": "Offer",
      priceCurrency: "BRL",
      price: "30.00",
      availability: "https://schema.org/InStock",
    });
  });

  it("sem avaliações não inclui aggregateRating nem review", () => {
    const s = produto(makeListing());
    expect(s.aggregateRating).toBeUndefined();
    expect(s.review).toBeUndefined();
  });

  it("nao deixa a nota do Google virar aggregateRating: o Google proibe marcar avaliacao de outro site como sua", () => {
    const s = produto(
      makeListing({
        review_avg: null,
        review_count: 0,
        google: {
          place_id: "ChIJ_x",
          rating: 4.8,
          user_rating_count: 500,
          maps_uri: "https://maps.google.com/?cid=1",
          reviews: [],
          fetched_at: new Date().toISOString(),
        },
      }),
    );
    expect(s.aggregateRating).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain("aggregateRating");
  });

  it("inclui image (exigido pelo rich result de Product) quando há fotos", () => {
    const fotos = ["https://cdn/p1.jpg"];
    expect(produto(makeListing({ photos: fotos })).image).toEqual(fotos);
    expect(produto(makeListing()).image).toBeUndefined();
  });

  it("usa o resumo TLDR como description quando fornecido", () => {
    expect(produto(makeListing(), [], { description: "Resumo TLDR." }).description).toBe(
      "Resumo TLDR.",
    );
    expect(produto(makeListing()).description).toBe("Coberta e segura");
  });

  it("com avaliações inclui AggregateRating (regra self-serving do Google)", () => {
    const s = produto(makeListing({ review_avg: 4.8, review_count: 248 }));
    expect(s.aggregateRating).toMatchObject({
      "@type": "AggregateRating",
      ratingValue: 4.8,
      reviewCount: 248,
      bestRating: 5,
    });
  });

  it("inclui review[] quando há reviews e avaliações", () => {
    const s = produto(makeListing({ review_avg: 5, review_count: 2 }), [
      { author: "Ana", rating: 5, comment: "Ótimo", date: "2026-06-01T10:00:00Z" },
    ]);
    expect(s.review).toHaveLength(1);
    expect(s.review![0]).toMatchObject({
      "@type": "Review",
      author: { "@type": "Person", name: "Ana" },
      datePublished: "2026-06-01",
      reviewRating: { "@type": "Rating", ratingValue: 5, bestRating: 5 },
      reviewBody: "Ótimo",
    });
  });

  it("ignora review[] quando não há avaliações publicadas", () => {
    const s = produto(makeListing({ review_count: 0 }), [
      { author: "X", rating: 4, comment: "y", date: "2026-06-01T10:00:00Z" },
    ]);
    expect(s.review).toBeUndefined();
  });
});

/**
 * ADR-009 no dado estruturado (regressão de 12/08/2026).
 *
 * A doc de `parkingFacilitySchema` já dizia que `Offer` é promessa e que o ADR vale para schema
 * igual vale para tela. O `productOfferSchema` não cumpria.
 */
describe("productOfferSchema · unidade externa", () => {
  it("não publica aggregateRating de avaliação que a página esconde", () => {
    const s = produto(
      makeListing({ checkout_mode: "external", review_avg: 5, review_count: 1 }),
    );
    expect(s.aggregateRating).toBeUndefined();
    expect(s.review).toBeUndefined();
  });

  it("cala sobre o estoque, porque quem controla a vaga é o parceiro", () => {
    const s = produto(makeListing({ checkout_mode: "external" }));
    expect(s.offers).toMatchObject({ price: "30.00", priceCurrency: "BRL" });
    expect((s.offers as { availability?: string }).availability).toBeUndefined();
  });

  it("mantém o preço, que é informação da unidade e a página mostra", () => {
    const s = produto(makeListing({ checkout_mode: "external", base_price: 24.9 }));
    expect((s.offers as { price?: string }).price).toBe("24.90");
  });
});

describe("productOfferSchema · preço zero", () => {
  it("omite offers inteiro em vez de publicar R$ 0,00", () => {
    // Offer sem `price` é inválida para o Google, então não dá para emitir a oferta muda. Sem
    // preço não há oferta. As unidades espelhadas têm base_price = 0.
    const s = produto(makeListing({ base_price: 0, review_avg: 4.5, review_count: 10 }));
    expect(s.offers).toBeUndefined();
  });
});

/**
 * Regressão de 19/08/2026 (Search Console: "Especifique offers, review ou aggregateRating").
 *
 * O gate do ADR-009 tirou a oferta falsa e a nota escondida, e deixou a casca: um `Product` só
 * com nome, descrição e foto. As dezessete páginas de unidade do sitemap caíam nesse caso, todas
 * de checkout externo com `base_price = 0`, e o Google reprovava o item inteiro.
 */
describe("productOfferSchema · nó sem nada que qualifique", () => {
  it("devolve null quando não há preço nem nota, em vez de um Product inválido", () => {
    expect(productOfferSchema(makeListing({ base_price: 0, review_count: 0 }))).toBeNull();
  });

  it("é exatamente o caso da unidade externa em produção", () => {
    // Externa derruba `reviews` por capacidade, e o espelho de preço deixa base_price = 0.
    const s = productOfferSchema(
      makeListing({ checkout_mode: "external", base_price: 0, review_avg: 5, review_count: 1 }),
    );
    expect(s).toBeNull();
  });

  it("publica quando sobra ao menos uma das três: só nota basta", () => {
    const s = produto(makeListing({ base_price: 0, review_avg: 4.9, review_count: 30 }));
    expect(s.offers).toBeUndefined();
    expect(s.aggregateRating).toBeDefined();
  });

  it("publica quando sobra ao menos uma das três: só preço basta", () => {
    const s = produto(makeListing({ base_price: 24.9, review_count: 0 }));
    expect(s.aggregateRating).toBeUndefined();
    expect(s.offers).toBeDefined();
  });
});

/**
 * A oferta vinda do motor de preço (19/08/2026).
 *
 * `base_price` é campo de catálogo que ninguém preencheu nas espelhadas e que `simulate_price`
 * nem lê. Apagar o nó resolvia o erro do Search Console jogando fora um preço que existe; a
 * faixa do motor devolve o `Product` válido com o mesmo número que o card mostra.
 */
describe("productOfferSchema · faixa do motor de preço", () => {
  const faixa = { lowDaily: 21.12, highDaily: 119.2, offerCount: 4 };

  it("publica AggregateOffer com a faixa de diária, mesmo com base_price zero", () => {
    const s = produto(makeListing({ base_price: 0, checkout_mode: "external" }), [], {
      showcase: faixa,
    });
    expect(s.offers).toMatchObject({
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: "21.12",
      highPrice: "119.20",
      offerCount: 4,
    });
  });

  it("continua calando sobre estoque na externa, porque a vaga é do parceiro", () => {
    const s = produto(makeListing({ base_price: 0, checkout_mode: "external" }), [], {
      showcase: faixa,
    });
    expect((s.offers as { availability?: string }).availability).toBeUndefined();
  });

  it("na unidade própria afirma InStock, que ali é verdade", () => {
    const s = produto(makeListing({ base_price: 0 }), [], { showcase: faixa });
    expect((s.offers as { availability?: string }).availability).toBe(
      "https://schema.org/InStock",
    );
  });

  it("a faixa manda sobre base_price, para não existirem dois preços diferentes", () => {
    const s = produto(makeListing({ base_price: 30 }), [], { showcase: faixa });
    expect(s.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: "21.12" });
  });

  it("sem faixa, base_price segue de reserva como Offer simples", () => {
    const s = produto(makeListing({ base_price: 30 }));
    expect(s.offers).toMatchObject({ "@type": "Offer", price: "30.00" });
  });

  it("o nó nulo continua de rede quando não há faixa, nem base_price, nem nota", () => {
    expect(productOfferSchema(makeListing({ base_price: 0 }), [], { showcase: null })).toBeNull();
  });
});

/**
 * Caminho relativo do legado (`/Estacionamentos/...`) é o formato de metade das unidades. Em
 * JSON-LD o buscador não resolve URL relativa, e `image` é campo exigido no Product.
 */
describe("image absoluta", () => {
  it("prefixa o host no caminho relativo e não mexe no que já é absoluto", () => {
    const fotos = ["/Estacionamentos/x/1.webp", "https://cdn.exemplo/2.jpg"];
    const esperado = ["https://movepark.co/Estacionamentos/x/1.webp", "https://cdn.exemplo/2.jpg"];
    expect(produto(makeListing({ photos: fotos })).image).toEqual(esperado);
    expect(localBusinessSchema(makeListing({ photos: fotos })).image).toEqual(esperado);
  });
});

/**
 * Mesmo defeito de `productOfferSchema`, na vitrine do destino: parceiro sem preço na matriz
 * do build virava um `Product` só com nome, descrição e URL, que o Google reprova.
 */
describe("destinationOffersSchema · parceiro sem preço", () => {
  const comPreco = {
    name: "Aeropark",
    url: "/p/aeropark/gru/covered",
    price: { lowPrice: 18.9, highPrice: 447, offerCount: 4, guaranteedSpot: false },
  };

  it("entra como ParkingFacility, não como Product mudo", () => {
    const s = destinationOffersSchema({
      partners: [{ name: "Sem Preço", url: "/p/x/y/covered", price: null }],
      mapped: [],
    });
    const item = s.itemListElement[0].item as { "@type": string; offers?: unknown };
    expect(item["@type"]).toBe("ParkingFacility");
    expect(item.offers).toBeUndefined();
  });

  it("quem tem preço segue como Product com AggregateOffer", () => {
    const s = destinationOffersSchema({ partners: [comPreco], mapped: [] });
    const item = s.itemListElement[0].item as { "@type": string; offers?: { lowPrice: string } };
    expect(item["@type"]).toBe("Product");
    expect(item.offers?.lowPrice).toBe("18.90");
  });

  it("nenhum item da lista fica sem offers, review nem aggregateRating", () => {
    const s = destinationOffersSchema({
      partners: [comPreco, { name: "Sem Preço", url: "/p/x/y/covered", price: null }],
      mapped: [{ name: "Lote mapeado", url: "/estacionamento/z" }],
    });
    const produtosMudos = s.itemListElement.filter((e) => {
      const item = e.item as { "@type": string; offers?: unknown };
      return item["@type"] === "Product" && !item.offers;
    });
    expect(produtosMudos).toHaveLength(0);
  });
});

describe("breadcrumbSchema", () => {
  it("numera as posições a partir de 1", () => {
    const s = breadcrumbSchema([
      { name: "Home", url: "https://movepark.co" },
      { name: "Busca", url: "https://movepark.co/search" },
    ]);
    expect(s["@type"]).toBe("BreadcrumbList");
    expect(s.itemListElement).toHaveLength(2);
    expect(s.itemListElement[0]).toMatchObject({ position: 1, name: "Home" });
    expect(s.itemListElement[1]).toMatchObject({ position: 2, item: "https://movepark.co/search" });
  });
});

describe("itemListSchema", () => {
  it("monta ItemList numerando posições a partir de 1", () => {
    const s = itemListSchema([
      { name: "Aeroporto de Guarulhos", url: "https://movepark.co/destinos/aeroporto-de-guarulhos" },
      { name: "Congonhas", url: "https://movepark.co/destinos/congonhas" },
    ]);
    expect(s["@type"]).toBe("ItemList");
    expect(s.itemListElement).toHaveLength(2);
    expect(s.itemListElement[0]).toMatchObject({
      "@type": "ListItem",
      position: 1,
      name: "Aeroporto de Guarulhos",
      url: "https://movepark.co/destinos/aeroporto-de-guarulhos",
    });
    expect(s.itemListElement[1]).toMatchObject({ position: 2, name: "Congonhas" });
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
    expect(s.url).toBe("https://movepark.co/destinos/aeroporto-de-guarulhos");
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

  it("aeroporto ganha o subtipo Airport e o código IATA", () => {
    const s = destinationSchema({ ...base, type: "airport", code: "GRU" });
    expect(s["@type"]).toEqual(["Place", "Airport"]);
    expect(s.iataCode).toBe("GRU");
  });

  it("destino que não é aeroporto segue Place puro, sem iataCode", () => {
    const s = destinationSchema({ ...base, type: "bus_terminal", code: "tiete" });
    expect(s["@type"]).toBe("Place");
    expect(s.iataCode).toBeUndefined();
  });

  it("código sem cara de IATA não vira iataCode nem em aeroporto", () => {
    const s = destinationSchema({ ...base, type: "airport", code: "centro-sp" });
    expect(s["@type"]).toEqual(["Place", "Airport"]);
    expect(s.iataCode).toBeUndefined();
  });

  it("omite description e addressRegion quando ausentes", () => {
    const s = destinationSchema({ ...base, state: null, meta_description: null });
    expect(s.description).toBeUndefined();
    expect(s.address.addressRegion).toBeUndefined();
  });

  it("inclui image (várias proporções) quando há hero; omite quando vazio/ausente", () => {
    const imgs = ["https://cdn/hero-1200x630.jpg", "https://cdn/hero-1200x1200.jpg"];
    expect(destinationSchema({ ...base, image: imgs }).image).toEqual(imgs);
    expect(destinationSchema({ ...base, image: [] }).image).toBeUndefined();
    expect(destinationSchema(base).image).toBeUndefined();
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

describe("blogPostingSchema: imagem", () => {
  const base = { title: "t", slug: "s", publishedAt: "2026-01-01T00:00:00Z" };

  it("capa do bucket entra como está, sem duplicar o host", () => {
    // O bug: `${SITE_URL}${image}` com uma URL já absoluta produzia
    // "https://movepark.cohttps://…" nos 94 posts.
    const url = "https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets/blog/a.jpg";
    expect(blogPostingSchema({ ...base, image: url }).image).toBe(url);
  });

  it("caminho relativo ainda ganha o host", () => {
    expect(blogPostingSchema({ ...base, image: "/og/home.jpg" }).image).toBe(
      "https://movepark.co/og/home.jpg",
    );
    expect(blogPostingSchema({ ...base, image: "og/home.jpg" }).image).toBe(
      "https://movepark.co/og/home.jpg",
    );
  });

  it("sem capa, o campo não aparece", () => {
    expect(blogPostingSchema(base).image).toBeUndefined();
  });
});

describe("parkingFacilitySchema · lote mapeado (E0.17-f · ADR-010)", () => {
  const base = {
    name: "Talentos Park",
    url: "/estacionamentos/aeroporto-recife/talentos-park",
    latitude: -8.1309368,
    longitude: -34.9156297,
    address: "R. Projetada, 169 - Boa Viagem, Recife - PE, 51150-650",
    city: "Recife",
    state: "PE",
    country: "BR",
  };

  it("é ParkingFacility com geo, endereço estruturado e URL absoluta", () => {
    const s = parkingFacilitySchema(base);
    expect(s["@type"]).toBe("ParkingFacility");
    expect(s.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: -8.1309368,
      longitude: -34.9156297,
    });
    expect(s.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: base.address,
      addressLocality: "Recife",
      addressRegion: "PE",
      addressCountry: "BR",
    });
    expect(s.url).toBe("https://movepark.co/estacionamentos/aeroporto-recife/talentos-park");
  });

  // O que o schema NÃO emite é a parte decidida. Se algum destes campos aparecer, o Hub
  // passa a afirmar ao Google uma coisa que não verificou (horário), que não existe
  // (avaliação), ou que não pode prometer (oferta, ADR-009). Telefone é Q-021.
  it("não emite oferta, preço, horário, avaliação nem telefone", () => {
    const s = parkingFacilitySchema(base) as Record<string, unknown>;
    expect(s.offers).toBeUndefined();
    expect(s.priceRange).toBeUndefined();
    expect(s.openingHoursSpecification).toBeUndefined();
    expect(s.aggregateRating).toBeUndefined();
    expect(s.telephone).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/offer|price|openingHours|aggregateRating|telephone/i);
  });

  it("endereço vazio não vira string vazia no schema", () => {
    expect(parkingFacilitySchema({ ...base, address: null }).address.streetAddress).toBeUndefined();
  });

  it("amenidades viram LocationFeatureSpecification, e a lista vazia some", () => {
    expect(parkingFacilitySchema(base).amenityFeature).toBeUndefined();
    expect(parkingFacilitySchema({ ...base, amenities: [] }).amenityFeature).toBeUndefined();
    expect(parkingFacilitySchema({ ...base, amenities: ["coberto"] }).amenityFeature).toEqual([
      { "@type": "LocationFeatureSpecification", name: "coberto", value: true },
    ]);
  });
});
