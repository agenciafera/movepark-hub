import { describe, expect, it } from "vitest";
import { deveCarregarVideo } from "./heroVideo.logic";

describe("deveCarregarVideo", () => {
  it("carrega em rede boa, sem restrição nenhuma", () => {
    expect(deveCarregarVideo({ movimentoReduzido: false, tipoDeRede: "4g" })).toBe(true);
  });

  it("não carrega quando o sistema pediu menos movimento", () => {
    expect(deveCarregarVideo({ movimentoReduzido: true, tipoDeRede: "4g" })).toBe(false);
  });

  it("não carrega com economia de dados ligada", () => {
    expect(
      deveCarregarVideo({ movimentoReduzido: false, economiaDeDados: true, tipoDeRede: "4g" }),
    ).toBe(false);
  });

  /**
   * O cenário real do nosso usuário é o aeroporto lotado, onde a banda que o
   * vídeo come é a mesma que ele precisa para fechar a reserva.
   */
  it.each(["slow-2g", "2g", "3g"])("não carrega em %s", (tipoDeRede) => {
    expect(deveCarregarVideo({ movimentoReduzido: false, tipoDeRede })).toBe(false);
  });

  /**
   * Safari não implementa `navigator.connection`. Tratar ausência como rede
   * ruim tiraria o vídeo de quase todo iPhone, que é metade do nosso acesso.
   */
  it("carrega quando o navegador não informa a rede", () => {
    expect(deveCarregarVideo({ movimentoReduzido: false })).toBe(true);
  });

  /** Movimento reduzido manda mesmo em rede boa e sem economia de dados. */
  it("movimento reduzido vence qualquer outra condição", () => {
    expect(
      deveCarregarVideo({ movimentoReduzido: true, economiaDeDados: false, tipoDeRede: "4g" }),
    ).toBe(false);
  });
});
