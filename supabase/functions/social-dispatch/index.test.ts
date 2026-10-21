// Quem sai na rodada. Errar aqui é publicar duas vezes, publicar fora de hora ou despejar a fila.
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { IgConfig } from "../_shared/instagram.ts";
import { handler, rodada } from "./index.ts";
import { atrasados, diaEmSaoPaulo, escolher, jaPublicado, parados, type PostFila, resumoDoErro } from "./logic.ts";

const AGORA = new Date("2026-10-28T15:05:00Z"); // 12:05 em São Paulo
const p = (over: Partial<PostFila>): PostFila => ({
  id: "x",
  status: "approved",
  scheduled_at: "2026-10-28T15:00:00Z",
  published_at: null,
  updated_at: "2026-10-28T10:00:00Z",
  ...over,
});

Deno.test("diaEmSaoPaulo usa o fuso de São Paulo, não o UTC", () => {
  assertEquals(diaEmSaoPaulo(new Date("2026-10-29T01:30:00Z")), "2026-10-28");
});

Deno.test("escolhe o aprovado mais antigo cuja hora chegou", () => {
  const posts = [
    p({ id: "depois", scheduled_at: "2026-10-28T15:04:00Z" }),
    p({ id: "antes", scheduled_at: "2026-10-28T14:00:00Z" }),
    p({ id: "futuro", scheduled_at: "2026-10-28T18:00:00Z" }),
  ];
  assertEquals(escolher(posts, AGORA), { id: "antes" });
});

Deno.test("nada a publicar quando nenhum aprovado chegou na hora", () => {
  assertEquals(escolher([p({ scheduled_at: "2026-10-28T18:00:00Z" })], AGORA), { motivo: "nada" });
});

Deno.test("um por dia: já publicou hoje no fuso de São Paulo, não publica outro", () => {
  const posts = [p({ id: "a" }), p({ id: "b", status: "published", published_at: "2026-10-28T11:00:00Z" })];
  assertEquals(escolher(posts, AGORA), { motivo: "ja_publicou_hoje" });
});

Deno.test("publicado ontem à noite em São Paulo não conta como hoje", () => {
  const posts = [p({ id: "a" }), p({ id: "b", status: "published", published_at: "2026-10-28T02:00:00Z" })];
  assertEquals(escolher(posts, AGORA), { id: "a" });
});

Deno.test("com outra rodada publicando agora, espera", () => {
  const posts = [p({ id: "a" }), p({ id: "b", status: "publishing", updated_at: "2026-10-28T15:00:00Z" })];
  assertEquals(escolher(posts, AGORA), { motivo: "em_andamento" });
});

Deno.test("atraso acima de 6 horas vira overdue e não é escolhido", () => {
  const velho = p({ id: "velho", scheduled_at: "2026-10-28T08:00:00Z" });
  assertEquals(atrasados([velho], AGORA), ["velho"]);
  assertEquals(escolher([velho], AGORA), { motivo: "nada" });
});

Deno.test("publishing parado há mais de 15 minutos é reconciliado", () => {
  const parado = p({ id: "parado", status: "publishing", updated_at: "2026-10-28T14:40:00Z" });
  const vivo = p({ id: "vivo", status: "publishing", updated_at: "2026-10-28T15:00:00Z" });
  assertEquals(parados([parado, vivo], AGORA), ["parado"]);
});

Deno.test("container PUBLISHED nunca é publicado de novo", () => {
  assertEquals(jaPublicado("PUBLISHED"), true);
  assertEquals(jaPublicado("FINISHED"), false);
  assertEquals(jaPublicado("EXPIRED"), false);
});

Deno.test("resumo do erro cabe em 500 caracteres", () => {
  assertEquals(resumoDoErro("media_publish", { msg: "x".repeat(1000) }).length, 500);
});

// ── A rodada, com um banco e uma Graph API de mentira ─────────────────────────────────────
// O banco de mentira guarda linhas de verdade e aplica os filtros de verdade (eq, in, is, gte).
// Assim a pega condicionada ao status se comporta como no Postgres: se a linha mudou, o update
// não acha nada. O fetcher de mentira responde pelo roteiro e nunca sai para a rede.

type Linha = Record<string, unknown>;
type Filtro = ["eq" | "in" | "is" | "gte", string, unknown];
interface ChamadaDb {
  tabela: string;
  op: "select" | "update" | "insert";
  payload?: Linha;
  filtros: Filtro[];
  afetadas?: number;
}
interface ChamadaGraph {
  metodo: string;
  caminho: string;
  params: URLSearchParams;
}
type Passo = { tipo: "db"; db: ChamadaDb } | { tipo: "graph"; graph: ChamadaGraph };
type ErroDb = { code?: string; message: string };

const TOKEN = "EAAB-token-secreto-de-teste";
const IG = "17841400000000000";
const CFG: IgConfig = { token: TOKEN, igUserId: IG, versao: "v21.0" };
const ID = "ca3df28a-fbf9-4aa8-a71c-d30ef256da47";
const BASE = "https://x.supabase.co/storage/v1/object/public/assets-public/social/o/2/aaaa";
const SLIDES = [
  { url: `${BASE}/s-01.jpg`, path: "social/o/2/aaaa/s-01.jpg", alt: "pátio coberto", texto: "R$ 45 a diária" },
  { url: `${BASE}/s-02.jpg`, path: "social/o/2/aaaa/s-02.jpg", alt: "van do traslado", texto: null },
];
const LEGENDA = "Quanto custa estacionar no aeroporto de Confins? #confins #viagem #movepark";

