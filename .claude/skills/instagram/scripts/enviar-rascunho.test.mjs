import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "enviar-rascunho.mjs");
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "enviar-rascunho-"));
const HOJE = "2026-10-21";

afterAll(() => fs.rmSync(PASTA, { recursive: true, force: true }));

const META_BLOG = {
  tipo: "post",
  corte: "3",
  origem_post: "preco-do-estacionamento-no-aeroporto-de-confins",
  destination: "aeroporto-de-confins",
  keyphrase: "estacionamento no aeroporto de Confins",
  publicar_em: "2026-11-04",
  cta_url:
    "https://movepark.co/estacionamentos/aeroporto-confins?utm_source=instagram&utm_medium=social&utm_campaign=confins-teste",
};

const SLIDE_BLOG = {
  texto: "Quanto custa estacionar em Confins",
  arquivo: "estacionamento-aeroporto-confins-teste-01.jpg",
  alt: "pátio de estacionamento no aeroporto de Confins ao entardecer",
};

const LEGENDA_BLOG = [
  "Estacionamento no aeroporto de Confins: a conta da semana muda mais pelo traslado do que pela diária.",
  "",
  "Quem compara só o preço do dia esquece a van, o tempo de espera e a volta de madrugada.",
  "",
  "O guia completo está no link da bio.",
  "",
  "#confins #estacionamentoaeroporto #movepark",
].join("\n");

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

const SLIDE_NOTICIA = {
  texto: "Obra muda o acesso ao aeroporto de Confins",
  arquivo: "aeroporto-de-confins-obra-acesso-01.jpg",
  alt: "carro na rodovia de acesso ao aeroporto de Confins no fim da tarde",
};

