import { afterEach, describe, expect, it, vi } from "vitest";

import { leituraDoBuild, limparLeiturasDoBuild } from "./leitura-do-build";

afterEach(() => {
  vi.useRealTimers();
  limparLeiturasDoBuild();
});

describe("leituraDoBuild", () => {
  /**
   * O motivo da peça: em 27/11/2026 o build lia a tabela inteira de traduções de FAQ
   * uma vez POR PÁGINA (~1.700 vezes por build, 154 kB cada), e oito builds seguidos
   * derrubaram o banco. Chamadas simultâneas têm que virar uma só.
   */
  it("chamadas simultâneas dividem uma leitura só", async () => {
    const busca = vi.fn(async () => ["a", "b"]);
    const leitura = leituraDoBuild(busca);

    const resultados = await Promise.all([leitura(), leitura(), leitura()]);

    expect(busca).toHaveBeenCalledTimes(1);
    expect(resultados).toEqual([
      ["a", "b"],
      ["a", "b"],
      ["a", "b"],
    ]);
  });

  it("chamada seguinte dentro do prazo usa o que já foi lido", async () => {
    const busca = vi.fn(async () => 1);
    const leitura = leituraDoBuild(busca);

    await leitura();
    await leitura();

    expect(busca).toHaveBeenCalledTimes(1);
  });

  it("depois do prazo lê de novo, para a navegação não ficar com dado velho", async () => {
    vi.useFakeTimers();
    let n = 0;
    const leitura = leituraDoBuild(async () => ++n, 1_000);

    expect(await leitura()).toBe(1);
    vi.advanceTimersByTime(999);
    expect(await leitura()).toBe(1);
    vi.advanceTimersByTime(2);
    expect(await leitura()).toBe(2);
  });

  it("erro não fica guardado: a próxima chamada tenta de novo", async () => {
    const busca = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("ok");
    const leitura = leituraDoBuild(busca);

    await expect(leitura()).rejects.toThrow("timeout");
    await expect(leitura()).resolves.toBe("ok");
    expect(busca).toHaveBeenCalledTimes(2);
  });

  it("quem esperava a leitura que falhou recebe o mesmo erro", async () => {
    const busca = vi.fn(async () => {
      throw new Error("caiu");
    });
    const leitura = leituraDoBuild(busca);

    const [a, b] = await Promise.allSettled([leitura(), leitura()]);

    expect(busca).toHaveBeenCalledTimes(1);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
  });

  it("limparLeiturasDoBuild esquece tudo (isolamento entre testes)", async () => {
    const busca = vi.fn(async () => 1);
    const leitura = leituraDoBuild(busca);

    await leitura();
    limparLeiturasDoBuild();
    await leitura();

    expect(busca).toHaveBeenCalledTimes(2);
  });
});
