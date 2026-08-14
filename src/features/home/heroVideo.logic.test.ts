import { describe, expect, it } from "vitest";
import { CLIPES, CRUZAMENTO, deveCarregarVideo, deveCruzar, proximoClipe } from "./heroVideo.logic";

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

describe("proximoClipe", () => {
  it("anda um por vez", () => {
    expect(proximoClipe(0)).toBe(1);
    expect(proximoClipe(1)).toBe(2);
  });

  /** Depois do último a história recomeça, senão o banner morre na cancela. */
  it("depois do último volta para o primeiro", () => {
    expect(proximoClipe(CLIPES.length - 1)).toBe(0);
  });
});

describe("deveCruzar", () => {
  it("no meio do clipe ainda não é hora", () => {
    expect(deveCruzar(1, 5)).toBe(false);
  });

  it("dentro da janela de cruzamento, é hora", () => {
    expect(deveCruzar(5 - CRUZAMENTO + 0.1, 5)).toBe(true);
  });

  it("exatamente na borda da janela já conta", () => {
    expect(deveCruzar(5 - CRUZAMENTO, 5)).toBe(true);
  });

  /**
   * `duration` é `NaN` até os metadados chegarem. Sem a guarda, o primeiro
   * `timeupdate` de um vídeo recém-montado poderia disparar a troca e o banner
   * pularia um clipe antes de mostrá-lo.
   */
  it("não cruza enquanto a duração é desconhecida", () => {
    expect(deveCruzar(0, Number.NaN)).toBe(false);
    expect(deveCruzar(0, 0)).toBe(false);
    expect(deveCruzar(0, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
