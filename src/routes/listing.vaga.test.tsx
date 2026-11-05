import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { HelmetProvider } from "react-helmet-async";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/utils";
import { fetchListing } from "@/features/listing/api";
import ListingPage from "./listing";

/**
 * `?vaga=` tem que mandar na oferta em evidência, mesmo com a página vindo do SSG.
 *
 * O bug: o `vite-react-ssg` troca o loader do cliente por um fetch do JSON do build, indexado
 * por PATHNAME. A query string nunca chega nele, então o loader devolve sempre a ficha do tipo
 * padrão (o mais barato). Essa ficha entrava como `initialData` da query de `?vaga=uncovered`,
 * e `initialData` conta como dado fresco: o fetch certo nunca acontecia. A página abria em
 * Coberta com `?vaga=uncovered` na URL, e clicar nas outras tags não mudava nada.
 */

const BASE = import.meta.env.VITE_SUPABASE_URL;
const PATH = "/estacionamentos/:destino/:lote";
const DESTINO = "aeroporto-guarulhos";
const LOTE = "aeropark";

type Fotos = { unidade: string[]; porTipo: Record<string, string[]> };

function linha(
  code: string,
  name: string,
  basePrice: number,
  capacity: number,
  fotos: Fotos = { unidade: [], porTipo: {} },
) {
  return {
    id: `lpt-${code}`,
    capacity,
    is_active: true,
    external_checkout_url: null,
    photos: fotos.porTipo[code] ?? [],
    location: {
      id: "loc-1",
      slug: "aeropark",
      public_slug: LOTE,
      public_name: "Aeropark - Estacionamento Aeroporto Guarulhos",
      destination: {
        seo_label: "Aeroporto de Guarulhos, São Paulo (GRU)",
        short_name: "Guarulhos (GRU)",
        name: "Aeroporto de Guarulhos",
        type: "airport",
        city: "Guarulhos",
        public_slug: DESTINO,
      },
      name: "Aeropark",
      address: "R. Joaquina de Jesus, 745",
      phone: null,
      email: null,
      notice: null,
      has_notice: false,
      directions_text: null,
      shuttle_frequency_minutes: null,
      shuttle_to_terminal_minutes: null,
      reservation_policy: null,
      checkout_mode: "hub",
      go2park_enabled: false,
      go2park_whatsapp: null,
      timezone: "America/Sao_Paulo",
      latitude: -23,
      longitude: -46,
      google_place_id: null,
      review_avg: null,
      review_count: 0,
      photos: fotos.unidade,
      company: {
        id: "c-1",
        slug: "aeropark",
        name: "Aeropark",
        legal_name: "Aeropark Estacionamentos Ltda",
        tax_id: "11222333000144",
        created_at: "2025-08-01T12:00:00Z",
      },
      amenities: [],
    },
    company_parking_type: {
      base_price: basePrice,
      parking_type: { code, name, description: null },
    },
  };
}

/** O lote tem três tipos; o mais barato (coberta) é o que o build pré-renderiza. */
function montaPagina(vaga: string, fotos?: Fotos) {
  server.use(
    http.get(`${BASE}/rest/v1/location_parking_type`, () =>
      HttpResponse.json([
        linha("covered", "Vaga Coberta", 20, 320, fotos),
        linha("uncovered", "Vaga Descoberta", 30, 150, fotos),
        linha("valet", "Valet", 40, 40, fotos),
      ]),
    ),
  );

  return renderWithProviders(
    <HelmetProvider>
      <ListingPage />
    </HelmetProvider>,
    {
      route: `/estacionamentos/${DESTINO}/${LOTE}?vaga=${vaga}`,
      path: PATH,
      // Sem `vaga`: é o que o JSON do build devolve, em qualquer query string.
      loader: async () => ({
        kind: "unidade",
        listing: await fetchListing(DESTINO, LOTE),
        faqs: null,
        showcase: null,
      }),
    },
  );
}

