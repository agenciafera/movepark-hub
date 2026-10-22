// Quem sai na rodada. Errar aqui é publicar duas vezes, publicar fora de hora ou despejar a fila.
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { IgConfig } from "../_shared/instagram.ts";
import { handler, rodada } from "./index.ts";
import {
  atrasados,
  diaEmSaoPaulo,
  escolher,
  instanteDaMeta,
  jaPublicado,
  motivoParaNaoPublicarAgora,
  parados,
  type PostFila,
  resumoDoErro,
  textoDaFalha,
} from "./logic.ts";

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

Deno.test("textoDaFalha: prefixo em português por etapa e a mensagem da Meta, sem JSON cru", () => {
  const meta = (message: string) => ({ error: { message, code: 100 } });
  assertEquals(textoDaFalha("container do slide 1", meta("Invalid image url")), "Falhou ao enviar o slide 1 à Meta: Invalid image url.");
  assertEquals(textoDaFalha("container do slide 12", meta("Ruim.")), "Falhou ao enviar o slide 12 à Meta: Ruim.");
  assertEquals(textoDaFalha("container do carrossel", meta("Bad children")), "Falhou ao montar o carrossel na Meta: Bad children.");
  assertEquals(textoDaFalha("container", meta("Bad image")), "Falhou ao enviar a imagem à Meta: Bad image.");
  assertEquals(textoDaFalha("sem imagem", null), "O post não tem imagem para publicar.");
  // Erro de rede vem como { erro } do cliente da Graph API.
  assertEquals(textoDaFalha("container do slide 2", { erro: "error sending request" }), "Falhou ao enviar o slide 2 à Meta: error sending request.");
  // Sem mensagem: o prefixo sozinho, nunca o JSON.
  assertEquals(textoDaFalha("container", { foo: "bar" }), "Falhou ao enviar a imagem à Meta.");
  assertEquals(textoDaFalha("container", null), "Falhou ao enviar a imagem à Meta.");
  assertEquals(textoDaFalha("etapa nova", meta("x")), "Falhou na publicação (etapa nova): x.");
  assertEquals(textoDaFalha("container", meta("linha 1\n   linha 2")), "Falhou ao enviar a imagem à Meta: linha 1 linha 2.");
});

Deno.test("textoDaFalha: container que não ficou pronto diz o que a Meta respondeu", () => {
  const etapa = "container não ficou pronto";
  assertEquals(textoDaFalha(etapa, { pronto: false, status: "TIMEOUT" }), "A Meta demorou demais para processar as imagens.");
  assertEquals(textoDaFalha(etapa, { pronto: false, status: "ERROR", detalhe: "Erro 2207026" }), "A Meta recusou as imagens (ERROR): Erro 2207026.");
  assertEquals(textoDaFalha(etapa, { pronto: false, status: "EXPIRED" }), "A Meta recusou as imagens (EXPIRED).");
});

Deno.test("textoDaFalha: media_publish termina pedindo para conferir no Instagram, mesmo com texto longo", () => {
  const fim = " Confira no Instagram antes de reagendar.";
  assertEquals(
    textoDaFalha("media_publish", { error: { message: "Service unavailable" } }),
    `Falhou ao publicar na Meta: Service unavailable.${fim}`,
  );
  assertEquals(textoDaFalha("media_publish", {}), `Falhou ao publicar na Meta.${fim}`);
  const longo = textoDaFalha("media_publish", { error: { message: "x".repeat(2000) } });
  assertEquals(longo.length <= 500, true);
  assertEquals(longo.endsWith(fim), true);
  assertEquals(longo.startsWith("Falhou ao publicar na Meta: xxx"), true);
  const outro = textoDaFalha("container do slide 1", { error: { message: "y".repeat(2000) } });
  assertEquals(outro.length <= 500, true);
});

Deno.test("instanteDaMeta lê o formato da Meta (+0000), aceita offset e cai no agora quando não serve", () => {
  const agora = new Date("2026-10-29T03:10:00Z");
  assertEquals(instanteDaMeta("2026-10-29T02:55:00+0000", agora), "2026-10-29T02:55:00.000Z");
  assertEquals(instanteDaMeta("2026-10-28T23:55:00-0300", agora), "2026-10-29T02:55:00.000Z");
  assertEquals(instanteDaMeta("2026-10-29T02:55:00+00:00", agora), "2026-10-29T02:55:00.000Z");
  for (const ruim of [null, undefined, "", "ontem", "2026-13-45T00:00:00+0000"]) {
    assertEquals(instanteDaMeta(ruim, agora), agora.toISOString(), String(ruim));
  }
  // Relógio da Meta à frente do nosso: nunca registra publicação no futuro.
  assertEquals(instanteDaMeta("2026-10-29T03:30:00+0000", agora), agora.toISOString());
  // O dia em São Paulo é o do instante real da publicação, não o da reconciliação.
  assertEquals(diaEmSaoPaulo(new Date(instanteDaMeta("2026-10-29T02:55:00+0000", agora))), "2026-10-28");
  assertEquals(diaEmSaoPaulo(agora), "2026-10-29");
});

// ── A rodada, com um banco e uma Graph API de mentira ─────────────────────────────────────
// O banco de mentira guarda linhas de verdade e aplica os filtros de verdade (eq, in, is, gte).
// Assim a pega condicionada ao status se comporta como no Postgres: se a linha mudou, o update
// não acha nada. O fetcher de mentira responde pelo roteiro e nunca sai para a rede.

