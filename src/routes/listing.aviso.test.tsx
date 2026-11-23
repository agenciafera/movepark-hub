import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { HelmetProvider } from "react-helmet-async";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/utils";
import ListingPage from "./listing";

/**
 * Aviso do estacionamento na ficha da unidade (docs/specs/aviso-do-estacionamento.md).
 *
 * É fato da unidade, não promessa de transação: renderiza também na unidade EXTERNA (ADR-009),
 * em seção própria, fora dos blocos de garantia e cancelamento. Vazio = a seção não existe, sem
 * título órfão. Nenhum HTML cru chega à tela.
 */

const BASE = import.meta.env.VITE_SUPABASE_URL;
const ROTA = "/estacionamentos/aeroporto-guarulhos/pare-seguro";
const PATH = "/estacionamentos/:destino/:lote";

function linha(partnerNotice: string | null, checkoutMode: "hub" | "external" = "hub") {
  return {
    id: "lpt-1",
    capacity: 100,
    is_active: true,
    external_checkout_url:
      checkoutMode === "external" ? "https://ps.movepark.co/x?utm_source=movepark" : null,
    location: {
      id: "loc-1",
      slug: "pare-seguro",
      public_slug: "pare-seguro",
      public_name: "Pare Seguro - Estacionamento Aeroporto de Guarulhos",
      destination: {
        seo_label: "Aeroporto de Guarulhos (GRU)",
        short_name: "Guarulhos (GRU)",
        name: "Aeroporto de Guarulhos",
        type: "airport",
        city: "Guarulhos",
        public_slug: "aeroporto-guarulhos",
      },
      name: "Aeroporto de Guarulhos",
      address: "Av. Monteiro Lobato, 2738",
      phone: null,
      email: null,
      notice: null,
      has_notice: false,
      directions_text: null,
      shuttle_frequency_minutes: null,
      shuttle_to_terminal_minutes: null,
      reservation_policy: null,
      partner_notice_md: partnerNotice,
      checkout_mode: checkoutMode,
      go2park_enabled: false,
      go2park_whatsapp: null,
      timezone: "America/Sao_Paulo",
      latitude: -23,
      longitude: -46,
      google_place_id: null,
      review_avg: null,
      review_count: 0,
      photos: [],
      company: {
        id: "c-1",
        slug: "pare-seguro",
        name: "Pare Seguro",
        legal_name: null,
        tax_id: null,
        created_at: "2025-08-01T12:00:00Z",
      },
      amenities: [],
    },
    company_parking_type: {
      base_price: 40,
      parking_type: { code: "covered", name: "Vaga Coberta", description: null },
    },
  };
}

function monta(partnerNotice: string | null, checkoutMode: "hub" | "external" = "hub") {
  server.use(
    http.get(`${BASE}/rest/v1/location_parking_type`, () =>
      HttpResponse.json([linha(partnerNotice, checkoutMode)]),
    ),
  );
  return renderWithProviders(
    <HelmetProvider>
      <ListingPage />
    </HelmetProvider>,
    { route: ROTA, path: PATH },
  );
}

const AVISO =
  "**Malas extras são cobradas pelo estacionamento.**\n- A van leva até 2 malas por pessoa\n<b>cru</b> e [regras](https://exemplo.com/regras)";

describe("ficha da unidade: aviso do estacionamento", () => {
  it("sem aviso a seção não existe", async () => {
    monta(null);
    await screen.findAllByText(/Pare Seguro/i);
    expect(screen.queryByTestId("partner-notice")).not.toBeInTheDocument();
    expect(screen.queryByText("Aviso do estacionamento")).not.toBeInTheDocument();
  });

  it("com aviso, seção própria com negrito, lista e link; HTML cru vira texto", async () => {
    monta(AVISO);
    const secao = await screen.findByTestId("partner-notice");
    expect(secao).toHaveTextContent("Aviso do estacionamento");
    expect(secao.querySelector("strong")?.textContent).toBe(
      "Malas extras são cobradas pelo estacionamento.",
    );
    expect(secao.querySelector("li")?.textContent).toBe("A van leva até 2 malas por pessoa");
    const link = secao.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://exemplo.com/regras");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(secao.querySelector("b")).toBeNull();
    expect(secao.textContent).toContain("<b>cru</b>");
  });

  it("é fato da unidade: aparece também na unidade externa", async () => {
    monta(AVISO, "external");
    expect(await screen.findByTestId("partner-notice")).toBeInTheDocument();
  });
});