const postBanco = (over: Linha = {}): Linha => ({
  id: ID,
  status: "approved",
  kind: "carousel",
  scheduled_at: "2026-10-28T15:00:00Z",
  published_at: null,
  updated_at: "2026-10-28T10:00:00Z",
  caption: LEGENDA,
  slides: SLIDES,
  ig_container_id: null,
  ig_media_id: null,
  ig_permalink: null,
  attempts: 0,
  last_error: null,
  deleted_at: null,
  ...over,
});

const chaveLigada = (valor: string) => [{ key: "social_dispatch_enabled", value: valor }];

function banco(
  seed: { social_post?: Linha[]; app_setting?: Linha[] },
  opts: {
    erro?: (c: ChamadaDb) => ErroDb | null;
    antes?: (c: ChamadaDb, tabelas: Record<string, Linha[]>) => void;
    rpc?: Record<string, (args: Linha) => unknown>;
    linha?: Passo[];
  } = {},
) {
  const tabelas: Record<string, Linha[]> = {
    social_post: structuredClone(seed.social_post ?? []),
    social_post_event: [],
    app_setting: structuredClone(seed.app_setting ?? chaveLigada("false")),
  };
  const chamadas: ChamadaDb[] = [];
  const rpcs: { nome: string; args: Linha }[] = [];
  const linha = opts.linha ?? [];
  let seq = 0;

  const casa = (l: Linha, [op, col, v]: Filtro): boolean => {
    const x = l[col];
    if (op === "eq") return x === v;
    if (op === "in") return (v as unknown[]).includes(x);
    if (op === "is") return v === null ? x === null || x === undefined : x === v;
    return x !== null && x !== undefined && Date.parse(String(x)) >= Date.parse(String(v));
  };

  const from = (tabela: string) => {
    const c: ChamadaDb = { tabela, op: "select", filtros: [] };
    let retorno = false;
    let contar = false;
    let cabeca = false;
    const executa = (terminal: "lista" | "maybeSingle" | "single") => {
      opts.antes?.(c, tabelas);
      chamadas.push(c);
      linha.push({ tipo: "db", db: c });
      const falha = opts.erro?.(c) ?? null;
      if (falha) return Promise.resolve({ data: null, error: falha, count: null });
      const linhas = tabelas[tabela] ?? (tabelas[tabela] = []);
      let achadas: Linha[] = [];
      if (c.op === "insert") {
        const novo = { id: `id-${++seq}`, created_at: new Date().toISOString(), ...c.payload };
        linhas.push(novo);
        achadas = [novo];
      } else {
        achadas = linhas.filter((l) => c.filtros.every((f) => casa(l, f)));
        if (c.op === "update") {
          for (const l of achadas) Object.assign(l, c.payload);
          c.afetadas = achadas.length;
        }
      }
      const devolvidas = c.op === "select" || retorno ? achadas.map((l) => structuredClone(l)) : null;
      const count = contar ? achadas.length : null;
      if (cabeca) return Promise.resolve({ data: null, error: null, count });
      if (terminal === "maybeSingle") return Promise.resolve({ data: devolvidas?.[0] ?? null, error: null, count });
      if (terminal === "single") {
        return Promise.resolve(
          devolvidas?.[0]
            ? { data: devolvidas[0], error: null, count }
            : { data: null, error: { message: "nenhuma linha" }, count },
        );
      }
      return Promise.resolve({ data: devolvidas, error: null, count });
    };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: (_campos?: string, o?: { count?: string; head?: boolean }) => {
        if (c.op === "select") {
          contar = o?.count === "exact";
          cabeca = !!o?.head;
        } else retorno = true;
        return b;
      },
      update: (p: Linha) => ((c.op = "update"), (c.payload = p), b),
      insert: (p: Linha) => ((c.op = "insert"), (c.payload = p), b),
      eq: (col: string, v: unknown) => (c.filtros.push(["eq", col, v]), b),
      in: (col: string, v: unknown) => (c.filtros.push(["in", col, v]), b),
      is: (col: string, v: unknown) => (c.filtros.push(["is", col, v]), b),
      gte: (col: string, v: unknown) => (c.filtros.push(["gte", col, v]), b),
      maybeSingle: () => executa("maybeSingle"),
      single: () => executa("single"),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => executa("lista").then(res, rej),
    };
    return b;
  };

  const cliente = {
    from,
    rpc: (nome: string, args: Linha) => {
      rpcs.push({ nome, args });
      const f = opts.rpc?.[nome];
      return Promise.resolve(f ? { data: f(args), error: null } : { data: null, error: { message: "rpc sem roteiro" } });
    },
  };
  const de = (tabela: string, op?: ChamadaDb["op"]) =>
    chamadas.filter((c) => c.tabela === tabela && (!op || c.op === op));
  const eventos = (kind?: string) => tabelas.social_post_event.filter((e) => !kind || e.kind === kind);
  const linhaDo = (id = ID) => tabelas.social_post.find((l) => l.id === id)!;
  const tocouEm = (c: ChamadaDb, col: string, valor: unknown) =>
    c.filtros.some(([op, k, v]) => op === "eq" && k === col && v === valor);
  return { cliente, tabelas, chamadas, rpcs, de, eventos, linhaDo, tocouEm };
}