type Linha = Record<string, unknown>;
type Filtro = ["eq" | "in" | "is" | "gte" | "lte" | "lt", string, unknown];
interface ChamadaDb {
  tabela: string;
  op: "select" | "update" | "insert";
  payload?: Linha;
  filtros: Filtro[];
  colunas?: string;
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
  seed: { social_post?: Linha[]; app_setting?: Linha[]; profiles?: Linha[] },
  opts: {
    erro?: (c: ChamadaDb) => ErroDb | null;
    antes?: (c: ChamadaDb, tabelas: Record<string, Linha[]>) => void;
    rpc?: Record<string, (args: Linha) => unknown>;
    linha?: Passo[];
    /** JWT de mentira para o id do usuário. Fora daqui, `auth.getUser` responde sessão inválida. */
    usuarios?: Record<string, string>;
  } = {},
) {
  const tabelas: Record<string, Linha[]> = {
    social_post: structuredClone(seed.social_post ?? []),
    social_post_event: [],
    app_setting: structuredClone(seed.app_setting ?? chaveLigada("false")),
    profiles: structuredClone(seed.profiles ?? []),
  };
  const chamadas: ChamadaDb[] = [];
  const rpcs: { nome: string; args: Linha }[] = [];
  const jwts: string[] = [];
  const linha = opts.linha ?? [];
  let seq = 0;

  const casa = (l: Linha, [op, col, v]: Filtro): boolean => {
    const x = l[col];
    if (op === "eq") return x === v;
    if (op === "in") return (v as unknown[]).includes(x);
    if (op === "is") return v === null ? x === null || x === undefined : x === v;
    if (x === null || x === undefined) return false;
    const a = Date.parse(String(x));
    const b = Date.parse(String(v));
    return op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
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
      select: (campos?: string, o?: { count?: string; head?: boolean }) => {
        c.colunas = campos;
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
      lte: (col: string, v: unknown) => (c.filtros.push(["lte", col, v]), b),
      lt: (col: string, v: unknown) => (c.filtros.push(["lt", col, v]), b),
      maybeSingle: () => executa("maybeSingle"),
      single: () => executa("single"),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => executa("lista").then(res, rej),
    };
    return b;
  };

  const cliente = {
    from,
    auth: {
      getUser: (jwt?: string) => {
        jwts.push(String(jwt));
        const id = jwt ? opts.usuarios?.[jwt] : undefined;
        return Promise.resolve(
          id
            ? { data: { user: { id } }, error: null }
            : { data: { user: null }, error: { message: "invalid JWT" } },
        );
      },
    },
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
  return { cliente, tabelas, chamadas, rpcs, jwts, de, eventos, linhaDo, tocouEm };
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
  rodada({ admin: db.cliente, cfg: CFG, agora, relogio: () => agora, fetcher: g.fetcher });

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
  assertEquals(pega.filtros.some(([op, col, v]) => op === "lte" && col === "scheduled_at" && v === AGORA.toISOString()), true);
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
  assertEquals(l.published_at, AGORA.toISOString(), "o relógio da rodada");
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
  assertStringIncludes(String(db.eventos("reconciled")[0].note), "Nada foi publicado de novo");
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

Deno.test("container antigo cujo status não foi lido (Meta fora do ar): falha sem publicar, porque pode já estar publicado", async () => {
  // Se a leitura falhou e o container JÁ estava publicado, seguir adiante publicaria o post de novo.
  for (const resposta of [{ status: 500, body: { error: { message: "temporariamente indisponível" } } }, { body: {} }]) {
    const db = banco({ social_post: [postBanco({ ig_container_id: "container-velho" })], app_setting: chaveLigada("true") });
    const g = graphFalso((c) => (c.metodo === "GET" && c.caminho === "container-velho" ? resposta : roteiroFeliz(c)));
    const r = await rodar(db, g);
    assertEquals(r.body.acao, "falhou");
    assertEquals(g.quais("POST").length, 0, "nem container novo nem media_publish");
    assertEquals(db.linhaDo().status, "failed");
    assertStringIncludes(String(db.linhaDo().last_error), "nada foi publicado");
    assertEquals(db.eventos("failed").length, 1);
  }
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
  assertEquals(l.last_error, "Falhou ao enviar o slide 1 à Meta: Invalid image url.");
  assertEquals(String(l.last_error).includes("{"), false, "o Manager não mostra JSON cru");
  assertEquals(r.body.erro, l.last_error);
  const falha = db.de("social_post", "update").find((c) => c.payload?.status === "failed")!;
  assertEquals(db.tocouEm(falha, "status", "publishing"), true);
  assertEquals(db.tocouEm(falha, "id", ID), true);
  assertEquals(db.eventos("failed").length, 1);
  assertEquals(db.eventos("failed")[0].note, l.last_error);
  assertEquals(db.eventos("failed")[0].response, { error: { message: "Invalid image url", code: 100 } }, "a resposta crua fica no evento");
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
  assertEquals(
    db.linhaDo().last_error,
    "Falhou ao publicar na Meta: Service unavailable. Confira no Instagram antes de reagendar.",
  );
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

Deno.test("overdue só marca quem continua com a hora marcada mais de 6 h atrás, na própria escrita", async () => {
  const db = banco({ social_post: [postBanco({ scheduled_at: "2026-10-28T08:00:00Z" })], app_setting: chaveLigada("true") });
  await rodar(db, graphFalso(roteiroFeliz));
  const [u] = db.de("social_post", "update");
  // AGORA é 15:05Z; 6 h antes é 09:05Z. O filtro vai junto com o do status.
  assertEquals(u.filtros.some(([op, col, v]) => op === "lt" && col === "scheduled_at" && v === "2026-10-28T09:05:00.000Z"), true);
  assertEquals(db.tocouEm(u, "status", "approved"), true);
});

Deno.test("overdue não marca post que o humano reagendou para o futuro, ainda aprovado, entre a leitura e a escrita", async () => {
  // Reagendar um post `approved` só muda a data: o status continua `approved`, então o filtro de
  // status sozinho deixaria passar e o post reagendado viraria atrasado.
  const db = banco({ social_post: [postBanco({ scheduled_at: "2026-10-28T08:00:00Z" })], app_setting: chaveLigada("true") }, {
    antes: (c, tabelas) => {
      if (c.tabela === "social_post" && c.op === "update") {
        Object.assign(tabelas.social_post[0], { scheduled_at: "2026-10-30T15:00:00Z" });
      }
    },
  });
  const { logs } = await capturandoErros(() => rodar(db, graphFalso(roteiroFeliz)));
  assertEquals(db.linhaDo().status, "approved");
  assertEquals(db.linhaDo().scheduled_at, "2026-10-30T15:00:00Z");
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

// ── media_publish ambíguo: a Meta às vezes publica e responde erro ────────────────────────

/** Roteiro em que o media_publish responde 500. `aoErrar` diz o que aconteceu de verdade na Meta. */
function roteiroAmbiguo(
  estado: { publicou: boolean },
  opts: { aoErrar: "publicado" | "nao_publicado" | "ilegivel"; midia?: Linha[] },
) {
  return (c: ChamadaGraph): Rota => {
    if (c.metodo === "POST" && c.caminho === `${IG}/media_publish`) {
      estado.publicou = true;
      return { status: 500, body: { error: { message: "Service unavailable" } } };
    }
    if (c.metodo === "GET" && c.caminho === "container-pai") {
      if (estado.publicou && opts.aoErrar === "ilegivel") return { status: 500, body: { error: { message: "fora do ar" } } };
      return { body: { status_code: estado.publicou && opts.aoErrar === "publicado" ? "PUBLISHED" : "FINISHED" } };
    }
    if (c.metodo === "GET" && c.caminho === `${IG}/media`) return { body: { data: opts.midia ?? [] } };
    return roteiroFeliz(c);
  };
}

const FIM_CONFIRA = "Confira no Instagram antes de reagendar.";

Deno.test("media_publish responde 500 mas o container está PUBLISHED: reconcilia e media_publish roda uma vez só", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroAmbiguo({ publicou: false }, {
    aoErrar: "publicado",
    midia: [{ id: "m-amb", caption: LEGENDA, permalink: "https://www.instagram.com/p/AMB/", timestamp: "2026-10-28T15:04:50+0000" }],
  }));
  const r = await rodar(db, g);
  assertEquals(r.status, 200);
  assertEquals(r.body, { ok: true, acao: "reconciliado", post: ID });
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 1, "o media_publish não roda de novo");
  assertEquals(g.quais("GET", "container-pai").length, 2, "a espera do container e uma leitura depois do erro");
  const l = db.linhaDo();
  assertEquals(l.status, "published");
  assertEquals(l.ig_media_id, "m-amb");
  assertEquals(l.ig_permalink, "https://www.instagram.com/p/AMB/");
  assertEquals(l.ig_container_id, "container-pai");
  assertEquals(l.last_error, null);
  assertEquals(db.eventos("reconciled").length, 1);
  assertEquals(db.eventos("failed").length, 0, "post que está no ar não ganha evento de falha");
  const final = db.de("social_post", "update").find((c) => c.payload?.status === "published")!;
  assertEquals(db.tocouEm(final, "status", "publishing"), true);
  semToken(db.tabelas.social_post_event, db.tabelas.social_post, r);
});

Deno.test("media_publish responde 500 e o container não está PUBLISHED: failed pedindo para conferir no Instagram", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroAmbiguo({ publicou: false }, { aoErrar: "nao_publicado" }));
  const r = await rodar(db, g);
  assertEquals(r.status, 502);
  assertEquals(r.body.acao, "falhou");
  assertEquals(db.linhaDo().status, "failed");
  assertEquals(db.linhaDo().last_error, `Falhou ao publicar na Meta: Service unavailable. ${FIM_CONFIRA}`);
  assertEquals(db.eventos("failed")[0].response, { error: { message: "Service unavailable" } });
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 1);
  assertEquals(g.quais("GET", `${IG}/media`).length, 0, "container fora de PUBLISHED não vai procurar mídia");
});

