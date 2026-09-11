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

function linha(code: string, name: string, basePrice: number, capacity: number) {
  return {
    id: `lpt-${code}`,
    capacity,
    is_active: true,
    external_checkout_url: null,
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
      has_pcd_config: false,
      has_passenger_quantity: false,
      review_avg: null,
      review_count: 0,
      photos: [],
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
function montaPagina(vaga: string) {
  server.use(
    http.get(`${BASE}/rest/v1/location_parking_type`, () =>
      HttpResponse.json([
        linha("covered", "Vaga Coberta", 20, 320),
        linha("uncovered", "Vaga Descoberta", 30, 150),
        linha("valet", "Valet", 40, 40),
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

describe("oferta em evidência na ficha (?vaga=)", () => {
  it("abre na vaga que a URL pede, não na pré-renderizada", async () => {
    montaPagina("uncovered");
    await waitFor(async () => expect(await selecionada()).toBe("Vaga Descoberta"));
    expect(await screen.findByText("150 vagas")).toBeInTheDocument();
  });

  it("abre no valet quando a URL pede valet", async () => {
    montaPagina("valet");
    await waitFor(async () => expect(await selecionada()).toBe("Valet"));
  });

  it("usa a ficha do build quando a URL pede o tipo pré-renderizado", async () => {
    montaPagina("covered");
    await waitFor(async () => expect(await selecionada()).toBe("Vaga Coberta"));
  });
});