type Rota = { status?: number; body: unknown } | undefined;

function graphFalso(
  roteiro: (c: ChamadaGraph) => Rota,
  opts: { antes?: (c: ChamadaGraph) => void; linha?: Passo[] } = {},
) {
  const chamadas: ChamadaGraph[] = [];
  const fetcher = ((entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const metodo = init?.method ?? "GET";
    const params = metodo === "GET" ? url.searchParams : new URLSearchParams(String(init?.body));
    const c: ChamadaGraph = { metodo, caminho: url.pathname.replace(/^\/v[\d.]+\//, ""), params };
    opts.antes?.(c);
    chamadas.push(c);
    opts.linha?.push({ tipo: "graph", graph: c });
    const r = roteiro(c);
    const corpo = r ? r.body : { error: { message: `sem roteiro: ${metodo} ${c.caminho}` } };
    return Promise.resolve(new Response(JSON.stringify(corpo), { status: r ? (r.status ?? 200) : 500 }));
  }) as typeof fetch;
  const quais = (metodo: string, caminho?: string) =>
    chamadas.filter((c) => c.metodo === metodo && (!caminho || c.caminho === caminho));
  return { fetcher, chamadas, quais };
}

/** O caminho em que tudo dá certo para o carrossel de dois slides. */
function roteiroFeliz(c: ChamadaGraph): Rota {
  if (c.metodo === "POST" && c.caminho === `${IG}/media`) {
    if (c.params.get("media_type") === "CAROUSEL") return { body: { id: "container-pai" } };
    return { body: { id: `filho-${new URL(c.params.get("image_url")!).pathname.split("/").pop()}` } };
  }
  if (c.metodo === "GET" && c.caminho === "container-pai") return { body: { status_code: "FINISHED" } };
  if (c.metodo === "POST" && c.caminho === `${IG}/media_publish`) return { body: { id: "midia-1" } };
  if (c.metodo === "GET" && c.caminho === "midia-1") {
    return { body: { permalink: "https://www.instagram.com/p/ABC123/" } };
  }
  return undefined;
}

const rodar = (db: ReturnType<typeof banco>, g: ReturnType<typeof graphFalso>, agora = AGORA) =>
  rodada({ admin: db.cliente, cfg: CFG, agora, fetcher: g.fetcher });

async function capturandoErros<T>(fn: () => Promise<T>): Promise<{ r: T; logs: string[] }> {
  const original = console.error;
  const logs: string[] = [];
  console.error = (...a: unknown[]) => {
    logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  };
  try {
    return { r: await fn(), logs };
  } finally {
    console.error = original;
  }
}

const semToken = (...coisas: unknown[]) => assertEquals(JSON.stringify(coisas).includes(TOKEN), false);

// ── (a) chave desligada ───────────────────────────────────────────────────────────────────

Deno.test("rodada com a chave desligada grava dry_run uma vez, não muda o post e não chama a Meta", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("false") });
  const g = graphFalso(roteiroFeliz);

  const r1 = await rodar(db, g);
  assertEquals(r1.status, 200);
  assertEquals(r1.body, { ok: true, acao: "dry_run", post: ID });
  assertEquals(db.eventos("dry_run").length, 1);
  const dry = db.eventos("dry_run")[0];
  assertEquals(dry.social_post_id, ID);
  assertStringIncludes(String(dry.note), "automática está desligada");
  assertEquals(dry.request, { slides: 2, caracteres: LEGENDA.length, scheduled_at: "2026-10-28T15:00:00Z" });

  const r2 = await rodar(db, g);
  assertEquals(r2.body, { ok: true, acao: "dry_run", post: ID });
  assertEquals(db.eventos("dry_run").length, 1, "a segunda rodada não grava outro dry_run");

  assertEquals(db.linhaDo().status, "approved");
  assertEquals(db.linhaDo().attempts, 0);
  assertEquals(db.de("social_post", "update").length, 0);
  assertEquals(g.chamadas.length, 0, "chave desligada nunca fala com a Meta");
});

Deno.test("chave com qualquer valor diferente de true conta como desligada", async () => {
  for (const valor of ["", "0", "sim", "falso"]) {
    const db = banco({ social_post: [postBanco()], app_setting: chaveLigada(valor) });
    const g = graphFalso(roteiroFeliz);
    const r = await rodar(db, g);
    assertEquals(r.body.acao, "dry_run", valor);
    assertEquals(g.chamadas.length, 0, valor);
  }
  const ausente = banco({ social_post: [postBanco()], app_setting: [] });
  const g = graphFalso(roteiroFeliz);
  assertEquals((await rodar(ausente, g)).body.acao, "dry_run");
  assertEquals(g.chamadas.length, 0);
});

Deno.test("erro ao contar o dry_run não grava outro às cegas", async () => {
  const db = banco({ social_post: [postBanco()] }, {
    erro: (c) => (c.tabela === "social_post_event" && c.op === "select" ? { message: "boom" } : null),
  });
  const g = graphFalso(roteiroFeliz);
  const { r, logs } = await capturandoErros(() => rodar(db, g));
  assertEquals(r.body.acao, "dry_run");
  assertEquals(db.eventos().length, 0);
  assertEquals(logs.length > 0, true);
});

// ── (b) caminho feliz ─────────────────────────────────────────────────────────────────────