Deno.test("media_publish responde 500 e o container não pôde ser lido: failed pedindo para conferir, sem publicar de novo", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroAmbiguo({ publicou: false }, { aoErrar: "ilegivel" }));
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "falhou");
  assertEquals(db.linhaDo().status, "failed");
  assertEquals(String(db.linhaDo().last_error).endsWith(FIM_CONFIRA), true);
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 1);
});

Deno.test("media_publish responde 500, container PUBLISHED mas a legenda não está no perfil: failed, sem publicar de novo", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") });
  const g = graphFalso(roteiroAmbiguo({ publicou: false }, { aoErrar: "publicado", midia: [{ id: "m-x", caption: "Outro post" }] }));
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "falhou");
  assertEquals(db.linhaDo().status, "failed");
  assertEquals(String(db.linhaDo().last_error).endsWith(FIM_CONFIRA), true);
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 1);
});

// ── published_at da reconciliação vem da Meta ─────────────────────────────────────────────

Deno.test("reconciliação usa o horário da mídia: no ar às 23h55 e achada à 0h10 conta no dia certo, e o do dia seguinte sai", async () => {
  const agora = new Date("2026-10-29T03:10:00Z"); // 00:10 em São Paulo, já dia 29
  const parado = postBanco({
    status: "publishing",
    ig_container_id: "container-velho",
    scheduled_at: "2026-10-29T02:50:00Z",
    updated_at: "2026-10-29T02:40:00Z",
  });
  const seguinte = postBanco({ id: "seguinte", scheduled_at: "2026-10-29T15:00:00Z", caption: "Legenda do dia 29" });
  const db = banco({ social_post: [parado, seguinte], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => {
    if (c.metodo === "GET" && c.caminho === "container-velho") return { body: { status_code: "PUBLISHED" } };
    if (c.metodo === "GET" && c.caminho === `${IG}/media`) {
      return { body: { data: [{ id: "m-7", caption: LEGENDA, permalink: "https://www.instagram.com/p/GHI789/", timestamp: "2026-10-29T02:55:00+0000" }] } };
    }
    return roteiroFeliz(c);
  });
  const r1 = await rodar(db, g, agora);
  assertEquals(r1.body.acao, "reconciliou");
  const publicadoEm = String(db.linhaDo().published_at);
  assertEquals(publicadoEm, "2026-10-29T02:55:00.000Z", "o horário da Meta, não o da rodada");
  assertEquals(diaEmSaoPaulo(new Date(publicadoEm)), "2026-10-28");

  // Se o published_at fosse o da rodada (00:10 de dia 29), o post de dia 29 ficaria bloqueado.
  const r2 = await rodar(db, g, new Date("2026-10-29T15:05:00Z"));
  assertEquals(r2.body.acao, "publicado");
  assertEquals(db.linhaDo("seguinte").status, "published");
});

Deno.test("mídia sem timestamp: a reconciliação cai no relógio da rodada", async () => {
  const db = banco({ social_post: [postBanco({ ig_container_id: "container-velho" })], app_setting: chaveLigada("true") });
  const g = graphFalso((c) => {
    if (c.caminho === "container-velho") return { body: { status_code: "PUBLISHED" } };
    if (c.caminho === `${IG}/media`) return { body: { data: [{ id: "m-1", caption: LEGENDA, permalink: "p" }] } };
    return undefined;
  });
  await rodar(db, g);
  assertEquals(db.linhaDo().published_at, AGORA.toISOString());
});

// ── a pega confere a hora e a publicação sai da linha que ela devolve ─────────────────────

Deno.test("reagendamento entre a leitura e a pega: a hora passou a ser futura, a pega não acha linha e nada sai cedo", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, {
    antes: (c, tabelas) => {
      if (c.tabela === "social_post" && c.op === "update") tabelas.social_post[0].scheduled_at = "2026-10-30T15:00:00Z";
    },
  });
  const g = graphFalso(roteiroFeliz);
  const r = await rodar(db, g);
  assertEquals(r.body, { ok: true, acao: "outra_rodada", post: ID });
  assertEquals(g.chamadas.length, 0);
  assertEquals(db.linhaDo().status, "approved");
  assertEquals(db.linhaDo().attempts, 0);
  assertEquals(db.linhaDo().scheduled_at, "2026-10-30T15:00:00Z");
});

