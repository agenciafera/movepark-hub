import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { tabela, falha } from "@/test/msw/supabase";
import { Hero } from "./Hero";

describe("Hero — selo de prova social", () => {
  /**
   * O número nasce cravado no componente, então o SSG publica o selo no HTML e
   * o crawler vê o número. Se dependesse da rede, a home iria ao ar sem ele.
   */
  it("mostra o número padrão antes de qualquer resposta do servidor", () => {
    renderWithProviders(<Hero />);
    expect(screen.getByText("+300 mil clientes")).toBeInTheDocument();
  });

  it("assume o valor do app_setting quando ele difere do padrão", async () => {
    tabela("app_setting", "get", { json: [{ value: "412000" }] });
    renderWithProviders(<Hero />);
    await waitFor(() => {
      expect(screen.getByText("+412 mil clientes")).toBeInTheDocument();
    });
  });

  /**
   * Config é campo de texto livre. Um zero salvo por engano viraria
   * "+0 clientes" no topo da home, que é pior que um número desatualizado.
   */
  it("ignora valor zerado ou sujo e mantém o padrão", async () => {
    tabela("app_setting", "get", { json: [{ value: "0" }] });
    renderWithProviders(<Hero />);
    await waitFor(() => {
      expect(screen.getByText("+300 mil clientes")).toBeInTheDocument();
    });
  });

  /** Supabase fora do ar não pode apagar a prova social do topo da home. */
  it("mantém o selo quando a leitura falha", async () => {
    falha("tabela", "app_setting", 500);
    renderWithProviders(<Hero />);
    await waitFor(() => {
      expect(screen.getByText("+300 mil clientes")).toBeInTheDocument();
    });
  });
});