Deno.test("chave ligada: pega o post, guarda o container antes de publicar e fecha como published", async () => {
  const linha: Passo[] = [];
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, { linha });
  const g = graphFalso(roteiroFeliz, { linha });

  const r = await rodar(db, g);
  assertEquals(r.status, 200);
  assertEquals(r.body, { ok: true, acao: "publicado", post: ID, permalink: "https://www.instagram.com/p/ABC123/" });

  // A pega: update condicionado a approved, no mesmo id, antes de qualquer chamada à Meta.
  const pega = db.de("social_post", "update").find((c) => c.payload?.status === "publishing")!;
  assertEquals(pega.payload, { status: "publishing", attempts: 1 });
  assertEquals(db.tocouEm(pega, "status", "approved"), true);
  assertEquals(db.tocouEm(pega, "id", ID), true);
  assertEquals(pega.afetadas, 1);
  const iPega = linha.findIndex((p) => p.tipo === "db" && p.db === pega);
  const iPrimeiraMeta = linha.findIndex((p) => p.tipo === "graph");
  assertEquals(iPega >= 0 && iPega < iPrimeiraMeta, true, "a pega vem antes da primeira chamada à Meta");

  // O container pai fica salvo ANTES do media_publish: é o que protege a nova tentativa.
  const salvo = db.de("social_post", "update").find((c) => c.payload?.ig_container_id === "container-pai")!;
  assertEquals(db.tocouEm(salvo, "status", "publishing"), true);
  const iSalvo = linha.findIndex((p) => p.tipo === "db" && p.db === salvo);
  const iPublish = linha.findIndex((p) => p.tipo === "graph" && p.graph.caminho === `${IG}/media_publish`);
  assertEquals(iSalvo >= 0 && iSalvo < iPublish, true, "o container é gravado antes do media_publish");

  // O que foi para a Meta.
  assertEquals(g.quais("POST", `${IG}/media`).length, 3, "dois slides e o pai");
  const pai = g.quais("POST", `${IG}/media`).find((c) => c.params.get("media_type") === "CAROUSEL")!;
  assertEquals(pai.params.get("children"), "filho-s-01.jpg,filho-s-02.jpg");
  assertEquals(pai.params.get("caption"), LEGENDA);
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 1, "media_publish uma única vez");
  assertEquals(g.quais("POST", `${IG}/media_publish`)[0].params.get("creation_id"), "container-pai");
  assertEquals(g.chamadas[0].params.get("access_token"), TOKEN, "o token vai para a Meta");

  // O fim: published, com a mídia e o link, e a escrita final condicionada a publishing.
  const l = db.linhaDo();
  assertEquals(l.status, "published");
  assertEquals(l.ig_media_id, "midia-1");
  assertEquals(l.ig_permalink, "https://www.instagram.com/p/ABC123/");
  assertEquals(l.ig_container_id, "container-pai");
  assertEquals(l.last_error, null);
  assertEquals(typeof l.published_at, "string");
  const final = db.de("social_post", "update").find((c) => c.payload?.status === "published")!;
  assertEquals(db.tocouEm(final, "status", "publishing"), true);
  assertEquals(final.afetadas, 1);

  // O rastro tem cada chamada, e nenhum registro carrega o token.
  for (const kind of ["container_child", "container_parent", "container_status", "media_publish", "permalink"]) {
    assertEquals(db.eventos(kind).length >= 1, true, kind);
  }
  assertEquals(db.eventos("container_child").length, 2);
  semToken(db.tabelas.social_post_event, db.tabelas.social_post, r);
});

Deno.test("imagem única segue o mesmo caminho, com um container só", async () => {
  const um = [SLIDES[0]];
  const db = banco({ social_post: [postBanco({ kind: "image", slides: um })], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => {
    if (c.metodo === "POST" && c.caminho === `${IG}/media`) return { body: { id: "container-pai" } };
    return roteiroFeliz(c);
  });
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "publicado");
  assertEquals(g.quais("POST", `${IG}/media`).length, 1);
  assertEquals(db.linhaDo().status, "published");
});

// ── (c) pega perdida ──────────────────────────────────────────────────────────────────────

Deno.test("outra rodada pegou o post antes: a pega não acha linha e a Meta não é chamada", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, {
    // Entre a leitura da fila e a pega, a outra rodada move o post para publishing.
    antes: (c, tabelas) => {
      if (c.tabela === "social_post" && c.op === "update") {
        tabelas.social_post.find((l) => l.id === ID)!.status = "publishing";
      }
    },
  });
  const g = graphFalso(roteiroFeliz);
  const r = await rodar(db, g);
  assertEquals(r.status, 200);
  assertEquals(r.body, { ok: true, acao: "outra_rodada", post: ID });
  assertEquals(g.chamadas.length, 0, "quem perdeu a pega não toca na Meta");
  const [pega] = db.de("social_post", "update");
  assertEquals(pega.afetadas, 0);
  assertEquals(db.linhaDo().status, "publishing", "o estado da outra rodada ficou intacto");
  assertEquals(db.linhaDo().attempts, 0, "e o contador não foi mexido");
  assertEquals(db.eventos().length, 0);
});

Deno.test("erro do banco na pega é 500 e a Meta não é chamada", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, {
    erro: (c) => (c.tabela === "social_post" && c.op === "update" ? { message: "conexão caiu" } : null),
  });
  const g = graphFalso(roteiroFeliz);
  const { r } = await capturandoErros(() => rodar(db, g));
  assertEquals(r.status, 500);
  assertEquals(g.chamadas.length, 0);
  assertEquals(db.linhaDo().status, "approved");
});