const LEGENDA_NOTICIA = [
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

/**
 * Grava o rascunho numa pasta própria (com um arquivo qualquer no lugar do JPEG, porque o --seco
 * não sobe nada) e roda o script. Sempre com --seco, e com a URL apontada para uma porta morta:
 * se uma regressão deixar o envio passar, ele falha na conexão em vez de bater na plataforma.
 */
function enviar({ meta, slide, legenda, jpeg = true, story = true, extra = [] }) {
  const dir = fs.mkdtempSync(path.join(PASTA, "rascunho-"));
  const frente = Object.entries(meta).map(([k, v]) => `${k}: ${v}`);
  const slides = ["slides:", ...Object.entries(slide).map(([k, v], i) => `${i === 0 ? "  - " : "    "}${k}: ${v}`)];
  const arquivo = path.join(dir, "rascunho.md");
  fs.writeFileSync(arquivo, ["---", ...frente, ...slides, "---", "", legenda, ""].join("\n"));
  if (jpeg) fs.writeFileSync(path.join(dir, slide.arquivo), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  if (story) fs.writeFileSync(path.join(dir, slide.arquivo.replace(/\.jpg$/, "-story.jpg")), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const r = spawnSync(process.execPath, [SCRIPT, arquivo, "--seco", `--hoje=${HOJE}`, ...extra], {
    encoding: "utf8",
    env: { ...process.env, VITE_SUPABASE_URL: "http://127.0.0.1:1", SOCIAL_DRAFT_KEY: "chave-de-teste" },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, dir };
}

describe("enviar-rascunho: modo seco", () => {
  it("rascunho limpo imprime o payload da fila sem enviar nada", () => {
    const r = enviar({ meta: META_BLOG, slide: SLIDE_BLOG, legenda: LEGENDA_BLOG });
    expect(r.status).toBe(0);
    const post = JSON.parse(r.stdout);
    expect(post.publicar_em).toBe("2026-11-04T12:00:00-03:00");
    expect(post.corte).toBe(3);
    expect(typeof post.corte).toBe("number");
    expect(post.origem).toBe("preco-do-estacionamento-no-aeroporto-de-confins");
    expect(post.destination).toBe("aeroporto-de-confins");
    expect(post.keyphrase).toBe("estacionamento no aeroporto de Confins");
    expect(post.cta_url).toContain("/estacionamentos/aeroporto-confins?");
    expect(post.slides).toEqual([
      { arquivo: SLIDE_BLOG.arquivo, alt: SLIDE_BLOG.alt, texto: SLIDE_BLOG.texto },
    ]);
    expect(r.stdout).not.toMatch(/Na fila/);
  });

  it("por padrão sai no feed e nos stories, e o story 9:16 de cada slide vai junto", () => {
    const r = enviar({ meta: META_BLOG, slide: SLIDE_BLOG, legenda: LEGENDA_BLOG });
    expect(r.status).toBe(0);
    const post = JSON.parse(r.stdout);
    expect(post.placements).toEqual(["feed", "story"]);
    expect(post.stories).toEqual([{ arquivo: "estacionamento-aeroporto-confins-teste-01-story.jpg" }]);
  });

  it("onde: [feed] sai só no feed e não procura story", () => {
    const r = enviar({ meta: { ...META_BLOG, onde: "[feed]" }, slide: SLIDE_BLOG, legenda: LEGENDA_BLOG, story: false });
    expect(r.status).toBe(0);
    const post = JSON.parse(r.stdout);
    expect(post.placements).toEqual(["feed"]);
    expect(post.stories).toEqual([]);
  });

  it("story que falta aborta e diz como gerar", () => {
    const r = enviar({ meta: META_BLOG, slide: SLIDE_BLOG, legenda: LEGENDA_BLOG, story: false });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("estacionamento-aeroporto-confins-teste-01-story.jpg");
    expect(r.stderr).toContain("render-story.mjs");
  });

  it("reel não vai para a fila e o erro diz onde publicar", () => {
    const r = enviar({ meta: { ...META_BLOG, tipo: "reel" }, slide: SLIDE_BLOG, legenda: LEGENDA_BLOG });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("não publica reel");
    expect(r.stderr).toContain("app do Instagram");
  });

  it("lugar desconhecido em onde aborta", () => {
    const r = enviar({ meta: { ...META_BLOG, onde: "[feed, reel]" }, slide: SLIDE_BLOG, legenda: LEGENDA_BLOG });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("reel");
  });

  it("data com hora e fuso segue como veio", () => {
    const r = enviar({
      meta: { ...META_BLOG, publicar_em: "2026-11-04T08:30:00-03:00" },
      slide: SLIDE_BLOG,
      legenda: LEGENDA_BLOG,
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).publicar_em).toBe("2026-11-04T08:30:00-03:00");
  });

  it("bloqueio do analisador aborta e não imprime payload", () => {
    const r = enviar({
      meta: META_BLOG,
      slide: SLIDE_BLOG,
      legenda: LEGENDA_BLOG.replace("O guia completo", "Vaga garantida. O guia completo"),
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/Promessa de transação/);
  });

  it("JPEG que não está ao lado do rascunho aborta", () => {
    const r = enviar({ meta: META_BLOG, slide: SLIDE_BLOG, legenda: LEGENDA_BLOG, jpeg: false });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain(SLIDE_BLOG.arquivo);
  });

  it("--pasta procura os JPEGs e os stories em outro lugar", () => {
    const outra = fs.mkdtempSync(path.join(PASTA, "imagens-"));
    fs.writeFileSync(path.join(outra, SLIDE_BLOG.arquivo), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    fs.writeFileSync(path.join(outra, SLIDE_BLOG.arquivo.replace(/\.jpg$/, "-story.jpg")), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const r = enviar({
      meta: META_BLOG,
      slide: SLIDE_BLOG,
      legenda: LEGENDA_BLOG,
      jpeg: false,
      story: false,
      extra: ["--pasta", outra],
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).slides).toHaveLength(1);
    expect(JSON.parse(r.stdout).stories).toHaveLength(1);
  });
});

describe("enviar-rascunho: notícia", () => {
  it("notícia dentro da validade sai sem corte e avisa que a fila não confere o prazo", () => {
    const r = enviar({ meta: META_NOTICIA, slide: SLIDE_NOTICIA, legenda: LEGENDA_NOTICIA });
    expect(r.status).toBe(0);
    const post = JSON.parse(r.stdout);
    expect(post.origem).toBe("fato-2026-10-20-obra-acesso-confins");
    expect(post.corte).toBeNull();
    expect(post.publicar_em).toBe("2026-10-22T12:00:00-03:00");
    expect(r.stderr).toMatch(/fila ainda não confere a validade/);
    expect(r.stderr).toMatch(/2026-11-30/);
    expect(r.stderr).toMatch(/mesmo dia/);
  });

  it("post de blogpost não recebe o aviso de validade", () => {
    const r = enviar({ meta: META_BLOG, slide: SLIDE_BLOG, legenda: LEGENDA_BLOG });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/validade/);
  });

  it("notícia agendada depois da validade aborta", () => {
    const r = enviar({
      meta: { ...META_NOTICIA, validade: "2026-10-21", publicar_em: "2026-10-25" },
      slide: SLIDE_NOTICIA,
      legenda: LEGENDA_NOTICIA,
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/depois da validade/);
    // A mensagem é a da trava do próprio script, não a do analisador (que também barra).
    expect(r.stderr).toMatch(/A fila ainda não confere o prazo/);
  });
});