Deno.test("a pega devolve a linha: legenda e slides corrigidos depois da leitura são os que saem", async () => {
  const novaLegenda = "Legenda corrigida depois da leitura. #confins #viagem #movepark";
  const novoSlide = { url: `${BASE}/novo-01.jpg`, path: "social/o/2/aaaa/novo-01.jpg", alt: "arte nova", texto: null };
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, {
    antes: (c, tabelas) => {
      if (c.tabela === "social_post" && c.op === "update") {
        Object.assign(tabelas.social_post[0], { caption: novaLegenda, slides: [novoSlide], kind: "image" });
      }
    },
  });
  const g = graphFalso((c) => {
    if (c.metodo === "POST" && c.caminho === `${IG}/media`) return { body: { id: "container-pai" } };
    return roteiroFeliz(c);
  });
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "publicado");
  const [container] = g.quais("POST", `${IG}/media`);
  assertEquals(container.params.get("image_url"), novoSlide.url, "a imagem da linha devolvida, não a lida antes");
  assertEquals(container.params.get("caption"), novaLegenda);
  assertEquals(container.params.get("alt_text"), "arte nova");
  const [pega] = db.de("social_post", "update");
  for (const campo of ["caption", "slides", "ig_container_id"]) {
    assertEquals(String(pega.colunas).includes(campo), true, `a pega devolve ${campo}`);
  }
});

Deno.test("a pega devolve a linha: container que apareceu depois da leitura e já está PUBLISHED não é publicado de novo", async () => {
  const db = banco({ social_post: [postBanco()], app_setting: chaveLigada("true") }, {
    antes: (c, tabelas) => {
      if (c.tabela === "social_post" && c.op === "update") tabelas.social_post[0].ig_container_id = "container-velho";
    },
  });
  const g = graphFalso((c) => {
    if (c.caminho === "container-velho") return { body: { status_code: "PUBLISHED" } };
    if (c.caminho === `${IG}/media`) return { body: { data: [{ id: "m-3", caption: LEGENDA, permalink: "p", timestamp: "2026-10-28T15:04:00+0000" }] } };
    return roteiroFeliz(c);
  });
  const r = await rodar(db, g);
  assertEquals(r.body.acao, "reconciliado");
  assertEquals(g.quais("POST").length, 0);
  assertEquals(db.linhaDo().ig_media_id, "m-3");
});

// ── nunca duas vezes, em várias rodadas, com uma Meta que guarda estado ───────────────────

