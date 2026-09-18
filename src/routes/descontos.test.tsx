import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
import DescontosPage from "./descontos";

const SUPABASE_URL = "http://localhost:54321";

/**
 * A vitrine pública roda SEM sessão de propósito: ela existe para quem ainda não tem conta.
 *
 * O caso que mais importa aqui é o guard do ADR-009. Enquanto nenhuma unidade do Hub puder honrar
 * cupom, a página não pode anunciar desconto, e quem decide isso é o servidor. A tela só desenha o
 * que chegou, então o teste prova que ela não inventa oferta quando a lista vem vazia.
 */
function stubVitrine(resposta: { offers: unknown[]; honored_by_units: number }) {
  server.use(
    http.post(`${SUPABASE_URL}/rest/v1/rpc/public_coupon_offers`, () =>
      HttpResponse.json(resposta),
    ),
  );
}

const OFERTA = {
  code: "BEMVINDO30",
  title: "Primeira reserva",
  terms: null,
  discount_type: "percent",
  discount_value: "30.00",
  max_discount_amount: "40.00",
  min_days: null,
  min_amount: null,
  valid_until: null,
  audience: "first_purchase",
};

describe("DescontosPage, /descontos (pública)", () => {
  it("mostra a campanha com valor, teto e condição, sem exigir login", async () => {
    stubVitrine({ offers: [OFERTA], honored_by_units: 3 });

    renderWithProviders(<DescontosPage />);

    expect(await screen.findByText("Primeira reserva")).toBeInTheDocument();
    expect(screen.getByText(/30% OFF/)).toBeInTheDocument();
    // O teto tem que aparecer: "30% OFF" sozinho promete mais do que a campanha entrega.
    expect(screen.getByText(/até/i)).toBeInTheDocument();
    // A condição vem do campo `audience`, não de texto livre.
    expect(screen.getByText("Vale na primeira reserva")).toBeInTheDocument();
    expect(screen.getByText("BEMVINDO30")).toBeInTheDocument();
  });

  it("sem unidade que honre cupom, não anuncia desconto nenhum (ADR-009)", async () => {
    // É o estado real de hoje: as unidades com preço são todas `external` e não aceitam cupom.
    // A página tem que sair do ar como cartaz, não mostrar campanha que ninguém pode usar.
    stubVitrine({ offers: [], honored_by_units: 0 });

    renderWithProviders(<DescontosPage />);

    expect(await screen.findByText("Nenhuma campanha ativa agora")).toBeInTheDocument();
    expect(screen.queryByText(/30% OFF/)).not.toBeInTheDocument();
    expect(screen.queryByText("BEMVINDO30")).not.toBeInTheDocument();
    // Mesmo sem campanha a página serve para algo: leva para a busca.
    expect(screen.getByRole("button", { name: /Buscar estacionamento/i })).toBeInTheDocument();
  });

  it("visitante sem conta é convidado a entrar, não bloqueado", async () => {
    stubVitrine({ offers: [OFERTA], honored_by_units: 3 });

    renderWithProviders(<DescontosPage />);

    expect(await screen.findByText(/Já tem conta\?/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entre" })).toHaveAttribute("href", "/login");
  });
});
