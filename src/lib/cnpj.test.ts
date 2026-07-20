import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCnpj } from "./cnpj";

afterEach(() => vi.restoreAllMocks());

describe("fetchCnpj", () => {
  it("retorna null quando o CNPJ não tem 14 dígitos (sem chamar a rede)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchCnpj("123")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("mapeia os campos e converte a data ISO para DD/MM/AAAA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          razao_social: "ACME ESTACIONAMENTOS LTDA",
          nome_fantasia: "Acme Park",
          data_inicio_atividade: "2010-05-20",
        }),
      })),
    );
    const r = await fetchCnpj("11.222.333/0001-81");
    expect(r).toEqual({
      legalName: "ACME ESTACIONAMENTOS LTDA",
      tradeName: "Acme Park",
      foundingDate: "20/05/2010",
    });
  });

  it("devolve strings vazias quando a Receita não traz o campo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ razao_social: "X LTDA" }) })),
    );
    const r = await fetchCnpj("11222333000181");
    expect(r).toEqual({ legalName: "X LTDA", tradeName: "", foundingDate: "" });
  });

  it("retorna null em falha de rede", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("net");
      }),
    );
    expect(await fetchCnpj("11222333000181")).toBeNull();
  });
});