function metaComEstado() {
  let seq = 0;
  const containers = new Map<string, { caption: string; status: string }>();
  const midias: { id: string; caption: string; permalink: string; timestamp: string }[] = [];
  const publicacoes = new Map<string, number>();
  const pendentes: string[] = [];
  const meta = {
    modo: "normal" as "normal" | "ambiguo" | "ambiguo_lag",
    timestamp: "2026-10-27T15:04:30+0000",
    publicacoes,
    midias,
    noAr(containerId: string, timestamp: string) {
      const c = containers.get(containerId)!;
      c.status = "PUBLISHED";
      const m = { id: `midia-${midias.length + 1}`, caption: c.caption, permalink: `https://www.instagram.com/p/M${midias.length + 1}/`, timestamp };
      midias.push(m);
      return m;
    },
    /** A Meta termina de publicar o que ficou pendente (o atraso que fez o primeiro erro ser ambíguo). */
    resolverPendentes(timestamp: string) {
      for (const id of pendentes.splice(0)) meta.noAr(id, timestamp);
    },
    roteiro: (c: ChamadaGraph): Rota => {
      if (c.metodo === "POST" && c.caminho === `${IG}/media`) {
        if (c.params.get("media_type") === "CAROUSEL") {
          const id = `container-${++seq}`;
          containers.set(id, { caption: c.params.get("caption")!, status: "FINISHED" });
          return { body: { id } };
        }
        return { body: { id: `filho-${++seq}` } };
      }
      if (c.metodo === "POST" && c.caminho === `${IG}/media_publish`) {
        const id = c.params.get("creation_id")!;
        publicacoes.set(id, (publicacoes.get(id) ?? 0) + 1);
        if (meta.modo === "ambiguo_lag") {
          pendentes.push(id);
          return { status: 500, body: { error: { message: "Service unavailable" } } };
        }
        const m = meta.noAr(id, meta.timestamp);
        return meta.modo === "ambiguo" ? { status: 500, body: { error: { message: "Service unavailable" } } } : { body: { id: m.id } };
      }
      const container = containers.get(c.caminho);
      if (c.metodo === "GET" && container) return { body: { status_code: container.status } };
      if (c.metodo === "GET" && c.caminho === `${IG}/media`) return { body: { data: [...midias].reverse() } };
      const midia = midias.find((m) => m.id === c.caminho);
      if (c.metodo === "GET" && midia) return { body: { permalink: midia.permalink } };
      return undefined;
    },
  };
  return meta;
}

Deno.test("várias rodadas, Meta com estado e erro ambíguo: media_publish roda uma vez por post e a Meta não duplica nada", async () => {
  const B = postBanco({ id: "post-b", caption: "Legenda B. #b #b #b", scheduled_at: "2026-10-27T15:00:00Z" });
  const A = postBanco({ id: "post-a", caption: "Legenda A. #a #a #a", scheduled_at: "2026-10-28T15:00:00Z" });
  const db = banco({ social_post: [B, A], app_setting: chaveLigada("true") });
  const meta = metaComEstado();
  const g = graphFalso(meta.roteiro);

  // R1: o media_publish do B responde 500 e, na hora de conferir, a Meta ainda não terminou. B vira failed.
  meta.modo = "ambiguo_lag";
  const r1 = await rodar(db, g, new Date("2026-10-27T15:05:00Z"));
  assertEquals(r1.body.acao, "falhou");
  assertEquals(db.linhaDo("post-b").status, "failed");
  assertEquals(String(db.linhaDo("post-b").last_error).endsWith(FIM_CONFIRA), true);
  assertEquals(db.linhaDo("post-a").status, "approved", "o A ainda não é a hora dele");
  const containerB = db.linhaDo("post-b").ig_container_id as string;
  assertEquals(meta.publicacoes.get(containerB), 1);

  // A Meta termina de publicar o B. Ninguém sabe disso no banco.
  meta.resolverPendentes("2026-10-27T15:05:20+0000");
  assertEquals(meta.midias.length, 1);

  // R2: o A tem erro ambíguo com o container já PUBLISHED: reconcilia na hora.
  meta.modo = "ambiguo";
  meta.timestamp = "2026-10-28T15:04:50+0000";
  const r2 = await rodar(db, g, new Date("2026-10-28T15:05:00Z"));
  assertEquals(r2.body, { ok: true, acao: "reconciliado", post: "post-a" });
  assertEquals(db.linhaDo("post-a").status, "published");
  assertEquals(db.linhaDo("post-b").status, "failed", "o B continua parado na falha");

  // Uma pessoa reagenda o B (failed volta para approved, e o container fica guardado) para hoje mais tarde.
  Object.assign(db.linhaDo("post-b"), { status: "approved", scheduled_at: "2026-10-28T16:00:00Z", last_error: null });

  // R3: já saiu o A hoje (fuso de São Paulo). O B espera e a Meta nem é chamada.
  const antesR3 = g.chamadas.length;
  const r3 = await rodar(db, g, new Date("2026-10-28T16:05:00Z"));
  assertEquals(r3.body.acao, "ja_publicou_hoje");
  assertEquals(g.chamadas.length, antesR3);

  // A pessoa move o B para amanhã.
  Object.assign(db.linhaDo("post-b"), { scheduled_at: "2026-10-29T15:00:00Z" });

  // R4: o B é pego, o container antigo está PUBLISHED na Meta: reconcilia pela legenda, sem POST nenhum.
  const antesR4 = g.chamadas.length;
  const r4 = await rodar(db, g, new Date("2026-10-29T15:05:00Z"));
  assertEquals(r4.body, { ok: true, acao: "reconciliado", post: "post-b" });
  assertEquals(g.chamadas.slice(antesR4).filter((c) => c.metodo === "POST").length, 0);
  assertEquals(db.linhaDo("post-b").status, "published");
  assertEquals(db.linhaDo("post-b").published_at, "2026-10-27T15:05:20.000Z", "o horário em que a Meta de fato publicou");

  // R5: nada mais a fazer.
  const antesR5 = g.chamadas.length;
  assertEquals((await rodar(db, g, new Date("2026-10-29T15:20:00Z"))).body.acao, "nada");
  assertEquals(g.chamadas.length, antesR5);

  // A trava: um media_publish por post em todas as rodadas, e uma mídia por post na Meta.
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 2);
  assertEquals([...meta.publicacoes.values()], [1, 1]);
  assertEquals(meta.midias.map((m) => m.caption).sort(), ["Legenda A. #a #a #a", "Legenda B. #b #b #b"]);
  assertEquals(db.linhaDo("post-a").ig_media_id, meta.midias.find((m) => m.caption.startsWith("Legenda A"))!.id);
  assertEquals(db.linhaDo("post-b").ig_media_id, meta.midias.find((m) => m.caption.startsWith("Legenda B"))!.id);
  assertEquals(db.eventos("reconciled").length, 2);
  assertEquals(db.eventos("failed").length, 1);
  semToken(db.tabelas.social_post_event, db.tabelas.social_post);
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

// ── (h) Publicar agora: o modo forçado, pelo handler ──────────────────────────────────────
// O Manager chama a RPC social_post_publish_now (que deixa o post aprovado para agora) e depois
// esta Edge com o JWT de um hub_admin e { post_id }. Ignora a chave e o um por dia, e publica
// pelo mesmo caminho da rodada: pega atômica, container antigo consultado, rastro de tudo.

const JWT_ADMIN = "jwt-do-hub-admin";
const JWT_CLIENTE = "jwt-do-cliente";
const PERFIS: Linha[] = [
  { id: "u-admin", role: "hub_admin" },
  { id: "u-cliente", role: "customer" },
];
const USUARIOS = { [JWT_ADMIN]: "u-admin", [JWT_CLIENTE]: "u-cliente" };

/** O post como a RPC o deixa: aprovado, com a hora de agora. */
const postAgora = (over: Linha = {}) => postBanco({ scheduled_at: "2026-10-28T15:04:59Z", ...over });

const bancoAgora = (posts: Linha[], opts: Parameters<typeof banco>[1] = {}, chave = "false") =>
  banco(
    { social_post: posts, app_setting: chaveLigada(chave), profiles: PERFIS },
    { usuarios: USUARIOS, rpc: rpcCerta, ...opts },
  );

const reqAgora = (jwt: string | undefined, corpo: unknown = { post_id: ID }) =>
  new Request(URL_FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(jwt === undefined ? {} : { Authorization: `Bearer ${jwt}` }),
    },
    body: JSON.stringify(corpo),
  });