async function selecionada(): Promise<string | null> {
  const grupo = await screen.findByRole("group", { name: "Tipo de vaga" });
  return (
    [...grupo.querySelectorAll("a")].find((a) => a.getAttribute("aria-current") === "true")
      ?.textContent ?? null
  );
}

// 5 s no waitFor: a primeira renderização da ficha carrega o módulo inteiro e, no Vitest 4,
// passou a estourar o 1 s padrão na primeira vez.
describe("oferta em evidência na ficha (?vaga=)", () => {
  it("abre na vaga que a URL pede, não na pré-renderizada", async () => {
    montaPagina("uncovered");
    await waitFor(async () => expect(await selecionada()).toBe("Vaga Descoberta"), { timeout: 5000 });
    expect(await screen.findByText("150 vagas")).toBeInTheDocument();
  });

  it("abre no valet quando a URL pede valet", async () => {
    montaPagina("valet");
    await waitFor(async () => expect(await selecionada()).toBe("Valet"), { timeout: 5000 });
  });

  it("usa a ficha do build quando a URL pede o tipo pré-renderizado", async () => {
    montaPagina("covered");
    await waitFor(async () => expect(await selecionada()).toBe("Vaga Coberta"), { timeout: 5000 });
  });
});

// A ficha deste arquivo é unidade própria (hub) sem nenhuma avaliação Movepark: o parceiro novo.
// Até 04/11/2026 ela mostrava "Seja o primeiro a avaliar" logo acima da nota do Google, e o
// vazio lia como unidade fraca. Agora o bloco só existe a partir da primeira avaliação.
describe("avaliações Movepark na ficha", () => {
  it("não mostra o bloco interno enquanto a unidade não tem avaliação", async () => {
    montaPagina("covered");
    await waitFor(async () => expect(await selecionada()).toBe("Vaga Coberta"), { timeout: 5000 });
    expect(screen.queryByText(/Seja o primeiro a avaliar/i)).not.toBeInTheDocument();
    expect(document.getElementById("avaliacoes")).toBeNull();
  });
});

// 05/11/2026: a galeria é da unidade, mas o tipo é escolhido dentro da ficha. Quem pede a
// Descoberta tem que ver o pátio aberto primeiro, e não o toldo da Coberta pré-renderizada.
describe("galeria por tipo de vaga", () => {
  const fotos: Fotos = {
    unidade: ["/Estacionamentos/aeropark/fachada.avif"],
    porTipo: {
      covered: ["/Estacionamentos/aeropark/toldo.avif"],
      uncovered: ["/Estacionamentos/aeropark/patio-aberto.avif"],
    },
  };

  async function primeiraFoto(): Promise<string> {
    const botoes = await screen.findAllByRole("button", { name: "Abrir foto 1 de Aeropark" });
    return botoes[0].querySelector("img")?.getAttribute("src") ?? "";
  }

  it("abre com a foto do tipo pedido na URL e mantém a da unidade depois", async () => {
    montaPagina("uncovered", fotos);
    await waitFor(async () => expect(await selecionada()).toBe("Vaga Descoberta"), { timeout: 5000 });
    await waitFor(async () => expect(await primeiraFoto()).toContain("patio-aberto"), { timeout: 5000 });
    const segunda = await screen.findAllByRole("button", { name: "Abrir foto 2 de Aeropark" });
    expect(segunda[0].querySelector("img")?.getAttribute("src")).toContain("fachada");
    expect(document.querySelector('img[src*="toldo"]')).toBeNull();
  });

  it("tipo sem foto própria fica com a galeria da unidade", async () => {
    montaPagina("valet", fotos);
    await waitFor(async () => expect(await selecionada()).toBe("Valet"), { timeout: 5000 });
    await waitFor(async () => expect(await primeiraFoto()).toContain("fachada"), { timeout: 5000 });
  });
});