// ── (d) reconciliação: o container já foi publicado ───────────────────────────────────────

Deno.test("post com container já PUBLISHED é reconciliado pela legenda e media_publish nunca é chamado", async () => {
  const db = banco(
    { social_post: [postBanco({ ig_container_id: "container-velho", attempts: 1 })], app_setting: chaveLigada("true") },
  );
  const g = graphFalso((c) => {
    if (c.metodo === "GET" && c.caminho === "container-velho") return { body: { status_code: "PUBLISHED" } };
    if (c.metodo === "GET" && c.caminho === `${IG}/media`) {
      return {
        body: {
          data: [
            { id: "m-outro", caption: "Outro post da conta", permalink: "https://www.instagram.com/p/OUTRO/" },
            { id: "m-9", caption: `${LEGENDA}\n`, permalink: "https://www.instagram.com/p/DEF456/" },
          ],
        },
      };
    }
    return undefined;
  });

  const r = await rodar(db, g);
  assertEquals(r.body, { ok: true, acao: "reconciliado", post: ID });
  assertEquals(g.quais("POST").length, 0, "nenhum POST: nem container novo nem media_publish");
  assertEquals(g.quais("GET", "container-velho").length, 1, "o status do container é lido uma vez só");
  const l = db.linhaDo();
  assertEquals(l.status, "published");
  assertEquals(l.ig_media_id, "m-9");
  assertEquals(l.ig_permalink, "https://www.instagram.com/p/DEF456/");
  assertEquals(l.attempts, 1 + 1);
  const final = db.de("social_post", "update").find((c) => c.payload?.status === "published")!;
  assertEquals(db.tocouEm(final, "status", "publishing"), true);
  assertEquals(db.eventos("reconciled").length, 1);
  assertStringIncludes(String(db.eventos("reconciled")[0].note), "nada foi publicado de novo");
  semToken(db.tabelas.social_post_event, r);
});

Deno.test("container PUBLISHED mas a legenda não aparece no perfil: falha, sem publicar de novo", async () => {
  const db = banco({ social_post: [postBanco({ ig_container_id: "container-velho" })], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => {
    if (c.caminho === "container-velho") return { body: { status_code: "PUBLISHED" } };
    if (c.caminho === `${IG}/media`) return { body: { data: [{ id: "m-outro", caption: "Outro post" }] } };
    return undefined;
  });
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "falhou");
  assertEquals(g.quais("POST").length, 0);
  assertEquals(db.linhaDo().status, "failed");
  assertStringIncludes(String(db.linhaDo().last_error), "Confira no Instagram antes de reagendar");
  assertEquals(db.eventos("failed").length, 1);
});

Deno.test("container antigo que NÃO foi publicado: cria outro, publica uma vez e troca o container salvo", async () => {
  const db = banco({ social_post: [postBanco({ ig_container_id: "container-expirado" })], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => {
    if (c.metodo === "GET" && c.caminho === "container-expirado") return { body: { status_code: "EXPIRED" } };
    return roteiroFeliz(c);
  });
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "publicado");
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 1);
  assertEquals(db.linhaDo().ig_container_id, "container-pai");
  assertEquals(db.linhaDo().status, "published");
});