const forcar = (
  db: ReturnType<typeof banco>,
  g: ReturnType<typeof graphFalso>,
  jwt: string | undefined = JWT_ADMIN,
  corpo?: unknown,
) => handler(reqAgora(jwt, corpo), { admin: db.cliente, getEnv: ENV_OK, agora: AGORA, fetcher: g.fetcher });

Deno.test("motivoParaNaoPublicarAgora: só aprovado com a hora chegada segue, e cada recusa diz o estado em português", () => {
  const agora = new Date("2026-10-28T15:05:00Z");
  assertEquals(motivoParaNaoPublicarAgora({ status: "approved", scheduled_at: "2026-10-28T15:05:00Z" }, agora), null);
  assertEquals(motivoParaNaoPublicarAgora({ status: "approved", scheduled_at: "2026-10-28T09:00:00Z" }, agora), null);
  assertEquals(motivoParaNaoPublicarAgora({ status: "published", scheduled_at: "2026-10-28T15:00:00Z" }, agora), "Este post já foi publicado.");
  assertEquals(motivoParaNaoPublicarAgora({ status: "publishing", scheduled_at: "2026-10-28T15:00:00Z" }, agora), "Este post já está sendo publicado.");
  assertEquals(
    motivoParaNaoPublicarAgora({ status: "approved", scheduled_at: "2026-10-28T18:00:00Z" }, agora),
    "Este post está agendado para mais tarde. Feche e abra de novo para publicar agora.",
  );
  const estados: Record<string, string> = {
    pending_review: "aguardando aprovação",
    overdue: "atrasado",
    failed: "com falha",
    rejected: "recusado",
  };
  for (const [status, nome] of Object.entries(estados)) {
    assertEquals(
      motivoParaNaoPublicarAgora({ status, scheduled_at: "2026-10-28T15:00:00Z" }, agora),
      `Só post aprovado sai na hora (este está ${nome}).`,
    );
  }
});

Deno.test("Publicar agora: JWT de quem não é hub_admin é 403, e nada é lido, gravado nem enviado à Meta", async () => {
  const db = bancoAgora([postAgora()], {}, "true");
  const g = graphFalso(roteiroFeliz);
  const res = await forcar(db, g, JWT_CLIENTE);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Só a equipe da Movepark pode publicar no Instagram.");
  assertEquals(db.de("social_post").length, 0);
  assertEquals(db.de("social_post_event").length, 0);
  assertEquals(db.rpcs.length, 0, "o modo forçado não usa a chave do cron");
  assertEquals(g.chamadas.length, 0);
  assertEquals(db.linhaDo().status, "approved");
});

Deno.test("Publicar agora: sessão inválida (a anon key, por exemplo) é 401 e nada acontece", async () => {
  const db = bancoAgora([postAgora()], {}, "true");
  const g = graphFalso(roteiroFeliz);
  const res = await forcar(db, g, "anon-key-nao-e-usuario");
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "Sua sessão expirou. Entre de novo para continuar.");
  assertEquals(db.jwts, ["anon-key-nao-e-usuario"]);
  assertEquals(db.chamadas.length, 0);
  assertEquals(g.chamadas.length, 0);
});

Deno.test("Publicar agora: sem post_id o pedido segue o caminho do cron, que sem a chave é 401", async () => {
  for (const corpo of [{}, { force: true }]) {
    const db = bancoAgora([postAgora()], {}, "true");
    const g = graphFalso(roteiroFeliz);
    const res = await forcar(db, g, JWT_ADMIN, corpo);
    assertEquals(res.status, 401);
    assertEquals((await res.json()).error, "unauthorized");
    assertEquals(db.jwts.length, 0, "o usuário nem é conferido");
    assertEquals(db.rpcs[0]?.nome, "cron_key_matches");
    assertEquals(g.chamadas.length, 0);
  }
});

