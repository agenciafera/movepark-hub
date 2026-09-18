import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
import DescontosPage from "./descontos";

const SUPABASE_URL = "http://localhost:54321";

/**
 * A vitrine roda SEM sessão de propósito: ela mostra o catálogo como o cliente verá.
 *
 * A tela NÃO decide o que anunciar: ela desenha o que o servidor mandou. Os casos abaixo fixam
 * isso nos dois extremos, porque uma tela que inventasse oferta quando a lista vem vazia, ou que
 * filtrasse por conta própria, faria o `is_advertised` do Manager virar decoração.
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
    // `honored_by_units: 0` de propósito: a vitrine deixou de esconder campanha por causa disso,
    // porque a página saiu dos links públicos. Se alguém reintroduzir o guard aqui, este caso cai.
    stubVitrine({ offers: [OFERTA], honored_by_units: 0 });

    renderWithProviders(<DescontosPage />);

    expect(await screen.findByText("Primeira reserva")).toBeInTheDocument();
    expect(screen.getByText(/30% OFF/)).toBeInTheDocument();
    // O teto tem que aparecer: "30% OFF" sozinho promete mais do que a campanha entrega.
    expect(screen.getByText(/até/i)).toBeInTheDocument();
    // A condição vem do campo `audience`, não de texto livre.
    expect(screen.getByText("Vale na primeira reserva")).toBeInTheDocument();
    expect(screen.getByText("BEMVINDO30")).toBeInTheDocument();
    // O selo é o que faz a campanha de aquisição saltar na grade.
    expect(screen.getByText("Para quem nunca reservou")).toBeInTheDocument();
  });

  it("lista vazia não vira cartaz inventado", async () => {
    // `honored_by_units: 0` é o estado real de hoje. A vitrine continua mostrando o que o servidor
    // manda, e aqui ele não mandou nada: a tela não pode preencher o vazio sozinha.
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
