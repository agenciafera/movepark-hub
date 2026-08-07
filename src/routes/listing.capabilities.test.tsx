import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { HelmetProvider } from "react-helmet-async";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/utils";
import ListingPage from "./listing";

/**
 * Trava do ADR-009: bloco de promessa não renderiza sem consultar capacidade.
 *
 * O teste é de RENDER, e não de leitura do código, porque é o que o cliente vê que vincula a
 * Movepark. Se alguém puser um selo de vaga garantida direto na casca, o caso da unidade
 * externa quebra aqui, mesmo que o código pareça correto.
 */

const BASE = import.meta.env.VITE_SUPABASE_URL;
const ROTA = "/p/virapark/virapark/covered";
const PATH = "/p/:operatorSlug/:locationSlug/:parkingTypeCode";
const URL_SAIDA =
  "https://virapark.movepark.co/virapark/vaga-coberta?utm_source=movepark&utm_medium=organic&utm_campaign=afiliado-movepark";

function linha(checkoutMode: "hub" | "external") {
  return {
    id: "lpt-1",
    capacity: 100,
    is_active: true,
    external_checkout_url: checkoutMode === "external" ? URL_SAIDA : null,
    location: {
      id: "loc-1",
      slug: "virapark",
      name: "Virapark",
      address: "Antiga Rod. Santos Dumont, Km 64",
      phone: null,
      email: null,
      notice: null,
      has_notice: false,
      directions_text: null,
      shuttle_frequency_minutes: null,
      shuttle_to_terminal_minutes: null,
      reservation_policy: null,
      checkout_mode: checkoutMode,
      timezone: "America/Sao_Paulo",
      latitude: -23,
      longitude: -47,
      google_place_id: null,
      has_pcd_config: false,
      has_passenger_quantity: false,
      review_avg: 5,
      review_count: 1,
      photos: [],
      company: {
        id: "c-1",
        slug: "virapark",
        name: "Virapark",
        legal_name: null,
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

function montaPagina(checkoutMode: "hub" | "external") {
  server.use(
    http.get(`${BASE}/rest/v1/location_parking_type`, () =>
      HttpResponse.json([linha(checkoutMode)]),
    ),
  );
  // A página emite <Helmet> (meta + JSON-LD), que precisa do provider para montar.
  return renderWithProviders(
    <HelmetProvider>
      <ListingPage />
    </HelmetProvider>,
    { route: ROTA, path: PATH },
  );
}

/** Promessas de transação, pelo texto que o cliente lê. */
const PROMESSAS = [
  /Vaga garantida/i,
  /Cancelamento grátis/i,
  /Garantia Movepark/i,
  /Política de cancelamento/i,
  /Preço travado/i,
];

describe("single da unidade PRÓPRIA", () => {
  it("mantém as promessas, porque quem cumpre é a Movepark", async () => {
    montaPagina("hub");
    await screen.findAllByText(/Virapark/i);

    for (const promessa of PROMESSAS) {
      await waitFor(() => expect(screen.getAllByText(promessa).length).toBeGreaterThan(0));
    }
  });

  it("não declara responsabilidade de terceiro", async () => {
    montaPagina("hub");
    await screen.findAllByText(/Virapark/i);
    expect(screen.queryByText(/não se aplicam a esta reserva/i)).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("external-checkout-cta")).toHaveLength(0);
  });
});

describe("single da unidade EXTERNA", () => {
  it("nenhuma promessa de transação sobrevive", async () => {
    montaPagina("external");
    await screen.findAllByText(/Virapark/i);

    for (const promessa of PROMESSAS) {
      expect(screen.queryAllByText(promessa)).toHaveLength(0);
    }
  });

  it("declara quem responde pela reserva, no lugar das promessas", async () => {
    montaPagina("external");
    expect(
      await screen.findByText(/A reserva desta unidade é feita e administrada por Virapark/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/As garantias da Movepark não se aplicam a esta reserva/i)).toBeInTheDocument();
  });

  it("o CTA leva para o parceiro com a marcação de afiliado", async () => {
    montaPagina("external");
    // A página monta o card duas vezes (mobile e aside do desktop); no DOM de teste os dois
    // existem, porque quem esconde um deles é CSS.
    const [cta] = await screen.findAllByTestId("external-checkout-cta");
    expect(cta).toHaveAttribute("href", expect.stringContaining("utm_campaign=afiliado-movepark"));
    expect(cta).toHaveAttribute("href", expect.stringContaining("virapark.movepark.co"));
  });

  it("não mostra nota nem bloco de avaliação, mesmo com avaliação histórica", async () => {
    // A linha tem review_count = 1 e review_avg = 5, de reserva feita durante os testes.
    montaPagina("external");
    await screen.findAllByText(/Virapark/i);
    expect(screen.queryByText(/avaliaç/i)).not.toBeInTheDocument();
  });
});