Deno.test("Publicar agora: post_id que não é um id é 400, depois de conferir o admin", async () => {
  for (const post_id of ["", "abc", 42, null]) {
    const db = bancoAgora([postAgora()]);
    const g = graphFalso(roteiroFeliz);
    const res = await forcar(db, g, JWT_ADMIN, { post_id });
    assertEquals(res.status, 400, String(post_id));
    assertEquals((await res.json()).error, "Faltou dizer qual post publicar.");
    assertEquals(db.de("social_post").length, 0);
    assertEquals(g.chamadas.length, 0);
  }
});

Deno.test("Publicar agora: post que não está aprovado para agora é 409 em português, sem pega e sem Meta", async () => {
  const casos: Array<[Linha, string]> = [
    [{ status: "pending_review" }, "Só post aprovado sai na hora (este está aguardando aprovação)."],
    [{ status: "failed", scheduled_at: "2026-10-28T09:00:00Z" }, "Só post aprovado sai na hora (este está com falha)."],
    [{ status: "overdue", scheduled_at: "2026-10-27T09:00:00Z" }, "Só post aprovado sai na hora (este está atrasado)."],
    [{ status: "publishing" }, "Este post já está sendo publicado."],
    [{ status: "published", ig_media_id: "m-1", published_at: "2026-10-28T12:00:00Z" }, "Este post já foi publicado."],
    [{ scheduled_at: "2026-10-29T15:00:00Z" }, "Este post está agendado para mais tarde. Feche e abra de novo para publicar agora."],
  ];
  for (const [over, texto] of casos) {
    const db = bancoAgora([postAgora(over)], {}, "true");
    const g = graphFalso(roteiroFeliz);
    const res = await forcar(db, g);
    assertEquals(res.status, 409, texto);
    assertEquals(await res.json(), { ok: false, post: ID, error: texto });
    assertEquals(db.de("social_post", "update").length, 0, texto);
    assertEquals(db.eventos().length, 0, texto);
    assertEquals(g.chamadas.length, 0, texto);
  }
});

Deno.test("Publicar agora: post que não existe ou foi excluído é 404", async () => {
  for (const posts of [[], [postAgora({ deleted_at: "2026-10-28T12:00:00Z" })]]) {
    const db = bancoAgora(posts);
    const g = graphFalso(roteiroFeliz);
    const res = await forcar(db, g);
    assertEquals(res.status, 404);
    assertEquals((await res.json()).error, "Post não encontrado.");
    assertEquals(g.chamadas.length, 0);
  }
});

Deno.test("Publicar agora com a chave desligada publica, uma vez; o cron, na mesma situação, só faz dry_run", async () => {
  const db = bancoAgora([postAgora()], {}, "false");
  const g = graphFalso(roteiroFeliz);
  const res = await forcar(db, g);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, acao: "publicado", post: ID, permalink: "https://www.instagram.com/p/ABC123/" });
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 1, "media_publish uma única vez");
  assertEquals(db.de("app_setting").length, 0, "o modo forçado nem lê a chave");
  const l = db.linhaDo();
  assertEquals(l.status, "published");
  assertEquals(l.ig_media_id, "midia-1");
  assertEquals(l.ig_container_id, "container-pai");
  // A mesma pega da rodada: condicionada a approved e à hora, no mesmo id.
  const pega = db.de("social_post", "update").find((c) => c.payload?.status === "publishing")!;
  assertEquals(db.tocouEm(pega, "status", "approved"), true);
  assertEquals(pega.filtros.some(([op, col, v]) => op === "lte" && col === "scheduled_at" && v === AGORA.toISOString()), true);
  assertEquals(pega.afetadas, 1);
  for (const kind of ["container_child", "container_parent", "container_status", "media_publish", "permalink"]) {
    assertEquals(db.eventos(kind).length >= 1, true, kind);
  }
  semToken(db.tabelas.social_post_event, db.tabelas.social_post);

  // O cron, com a mesma fila e a chave desligada: só o dry_run, sem falar com a Meta.
  const dbCron = bancoAgora([postAgora()], {}, "false");
  const gCron = graphFalso(roteiroFeliz);
  const resCron = await handler(reqPost("chave-certa"), { admin: dbCron.cliente, getEnv: ENV_OK, agora: AGORA, fetcher: gCron.fetcher });
  assertEquals(await resCron.json(), { ok: true, acao: "dry_run", post: ID });
  assertEquals(gCron.chamadas.length, 0);
  assertEquals(dbCron.linhaDo().status, "approved");
});

Deno.test("Publicar agora com outro post publicado hoje publica mesmo assim (o um por dia é do agendador)", async () => {
  const hoje = postBanco({
    id: "post-de-hoje",
    status: "published",
    caption: "Outro post",
    ig_media_id: "m-hoje",
    published_at: "2026-10-28T13:00:00Z",
  });
  // O cron, com a chave ligada, recusa por já ter saído post hoje.
  const dbCron = bancoAgora([postAgora(), hoje], {}, "true");
  const gCron = graphFalso(roteiroFeliz);
  const resCron = await handler(reqPost("chave-certa"), { admin: dbCron.cliente, getEnv: ENV_OK, agora: AGORA, fetcher: gCron.fetcher });
  assertEquals((await resCron.json()).acao, "ja_publicou_hoje");
  assertEquals(gCron.chamadas.length, 0);

  const db = bancoAgora([postAgora(), hoje], {}, "true");
  const g = graphFalso(roteiroFeliz);
  const res = await forcar(db, g);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).acao, "publicado");
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 1);
  assertEquals(db.linhaDo().status, "published");
  assertEquals(db.linhaDo("post-de-hoje").status, "published", "o de hoje fica como está");
});