Deno.test("publishing parado há mais de 15 min com container PUBLISHED é reconciliado antes de qualquer coisa nova", async () => {
  const parado = postBanco({ status: "publishing", ig_container_id: "container-velho", updated_at: "2026-10-28T14:30:00Z" });
  const novo = postBanco({ id: "outro-post", scheduled_at: "2026-10-28T15:01:00Z", caption: "Outra legenda" });
  const db = banco({ social_post: [parado, novo], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => {
    if (c.caminho === "container-velho") return { body: { status_code: "PUBLISHED" } };
    if (c.caminho === `${IG}/media`) return { body: { data: [{ id: "m-7", caption: LEGENDA, permalink: "https://www.instagram.com/p/GHI789/" }] } };
    return undefined;
  });
  const r = await rodar(db, g);
  assertEquals(r.body, { ok: true, acao: "reconciliou", posts: [ID] });
  assertEquals(db.linhaDo().status, "published");
  assertEquals(db.linhaDo().ig_media_id, "m-7");
  assertEquals(db.linhaDo("outro-post").status, "approved", "a rodada só reconcilia; o próximo post espera a seguinte");
  assertEquals(g.quais("POST").length, 0);
  const final = db.de("social_post", "update").find((c) => c.payload?.status === "published")!;
  assertEquals(db.tocouEm(final, "status", "publishing"), true);
  assertEquals(db.eventos("reconciled").length, 1);
});

Deno.test("publishing parado sem container: falha e pede para reagendar; nada vai para a Meta", async () => {
  const db = banco({ social_post: [postBanco({ status: "publishing", updated_at: "2026-10-28T14:30:00Z" })], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroFeliz);
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "reconciliou");
  assertEquals(g.chamadas.length, 0);
  assertEquals(db.linhaDo().status, "failed");
  assertStringIncludes(String(db.linhaDo().last_error), "Reagende para tentar de novo");
  const falha = db.de("social_post", "update").find((c) => c.payload?.status === "failed")!;
  assertEquals(db.tocouEm(falha, "status", "publishing"), true);
});

Deno.test("publishing parado com container que não foi publicado: falha e a Meta só é consultada", async () => {
  const db = banco({ social_post: [postBanco({ status: "publishing", ig_container_id: "container-velho", updated_at: "2026-10-28T14:30:00Z" })], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => (c.caminho === "container-velho" ? { body: { status_code: "FINISHED" } } : undefined));
  await rodar(db, g);
  assertEquals(db.linhaDo().status, "failed");
  assertStringIncludes(String(db.linhaDo().last_error), "FINISHED");
  assertEquals(g.quais("POST").length, 0, "FINISHED não é PUBLISHED: não publica de novo às cegas");
});

Deno.test("publishing recente é de outra rodada: espera, e com a chave desligada o parado nem é tocado", async () => {
  const vivo = banco({ social_post: [postBanco({ status: "publishing", updated_at: "2026-10-28T15:00:00Z" }), postBanco({ id: "b" })], app_setting: chaveLigada("true") });
  const g1 = graphFalso(roteiroFeliz);
  assertEquals((await rodar(vivo, g1)).body.acao, "em_andamento");
  assertEquals(g1.chamadas.length, 0);

  const desligada = banco({ social_post: [postBanco({ status: "publishing", ig_container_id: "c", updated_at: "2026-10-28T14:30:00Z" })], app_setting: chaveLigada("false") });
  const g2 = graphFalso(roteiroFeliz);
  await rodar(desligada, g2);
  assertEquals(desligada.linhaDo().status, "publishing");
  assertEquals(g2.chamadas.length, 0);
});

Deno.test("reconciliar não pisa em post que mudou de estado enquanto a Meta era consultada", async () => {
  const db = banco({ social_post: [postBanco({ status: "publishing", ig_container_id: "container-velho", updated_at: "2026-10-28T14:30:00Z" })], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => {
    if (c.caminho === "container-velho") return { body: { status_code: "PUBLISHED" } };
    if (c.caminho === `${IG}/media`) return { body: { data: [{ id: "m-7", caption: LEGENDA, permalink: "p" }] } };
    return undefined;
  }, {
    // Outra rodada reconcilia o mesmo post durante a consulta.
    antes: (c) => {
      if (c.caminho === `${IG}/media`) Object.assign(db.linhaDo(), { status: "published", ig_media_id: "m-7" });
    },
  });
  const { logs } = await capturandoErros(() => rodar(db, g));
  assertEquals(db.eventos("reconciled").length, 0, "quem perdeu a escrita não registra reconciliação");
  assertEquals(db.linhaDo().status, "published");
  assertEquals(logs.length > 0, true, "a escrita perdida fica no log");
});

// ── (e) erro da Meta ──────────────────────────────────────────────────────────────────────

Deno.test("erro da Meta no container: failed com last_error em português, evento failed e 502", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => {
    if (c.metodo === "POST" && c.caminho === `${IG}/media`) {
      return { status: 400, body: { error: { message: "Invalid image url", code: 100 } } };
    }
    return undefined;
  });
  const r = await rodar(db, g);
  assertEquals(r.status, 502);
  assertEquals(r.body.ok, false);
  assertEquals(r.body.acao, "falhou");
  assertEquals(r.body.post, ID);
  const l = db.linhaDo();
  assertEquals(l.status, "failed");
  assertStringIncludes(String(l.last_error), "container do slide 1");
  assertStringIncludes(String(l.last_error), "Invalid image url");
  assertEquals(String(l.last_error).length <= 500, true);
  assertEquals(r.body.erro, l.last_error);
  const falha = db.de("social_post", "update").find((c) => c.payload?.status === "failed")!;
  assertEquals(db.tocouEm(falha, "status", "publishing"), true);
  assertEquals(db.tocouEm(falha, "id", ID), true);
  assertEquals(db.eventos("failed").length, 1);
  assertEquals(db.eventos("failed")[0].note, l.last_error);
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 0);
  semToken(db.tabelas.social_post_event, db.tabelas.social_post, r);
});

Deno.test("erro no media_publish: failed, mas o container fica salvo para a nova tentativa reconciliar", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => {
    if (c.metodo === "POST" && c.caminho === `${IG}/media_publish`) {
      return { status: 500, body: { error: { message: "Service unavailable" } } };
    }
    return roteiroFeliz(c);
  });
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "falhou");
  assertEquals(db.linhaDo().status, "failed");
  assertEquals(db.linhaDo().ig_container_id, "container-pai");
  assertStringIncludes(String(db.linhaDo().last_error), "media_publish");
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 1, "uma tentativa só, sem laço");
});

Deno.test("falha de rede na Meta não vaza o token para o banco nem para a resposta", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const fetcher = (() => Promise.reject(new TypeError(`error sending request for url (https://graph.facebook.com/v21.0/x?access_token=${TOKEN})`))) as typeof fetch;
  const r = await rodada({ admin: db.cliente, cfg: CFG, agora: AGORA, fetcher });
  assertEquals(r.body.acao, "falhou");
  semToken(db.tabelas.social_post_event, db.tabelas.social_post, r);
});

