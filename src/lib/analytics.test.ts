import { afterEach, describe, expect, it } from "vitest";
import { trackEcommerce, trackEvent } from "./analytics";

afterEach(() => {
  delete window.dataLayer;
});

describe("trackEvent", () => {
  it("cria o dataLayer se não existe e empurra o evento com os parâmetros", () => {
    trackEvent("prospect_demand_signal", { prospect_slug: "x" });
    expect(window.dataLayer).toEqual([{ event: "prospect_demand_signal", prospect_slug: "x" }]);
  });
});

describe("trackEcommerce", () => {
  it("limpa o objeto ecommerce antes de cada evento, como o GTM pede", () => {
    const ecommerce = { currency: "BRL", value: 10, items: [] };
    trackEcommerce("view_item", ecommerce);
    expect(window.dataLayer).toEqual([
      { ecommerce: null, partner: null },
      { event: "view_item", ecommerce },
    ]);
  });

  // O GTM guarda o último valor de cada chave até a página recarregar. Sem zerar o `partner`,
  // a lista da busca vista depois da ficha de um parceiro herdaria o GA4 dele.
  it("zera o parceiro do evento anterior antes de um evento que não tem parceiro", () => {
    const partner = { company_slug: "a", ga4_measurement_id: "G-AB12CD34EF" };
    trackEcommerce("view_item", { items: [] }, { partner });
    trackEcommerce("view_item_list", { items: [] });
    expect(window.dataLayer?.[2]).toEqual({ ecommerce: null, partner: null });
    expect(window.dataLayer?.[3]).not.toHaveProperty("partner");
  });

  it("o que é do usuário fica fora de ecommerce", () => {
    trackEcommerce("purchase", { items: [] }, { user_id: "u1", new_customer: true });
    const evento = window.dataLayer?.[1] as Record<string, unknown>;
    expect(evento.user_id).toBe("u1");
    expect(evento.new_customer).toBe(true);
    expect(evento.ecommerce).toEqual({ items: [] });
  });

  it("engole erro do dataLayer em vez de derrubar a tela", () => {
    window.dataLayer = {
      push() {
        throw new Error("bloqueado");
      },
    } as unknown as unknown[];
    expect(() => trackEcommerce("view_item", { items: [] })).not.toThrow();
  });
});
