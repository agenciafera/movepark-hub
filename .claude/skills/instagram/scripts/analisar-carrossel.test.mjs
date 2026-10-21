import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "analisar-carrossel.mjs");
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "analisar-carrossel-"));
const HOJE = "2026-10-21";

afterAll(() => fs.rmSync(PASTA, { recursive: true, force: true }));

const META_NOTICIA = {
  tipo: "post",
  origem_post: "fato-2026-10-20-obra-acesso-confins",
  tema: "acesso",
  destination: "aeroporto-de-confins",
  keyphrase: "aeroporto de Confins",
  fonte_nome: "BH Airport",
  fonte_url: "https://exemplo.com.br/comunicado",
  fonte_data: "2026-10-20",
  validade: "2026-11-30",
  publicar_em: "2026-10-22",
  cta_url:
    "https://movepark.co/estacionamentos/aeroporto-confins?utm_source=instagram&utm_medium=social&utm_campaign=fato-confins",
};

const SLIDE = [
  "slides:",
  "  - texto: Obra muda o acesso ao aeroporto de Confins",
  "    arquivo: aeroporto-de-confins-obra-acesso-01.jpg",
  "    alt: carro na rodovia de acesso ao aeroporto de Confins no fim da tarde",
];

const LEGENDA = [
  "Obra no acesso ao aeroporto de Confins: quem vai de carro precisa sair mais cedo.",
  "",
  "A faixa da direita fica fechada nos dias úteis.",
  "",
  "Saia com folga maior que a de costume.",
  "Reserve o estacionamento antes de sair de casa.",
  "",
  "Segundo a BH Airport, em 20/10.",
  "",
  "Compara os lotes no link da bio.",
  "",
  "#confins #dicasdeviagem #movepark",
].join("\n");

/** Grava o rascunho e devolve os achados do analisador, já em JSON. */
function analisar({ meta = {}, legenda = LEGENDA, hoje = HOJE } = {}) {
  const campos = { ...META_NOTICIA, ...meta };
  const frente = Object.entries(campos)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  const arquivo = path.join(PASTA, `rascunho-${Math.random().toString(36).slice(2)}.md`);
  fs.writeFileSync(arquivo, ["---", ...frente, ...SLIDE, "---", "", legenda, ""].join("\n"));
  const r = spawnSync(process.execPath, [SCRIPT, arquivo, "--json", `--hoje=${hoje}`], {
    encoding: "utf8",
  });
  const { achados } = JSON.parse(r.stdout);
  return { status: r.status, achados };
}

const achado = (achados, titulo) => achados.find((a) => a.titulo === titulo);

describe("analisar-carrossel: pauta de notícia", () => {
  it("notícia com fonte, data e validade passa sem bloqueio", () => {
    const { status, achados } = analisar();
    expect(achados.filter((a) => a.nivel === "vermelho")).toEqual([]);
    expect(status).toBe(0);
    expect(achado(achados, "Fonte na legenda").nivel).toBe("verde");
    expect(achado(achados, "Validade").nivel).toBe("verde");
  });

  it("bloqueia quando a legenda não nomeia a fonte", () => {
    const { status, achados } = analisar({
      legenda: LEGENDA.replace("Segundo a BH Airport, em 20/10.", "Informação de 20/10."),
    });
    expect(achado(achados, "Fonte na legenda").nivel).toBe("vermelho");
    expect(status).toBe(1);
  });

  it("fonte de nome curto não passa por estar dentro de outra palavra", () => {
    const { achados } = analisar({
      meta: { fonte_nome: "ANA" },
      legenda: LEGENDA.replace("Segundo a BH Airport, em 20/10.", "Vale a semana toda, desde 20/10."),
    });
    expect(achado(achados, "Fonte na legenda").nivel).toBe("vermelho");
  });

  it("bloqueia legenda sem a data junto da fonte", () => {
    const { achados } = analisar({
      legenda: LEGENDA.replace("Segundo a BH Airport, em 20/10.", "Segundo a BH Airport."),
    });
    expect(achado(achados, "Data na legenda").nivel).toBe("vermelho");
  });

  it("bloqueia notícia sem fonte_url ou sem validade", () => {
    const { achados } = analisar({ meta: { fonte_url: undefined, validade: undefined } });
    expect(achado(achados, "Link da fonte").nivel).toBe("vermelho");
    expect(achado(achados, "Validade").nivel).toBe("vermelho");
  });

  it("bloqueia agendamento depois da validade", () => {
    const { achados } = analisar({ meta: { validade: "2026-10-21", publicar_em: "2026-10-25" } });
    expect(achado(achados, "Validade").texto).toMatch(/depois da validade/);
    expect(achado(achados, "Validade").nivel).toBe("vermelho");
  });

  it("bloqueia quando a validade já passou no dia de hoje", () => {
    const { achados } = analisar({
      meta: { validade: "2026-10-20", publicar_em: undefined },
    });
    expect(achado(achados, "Validade").texto).toMatch(/já passou/);
  });

  it("crise com mais de 1 dia entre a fonte e a publicação bloqueia", () => {
    const { achados } = analisar({
      meta: { tema: "crise", fonte_data: "2026-10-18", publicar_em: "2026-10-21" },
    });
    expect(achado(achados, "Crise").nivel).toBe("vermelho");
  });

  it("fonte com mais de 7 dias pede reconferência sem barrar", () => {
    const { achados } = analisar({
      meta: { tema: "demanda", fonte_data: "2026-10-10", publicar_em: "2026-10-22" },
    });
    expect(achado(achados, "Idade da fonte").nivel).toBe("laranja");
  });

  it("fonte_data no futuro bloqueia", () => {
    const { achados } = analisar({ meta: { fonte_data: "2026-10-30" } });
    expect(achado(achados, "Data da fonte").texto).toMatch(/no futuro/);
  });

  it("post de blogpost não passa pelas travas de notícia", () => {
    const { achados } = analisar({
      meta: { origem_post: "estacionamento-no-aeroporto-de-confins-guia-completo" },
    });
    expect(achados.some((a) => a.grupo === "Notícia")).toBe(false);
  });
});

describe("analisar-carrossel: CTA e promessa", () => {
  it("escassez de vaga é promessa de transação (ADR-009)", () => {
    const { achados } = analisar({
      legenda: LEGENDA.replace("Compara os lotes", "Últimas vagas, compara os lotes"),
    });
    expect(achado(achados, "Promessa de transação").nivel).toBe("vermelho");
  });

  it("o caminho antigo /destinos/ é sinalizado", () => {
    const { achados } = analisar({
      meta: {
        cta_url:
          "https://movepark.co/destinos/aeroporto-de-confins?utm_source=instagram&utm_campaign=x",
      },
    });
    expect(achado(achados, "Caminho").nivel).toBe("laranja");
  });
});
