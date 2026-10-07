import { describe, expect, it } from "vitest";

import {
  GRUPOS,
  TERMOS,
  agregarTermos,
  deltaDePosicao,
  janelaDe28Dias,
  placar,
  termosDuplicados,
} from "./gsc-posicao.logic.mjs";

const linha = (consulta, device, impressions, position, clicks = 0) => ({
  keys: [consulta, device],
  impressions,
  position,
  clicks,
});

describe("lista de termos", () => {
  it("não repete termo depois de tirar acento", () => {
    expect(termosDuplicados()).toEqual([]);
  });

  it("tem cerca de 60 termos na meta e deixa marca de parceiro fora", () => {
    const daMeta = new Set(GRUPOS.filter((g) => g.meta).map((g) => g.id));
    const naMeta = TERMOS.filter((t) => daMeta.has(t.grupo));
    expect(naMeta.length).toBeGreaterThanOrEqual(55);
    expect(naMeta.length).toBeLessThanOrEqual(65);
    expect(GRUPOS.find((g) => g.id === "MARCA")?.meta).toBe(false);
    expect(naMeta.some((t) => /virapark|ponce park|urban ?park/.test(t.termo))).toBe(false);
  });

  it("traz as 12 consultas do placar, 3 por aeroporto", () => {
    const placarIa = TERMOS.filter((t) => t.origem === "placar");
    expect(placarIa).toHaveLength(12);
    for (const aeroporto of ["GRU", "VCP", "CNF", "CWB"]) {
      expect(placarIa.filter((t) => t.grupo === aeroporto)).toHaveLength(3);
    }
  });
});

describe("agregarTermos", () => {
  const termos = [
    {
      grupo: "GRU",
      cluster: "proximidade",
      origem: "cabeca",
      termo: "estacionamento próximo aeroporto guarulhos",
    },
  ];

  it("junta a busca com e sem acento e pondera a posição pela impressão", () => {
    const [r] = agregarTermos(
      [
        linha("estacionamento próximo aeroporto guarulhos", "MOBILE", 30, 10),
        linha("estacionamento proximo aeroporto guarulhos", "MOBILE", 10, 30),
        linha("estacionamento proximo aeroporto guarulhos", "DESKTOP", 10, 5),
      ],
      termos,
    );
    expect(r.porDispositivo.MOBILE).toMatchObject({ impressoes: 40, posicao: 15 });
    expect(r.porDispositivo.DESKTOP).toMatchObject({ impressoes: 10, posicao: 5 });
    expect(r.total.impressoes).toBe(50);
    expect(r.total.posicao).toBe(13);
  });

  it("não puxa a cauda longa que só contém o termo", () => {
    const [r] = agregarTermos(
      [linha("estacionamento próximo aeroporto guarulhos 24 horas", "MOBILE", 100, 2)],
      termos,
    );
    expect(r.total.impressoes).toBe(0);
    expect(r.total.posicao).toBeNull();
  });
});

describe("placar", () => {
  it("conta top 10 só nos grupos da meta e separa termo sem dado", () => {
    const linhas = agregarTermos([
      linha("estacionamento aeroporto guarulhos", "MOBILE", 100, 8),
      linha("estacionamento guarulhos", "MOBILE", 100, 10.4),
      linha("virapark", "MOBILE", 1000, 2),
    ]);
    const p = placar(linhas);
    expect(p.meta.noTop).toBe(1);
    expect(p.meta.semDado).toBe(p.meta.termos - 2);
    expect(p.grupos.find((g) => g.id === "MARCA").noTop).toBe(1);
  });
});

describe("medido", () => {
  it("não conta no top 10 a posição de quem teve meia dúzia de impressões", () => {
    const [r] = agregarTermos(
      [linha("estacionamento confins", "MOBILE", 3, 2)],
      [{ grupo: "CNF", cluster: "cabeca", origem: "cabeca", termo: "estacionamento confins" }],
    );
    expect(r.total.posicao).toBe(2);
    expect(placar([r]).grupos.find((g) => g.id === "CNF")).toMatchObject({ noTop: 0, semDado: 1 });
  });
});

describe("janelaDe28Dias e deltaDePosicao", () => {
  it("fecha 28 dias contando o atraso de coleta", () => {
    expect(janelaDe28Dias(new Date("2026-10-07T12:00:00Z"))).toEqual({
      inicio: "2026-09-07",
      fim: "2026-10-04",
    });
  });

  it("delta positivo é subir, e falta de dado não vira zero", () => {
    expect(deltaDePosicao(20, 12)).toBe(8);
    expect(deltaDePosicao(null, 12)).toBeNull();
  });
});