Deno.test("se o container não pode ser gravado, nada é publicado e o post falha com aviso claro", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, {
    erro: (c) => (c.tabela === "social_post" && c.op === "update" && c.payload?.ig_container_id ? { message: "banco fora" } : null),
  });
  const g = graphFalso(roteiroFeliz);
  const { r } = await capturandoErros(() => rodar(db, g));
  assertEquals(r.body.acao, "falhou");
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 0, "sem container salvo, não se publica");
  assertEquals(db.linhaDo().status, "failed");
  assertStringIncludes(String(db.linhaDo().last_error), "Nada foi publicado");
});

Deno.test("post que mudou de estado durante a publicação: a escrita final não pisa no que mudou", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroFeliz, {
    // Outra rodada reconcilia e marca failed enquanto o media_publish está no ar.
    antes: (c) => {
      if (c.caminho === `${IG}/media_publish`) db.linhaDo().status = "failed";
    },
  });
  const { r, logs } = await capturandoErros(() => rodar(db, g));
  assertEquals(db.linhaDo().status, "failed", "a escrita final não achou publishing e não mudou nada");
  assertEquals(db.linhaDo().ig_media_id, null);
  assertEquals(r.body.ok, false);
  assertEquals(logs.length > 0, true, "o descompasso fica no log");
  semToken(logs, r);
});

// ── (f) atrasados ─────────────────────────────────────────────────────────────────────────

Deno.test("aprovado com mais de 6 h de atraso vira overdue, com evento, e não é publicado", async () => {
  const velho = postBanco({ scheduled_at: "2026-10-28T08:00:00Z" });
  const db = banco({ social_post: [velho], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroFeliz);
  const r = await rodar(db, g);
  assertEquals(r.body, { ok: true, acao: "nada", ligada: true });
  assertEquals(db.linhaDo().status, "overdue");
  const [u] = db.de("social_post", "update");
  assertEquals(u.payload, { status: "overdue" });
  assertEquals(db.tocouEm(u, "status", "approved"), true);
  assertEquals(db.eventos("overdue").length, 1);
  assertStringIncludes(String(db.eventos("overdue")[0].note), "Passou mais de 6 horas");
  assertEquals(g.chamadas.length, 0);
});

Deno.test("o atraso vale também com a chave desligada: ligar depois não despeja a fila", async () => {
  const db = banco({ social_post: [postBanco({ scheduled_at: "2026-10-27T12:00:00Z" })], app_setting: chaveLigada("false") });
  const g = graphFalso(roteiroFeliz);
  await rodar(db, g);
  assertEquals(db.linhaDo().status, "overdue");
  assertEquals(db.eventos("overdue").length, 1);
  assertEquals(g.chamadas.length, 0);
});

Deno.test("na mesma rodada, o atrasado sai da fila e o do dia é publicado", async () => {
  const velho = postBanco({ id: "velho", scheduled_at: "2026-10-27T12:00:00Z" });
  const dia = postBanco({ id: ID });
  const db = banco({ social_post: [velho, dia], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroFeliz);
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "publicado");
  assertEquals(db.linhaDo("velho").status, "overdue");
  assertEquals(db.linhaDo(ID).status, "published");
});

Deno.test("overdue não pisa em post que o humano reagendou entre a leitura e a escrita", async () => {
  const db = banco({ social_post: [postBanco({ scheduled_at: "2026-10-28T08:00:00Z" })], app_setting: chaveLigada("true") }, {
    antes: (c, tabelas) => {
      if (c.tabela === "social_post" && c.op === "update") {
        Object.assign(tabelas.social_post[0], { status: "pending_review", scheduled_at: "2026-10-30T15:00:00Z" });
      }
    },
  });
  const { logs } = await capturandoErros(() => rodar(db, graphFalso(roteiroFeliz)));
  assertEquals(db.linhaDo().status, "pending_review");
  assertEquals(db.eventos("overdue").length, 0);
  assertEquals(logs.length > 0, true, "a escrita perdida fica no log");
});

// ── um por dia, fila vazia e erros de leitura ─────────────────────────────────────────────

Deno.test("já publicou hoje (fuso de São Paulo): o próximo espera e a Meta não é chamada", async () => {
  const feito = postBanco({ id: "feito", status: "published", published_at: "2026-10-28T11:00:00Z", scheduled_at: "2026-10-28T11:00:00Z", ig_media_id: "m" });
  const db = banco({ social_post: [feito, postBanco()], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroFeliz);
  const r = await rodar(db, g);
  assertEquals(r.body, { ok: true, acao: "ja_publicou_hoje", ligada: true });
  assertEquals(db.linhaDo().status, "approved");
  assertEquals(g.chamadas.length, 0);
});

Deno.test("fila vazia responde nada com o estado da chave", async () => {
  const g = graphFalso(roteiroFeliz);
  assertEquals((await rodar(banco({}), g)).body, { ok: true, acao: "nada", ligada: false });
  assertEquals((await rodar(banco({ app_setting: chaveLigada("true") }), g)).body, { ok: true, acao: "nada", ligada: true });
});

Deno.test("post excluído (deleted_at) não entra na fila", async () => {
  const db = banco({ social_post: [postBanco({ deleted_at: "2026-10-28T10:00:00Z" })], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroFeliz);
  assertEquals((await rodar(db, g)).body.acao, "nada");
  assertEquals(g.chamadas.length, 0);
});

Deno.test("erro ao ler a fila ou a chave é 500 e nada é feito", async () => {
  for (const tabela of ["social_post", "app_setting"]) {
    const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, {
      erro: (c) => (c.tabela === tabela && c.op === "select" ? { message: "boom" } : null),
    });
    const g = graphFalso(roteiroFeliz);
    const { r } = await capturandoErros(() => rodar(db, g));
    assertEquals(r.status, 500, tabela);
    assertEquals(g.chamadas.length, 0, tabela);
    assertEquals(db.de("social_post", "update").length, 0, tabela);
  }
});

// ── o rastro nunca derruba a rodada ───────────────────────────────────────────────────────

Deno.test("falha ao gravar evento é logada, sem token, e a publicação segue até o fim", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, {
    erro: (c) => (c.tabela === "social_post_event" && c.op === "insert" ? { code: "XX000", message: "tabela de eventos indisponível" } : null),
  });
  const g = graphFalso(roteiroFeliz);
  const { r, logs } = await capturandoErros(() => rodar(db, g));
  assertEquals(r.body.acao, "publicado");
  assertEquals(db.linhaDo().status, "published");
  assertEquals(db.eventos().length, 0);
  assertEquals(logs.length > 0, true, "cada evento perdido deixa uma linha no log");
  assertStringIncludes(logs.join("\n"), "social-dispatch");
  semToken(logs, r);
});