Deno.test("Publicar agora: pega que volta vazia é outra_rodada, sem chamada à Meta", async () => {
  const db = bancoAgora([postAgora()], {
    // Entre a leitura e a pega, a rodada do cron pega o mesmo post.
    antes: (c, tabelas) => {
      if (c.tabela === "social_post" && c.op === "update") {
        tabelas.social_post.find((l) => l.id === ID)!.status = "publishing";
      }
    },
  }, "true");
  const g = graphFalso(roteiroFeliz);
  const res = await forcar(db, g);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, acao: "outra_rodada", post: ID });
  assertEquals(g.chamadas.length, 0, "quem perdeu a pega não toca na Meta");
  assertEquals(db.de("social_post", "update")[0].afetadas, 0);
  assertEquals(db.linhaDo().attempts, 0);
});

Deno.test("Publicar agora não mexe em outros posts: nem marca atrasado nem reconcilia parado", async () => {
  const velho = postBanco({ id: "velho", caption: "Velho", scheduled_at: "2026-10-28T06:00:00Z" });
  const parado = postBanco({ id: "parado", caption: "Parado", status: "publishing", ig_container_id: "container-velho", updated_at: "2026-10-28T14:30:00Z" });
  const db = bancoAgora([postAgora(), velho, parado], {}, "true");
  const g = graphFalso(roteiroFeliz);
  const res = await forcar(db, g);
  assertEquals((await res.json()).acao, "publicado");
  assertEquals(db.linhaDo("velho").status, "approved", "o atrasado espera a rodada");
  assertEquals(db.linhaDo("parado").status, "publishing", "o parado espera a rodada");
  assertEquals(db.eventos("overdue").length, 0);
  assertEquals(g.quais("GET", "container-velho").length, 0, "o container do parado nem é consultado");
  assertEquals(db.de("social_post", "update").every((c) => db.tocouEm(c, "id", ID)), true, "toda escrita é no post pedido");
});

Deno.test("Publicar agora num post que falhou com container: consulta a Meta antes e, PUBLISHED, reconcilia sem POST", async () => {
  // A RPC devolveu o post para approved e guardou o ig_container_id da tentativa que falhou.
  const db = bancoAgora([postAgora({ ig_container_id: "container-velho", attempts: 1 })], {}, "false");
  const g = graphFalso((c) => {
    if (c.metodo === "GET" && c.caminho === "container-velho") return { body: { status_code: "PUBLISHED" } };
    if (c.metodo === "GET" && c.caminho === `${IG}/media`) {
      return { body: { data: [{ id: "m-9", caption: LEGENDA, permalink: "https://www.instagram.com/p/DEF456/" }] } };
    }
    return undefined;
  });
  const res = await forcar(db, g);
  assertEquals(await res.json(), { ok: true, acao: "reconciliado", post: ID });
  assertEquals(g.quais("POST").length, 0, "nem container novo nem media_publish");
  assertEquals(g.quais("GET", "container-velho").length, 1);
  assertEquals(db.linhaDo().status, "published");
  assertEquals(db.linhaDo().ig_media_id, "m-9");
  assertEquals(db.eventos("reconciled").length, 1);
});

Deno.test("Publicar agora: a Meta recusa e a resposta é 502 com o texto em português, e o post vira failed", async () => {
  const db = bancoAgora([postAgora()]);
  const g = graphFalso((c) => {
    if (c.metodo === "POST" && c.caminho === `${IG}/media`) return { status: 400, body: { error: { message: "Invalid image url" } } };
    return roteiroFeliz(c);
  });
  const res = await forcar(db, g);
  assertEquals(res.status, 502);
  const corpo = await res.json();
  assertEquals(corpo.acao, "falhou");
  assertStringIncludes(corpo.erro, "Falhou ao enviar o slide 1 à Meta");
  assertEquals(db.linhaDo().status, "failed");
  assertEquals(g.quais("POST", `${IG}/media_publish`).length, 0);
  semToken(corpo, db.tabelas.social_post_event);
});

Deno.test("Publicar agora: sem os secrets da Meta é 503, depois de conferir o admin", async () => {
  const db = bancoAgora([postAgora()]);
  const g = graphFalso(roteiroFeliz);
  const res = await handler(reqAgora(JWT_ADMIN), { admin: db.cliente, getEnv: () => undefined, agora: AGORA, fetcher: g.fetcher });
  assertEquals(res.status, 503);
  assertEquals(db.de("social_post").length, 0);
  assertEquals(g.chamadas.length, 0);
});

Deno.test("CORS: OPTIONS responde com os cabeçalhos, e as respostas do POST também os trazem", async () => {
  const db = bancoAgora([postAgora()]);
  const pre = await handler(new Request(URL_FN, { method: "OPTIONS" }), { admin: db.cliente, getEnv: ENV_OK, agora: AGORA });
  assertEquals(pre.status, 200);
  assertEquals(pre.headers.get("Access-Control-Allow-Origin"), "*");
  assertStringIncludes(pre.headers.get("Access-Control-Allow-Headers") ?? "", "authorization");
  assertStringIncludes(pre.headers.get("Access-Control-Allow-Headers") ?? "", "apikey");
  assertStringIncludes(pre.headers.get("Access-Control-Allow-Methods") ?? "", "POST");
  assertEquals(db.chamadas.length + db.rpcs.length, 0, "o preflight não chega ao banco");

  const g = graphFalso(roteiroFeliz);
  const res = await forcar(db, g, JWT_CLIENTE);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*", "o navegador lê o 403");
});
