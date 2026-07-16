import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCep } from "./cep";

describe("fetchCep", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retorna null quando o CEP não tem 8 dígitos", async () => {
    expect(await fetchCep("123")).toBeNull();
  });

  it("mapeia a resposta do ViaCEP e normaliza a UF", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          logradouro: "Avenida Paulista",
          bairro: "Bela Vista",
          localidade: "São Paulo",
          uf: "sp",
        }),
      })),
    );
    expect(await fetchCep("01310-100")).toEqual({
      street: "Avenida Paulista",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    });
  });

  it("retorna null quando o ViaCEP marca erro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ erro: true }) })));
    expect(await fetchCep("00000-000")).toBeNull();
  });

  it("retorna null em falha de rede", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    expect(await fetchCep("01310-100")).toBeNull();
  });
});