Deno.test("evento que estoura exceção (não só erro) também não derruba a rodada", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const original = db.cliente.from;
  db.cliente.from = (t: string) => {
    if (t === "social_post_event") throw new Error("cliente quebrado");
    return original(t);
  };
  const g = graphFalso(roteiroFeliz);
  const { r } = await capturandoErros(() => rodar(db, g));
  assertEquals(r.body.acao, "publicado");
  assertEquals(db.linhaDo().status, "published");
});

// ── (g) autenticação e config, pelo handler ───────────────────────────────────────────────

const URL_FN = "https://x.supabase.co/functions/v1/social-dispatch";
const reqPost = (chave?: string) =>
  new Request(URL_FN, { method: "POST", headers: chave === undefined ? {} : { "x-social-dispatch-key": chave }, body: "{}" });
const ENV_OK = (k: string) => ({ INSTAGRAM_ACCESS_TOKEN: TOKEN, INSTAGRAM_USER_ID: IG })[k];
const rpcCerta = { cron_key_matches: (a: Linha) => a.p_name === "social_dispatch_key" && a.p_key === "chave-certa" };

Deno.test("chave errada ou ausente é 401 e nada é lido, gravado nem enviado à Meta", async () => {
  for (const chave of ["chave-errada", "", undefined]) {
    const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, { rpc: rpcCerta });
    const g = graphFalso(roteiroFeliz);
    const res = await handler(reqPost(chave), { admin: db.cliente, getEnv: ENV_OK, agora: AGORA, fetcher: g.fetcher });
    assertEquals(res.status, 401, String(chave));
    assertEquals((await res.json()).error, "unauthorized");
    assertEquals(db.chamadas.length, 0, String(chave));
    assertEquals(g.chamadas.length, 0, String(chave));
    assertEquals(db.rpcs.length, 1);
    assertEquals(db.rpcs[0].args, { p_name: "social_dispatch_key", p_key: chave ?? "" });
  }
});

Deno.test("chave certa roda a rodada e devolve o JSON dela", async () => {
  const db = banco({}, { rpc: rpcCerta });
  const g = graphFalso(roteiroFeliz);
  const res = await handler(reqPost("chave-certa"), { admin: db.cliente, getEnv: ENV_OK, agora: AGORA, fetcher: g.fetcher });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, acao: "nada", ligada: false });
  assertEquals(res.headers.get("Content-Type"), "application/json");
});

Deno.test("chave certa com a rodada completa publica pelo handler", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, { rpc: rpcCerta });
  const g = graphFalso(roteiroFeliz);
  const res = await handler(reqPost("chave-certa"), { admin: db.cliente, getEnv: ENV_OK, agora: AGORA, fetcher: g.fetcher });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).acao, "publicado");
  assertEquals(db.linhaDo().status, "published");
});

Deno.test("sem token ou sem id da conta é 503, depois de conferir a chave", async () => {
  for (const env of [{ INSTAGRAM_USER_ID: IG }, { INSTAGRAM_ACCESS_TOKEN: TOKEN }, {}] as Record<string, string>[]) {
    const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, { rpc: rpcCerta });
    const g = graphFalso(roteiroFeliz);
    const res = await handler(reqPost("chave-certa"), { admin: db.cliente, getEnv: (k) => env[k], agora: AGORA, fetcher: g.fetcher });
    assertEquals(res.status, 503);
    assertEquals(db.chamadas.length, 0);
    assertEquals(g.chamadas.length, 0);
  }
});

Deno.test("método diferente de POST é 405 e nem chega ao banco", async () => {
  const db = banco({}, { rpc: rpcCerta });
  const res = await handler(new Request(URL_FN, { method: "GET" }), { admin: db.cliente, getEnv: ENV_OK, agora: AGORA });
  assertEquals(res.status, 405);
  assertEquals(db.rpcs.length, 0);
});

Deno.test("erro ao conferir a chave no banco é 500, não 401 nem liberação", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroFeliz);
  const { r: res } = await capturandoErros(() =>
    handler(reqPost("chave-certa"), { admin: db.cliente, getEnv: ENV_OK, agora: AGORA, fetcher: g.fetcher })
  );
  assertEquals(res.status, 500);
  assertEquals(g.chamadas.length, 0);
  assertEquals(db.linhaDo().status, "approved");
});
