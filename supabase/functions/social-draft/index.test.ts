// Regras da entrada da fila do Instagram. O que passa daqui vira linha em social_post.
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { corrigirLegenda, submeter } from "./index.ts";
import {
  caminhoNoBucket,
  chaveConfere,
  draftKey,
  ehUuid,
  lerRascunho,
  motivoDoReenvioRecusado,
  objetoJaExiste,
  podeCorrigirLegenda,
  podeReenviar,
  rotuloStatus,
  TEXTO_VERSAO_VELHA,
  urlPublica,
  versaoValida,
} from "./logic.ts";

const BOM = {
  origem: "preco-do-estacionamento-no-aeroporto-de-confins",
  corte: 2,
  destination: "aeroporto-de-confins",
  keyphrase: "estacionamento no aeroporto de Confins",
  publicar_em: "2026-10-28T12:00:00-03:00",
  cta_url: "https://movepark.co/destinos/aeroporto-de-confins?utm_source=instagram",
  price_date: "2026-10-21",
  caption: "Legenda do post.",
  placements: ["feed"],
  slides: [
    { arquivo: "preco-estacionamento-aeroporto-confins-01.jpg", alt: "pátio", texto: "R$ 45 a diária" },
    { arquivo: "preco-estacionamento-aeroporto-confins-02.jpg", alt: "van", texto: null },
  ],
};

Deno.test("onde sai: sem o campo, feed e stories, que é o padrão; com stories, os arquivos 9:16 são lidos", () => {
  const { placements: _, ...semLugares } = BOM;
  const padrao = lerRascunho({ ...semLugares, stories: [{ arquivo: "story-01.jpg" }] });
  assertEquals(padrao.ok && padrao.rascunho.placements, ["feed", "story"]);
  assertEquals(padrao.ok && padrao.rascunho.stories, [{ arquivo: "story-01.jpg" }]);
  const soFeed = lerRascunho(BOM);
  assertEquals(soFeed.ok && soFeed.rascunho.placements, ["feed"]);
  assertEquals(soFeed.ok && soFeed.rascunho.stories, []);
});

Deno.test("onde sai: lugar desconhecido, nenhum lugar e stories sem arquivo são recusados", () => {
  const erros = (m: Record<string, unknown>) => {
    const r = lerRascunho({ ...BOM, ...m });
    return r.ok ? [] : r.erros;
  };
  assertEquals(erros({ placements: ["reel"] }), ["Os lugares aceitos são feed e story."]);
  assertEquals(erros({ placements: [] }), ["Escolha pelo menos um lugar: feed ou story."]);
  assertEquals(erros({ placements: ["feed", "story"] }), ["Com story, o post precisa de 1 a 10 imagens 9:16 em stories."]);
  assertEquals(erros({ placements: ["story"], stories: [{ arquivo: "Story Um.jpg" }] }), [
    "Story 1: o arquivo precisa estar em kebab-case e terminar em .jpg.",
  ]);
  assertEquals(
    erros({ placements: ["story"], stories: [{ arquivo: "preco-estacionamento-aeroporto-confins-01.jpg" }] }),
    ["O story 1 usa o mesmo arquivo de um slide do feed."],
  );
});


Deno.test("rascunho bom é lido e a data vira ISO em UTC", () => {
  const r = lerRascunho(BOM);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.rascunho.publicarEm, "2026-10-28T15:00:00.000Z");
    assertEquals(r.rascunho.corte, 2);
    assertEquals(r.rascunho.slides.length, 2);
  }
});

Deno.test("origem é obrigatória e em kebab-case", () => {
  for (const origem of [undefined, "", "Preço Confins", "confins_preco"]) {
    const r = lerRascunho({ ...BOM, origem });
    assertEquals(r.ok, false, String(origem));
  }
});

Deno.test("publicar_em sem fuso é recusado, porque a hora mudaria de sentido", () => {
  assertEquals(lerRascunho({ ...BOM, publicar_em: "2026-10-28T12:00:00" }).ok, false);
  assertEquals(lerRascunho({ ...BOM, publicar_em: "amanhã" }).ok, false);
});

Deno.test("corte fora de 1 a 4 é recusado; sem corte vale", () => {
  assertEquals(lerRascunho({ ...BOM, corte: 5 }).ok, false);
  const sem = lerRascunho({ ...BOM, corte: undefined });
  assertEquals(sem.ok && sem.rascunho.corte, null);
});

Deno.test("arquivo do slide precisa ser kebab-case .jpg e não repetir", () => {
  assertEquals(lerRascunho({ ...BOM, slides: [{ arquivo: "Slide 1.png" }] }).ok, false);
  assertEquals(lerRascunho({ ...BOM, slides: [BOM.slides[0], BOM.slides[0]] }).ok, false);
  assertEquals(lerRascunho({ ...BOM, slides: [] }).ok, false);
});

Deno.test("price_date fora do formato é recusada", () => {
  assertEquals(lerRascunho({ ...BOM, price_date: "21/10/2026" }).ok, false);
});

Deno.test("chave do rascunho, caminho no bucket com hash e URL sem versão na query", () => {
  assertEquals(draftKey("confins", 2), "confins:2");
  assertEquals(draftKey("confins", null), "confins:0");
  assertEquals(caminhoNoBucket("confins", 2, "abc123", "a.jpg"), "social/confins/2/abc123/a.jpg");
  assertEquals(caminhoNoBucket("confins", null, "abc123", "a.jpg"), "social/confins/0/abc123/a.jpg");
  assertEquals(
    urlPublica("https://x.supabase.co/", "social/confins/2/abc123/a.jpg"),
    "https://x.supabase.co/storage/v1/object/public/assets-public/social/confins/2/abc123/a.jpg",
  );
});

Deno.test("cortes diferentes e conteúdos diferentes nunca dividem o caminho", () => {
  // A skill nomeia os arquivos pela palavra-chave e pelo slide: todos os cortes repetem o nome.
  const caminho = (corte: number | null, hash: string) => caminhoNoBucket("confins", corte, hash, "preco-01.jpg");
  assertEquals(caminho(1, "aaaa") === caminho(2, "aaaa"), false);
  assertEquals(caminho(null, "aaaa") === caminho(1, "aaaa"), false);
  // Mesmo corte, bytes diferentes: outro caminho, e é isso que protege a imagem do post aprovado.
  assertEquals(caminho(1, "aaaa") === caminho(1, "bbbb"), false);
  assertEquals(caminho(1, "aaaa") === caminho(1, "aaaa"), true);
});

Deno.test("objeto que já existe no bucket é reconhecido pelo erro do storage", () => {
  assertEquals(objetoJaExiste({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }), true);
  assertEquals(objetoJaExiste({ status: 409, message: "x" }), true);
  assertEquals(objetoJaExiste({ message: "The resource already exists" }), true);
  assertEquals(objetoJaExiste({ statusCode: "500", message: "internal" }), false);
  assertEquals(objetoJaExiste({ message: "Bucket not found" }), false);
  assertEquals(objetoJaExiste(null), false);
  assertEquals(objetoJaExiste(undefined), false);
});

Deno.test("data que não existe no calendário é recusada, em price_date e em publicar_em", () => {
  for (const price_date of ["2026-02-30", "2026-13-45", "2026-04-31", "2025-02-29"]) {
    assertEquals(lerRascunho({ ...BOM, price_date }).ok, false, price_date);
  }
  for (const publicar_em of ["2026-02-30T12:00:00Z", "2026-13-01T12:00:00-03:00", "2026-04-31T09:00:00Z"]) {
    assertEquals(lerRascunho({ ...BOM, publicar_em }).ok, false, publicar_em);
  }
  // 29 de fevereiro de ano bissexto existe.
  assertEquals(lerRascunho({ ...BOM, price_date: "2028-02-29", publicar_em: "2028-02-29T10:00:00Z" }).ok, true);
});

Deno.test("status ganha rótulo em português e o desconhecido não vaza o valor do banco", () => {
  assertEquals(rotuloStatus("pending_review"), "aguardando aprovação");
  assertEquals(rotuloStatus("approved"), "aprovado");
  assertEquals(rotuloStatus("publishing"), "publicando");
  assertEquals(rotuloStatus("published"), "publicado");
  assertEquals(rotuloStatus("failed"), "com falha");
  assertEquals(rotuloStatus("rejected"), "recusado");
  assertEquals(rotuloStatus("overdue"), "atrasado");
  assertEquals(rotuloStatus("qualquer_coisa"), "em outro estado");
});

Deno.test("id do post precisa ser UUID", () => {
  assertEquals(ehUuid("ca3df28a-fbf9-4aa8-a71c-d30ef256da47"), true);
  for (const v of ["x", "", null, undefined, 12, "ca3df28a-fbf9-4aa8-a71c"]) assertEquals(ehUuid(v), false);
});

Deno.test("reenvio vale em pending_review e em recusado sem container; legenda corrige até aprovado", () => {
  assertEquals(podeReenviar("pending_review"), true);
  assertEquals(podeReenviar("pending_review", "container-antigo"), true);
  assertEquals(podeReenviar("rejected", null), true);
  assertEquals(podeReenviar("rejected"), true);
  assertEquals(podeReenviar("rejected", "container-antigo"), false);
  for (const status of ["approved", "publishing", "published", "failed", "overdue"]) {
    assertEquals(podeReenviar(status, null), false, status);
  }
  assertEquals(podeCorrigirLegenda("approved"), true);
  assertEquals(podeCorrigirLegenda("published"), false);
});

Deno.test("o texto do 409 de reenvio nunca vaza o status em inglês", () => {
  assertEquals(
    motivoDoReenvioRecusado("approved"),
    "Este rascunho já está aprovado e não pode ser substituído por um reenvio.",
  );
  assertStringIncludes(motivoDoReenvioRecusado("rejected"), "tentativa de publicação na Meta");
  for (const status of ["approved", "rejected", "failed", "published"]) {
    assertEquals(/[a-z]+_[a-z]+|approved|rejected|failed|published/.test(motivoDoReenvioRecusado(status)), false, status);
  }
});

Deno.test("a versão aberta precisa ser um instante válido", () => {
  assertEquals(versaoValida("2026-10-21T20:11:03.123456+00:00"), true);
  assertEquals(versaoValida("2026-10-21T20:11:03Z"), true);
  for (const v of ["", "  ", "ontem", null, undefined, 12, {}]) assertEquals(versaoValida(v), false, String(v));
});

Deno.test("chave confere só quando configurada e igual", () => {
  assertEquals(chaveConfere("k", "k"), true);
  assertEquals(chaveConfere("k", "x"), false);
  assertEquals(chaveConfere(undefined, null), false);
});

// ── Handlers, com um admin de mentira ────────────────────────────────────────────────────
// O fake grava cada chamada (tabela, operação, payload, filtros) e devolve o que o roteiro manda
// para ela. Assim o teste afirma o que foi escrito e com qual condição, sem banco.

interface Chamada {
  tabela: string;
  op: "select" | "update" | "insert" | "upsert";
  payload?: unknown;
  filtros: [string, string, unknown][];
  terminal?: "maybeSingle" | "single" | "lista";
}
type Resposta = { data: unknown; error: { code?: string; message: string } | null };

function admin(
  responder: (c: Chamada) => Resposta,
  opts: { usuario?: { id: string } | null; erroUpload?: { message: string; statusCode?: string } } = {},
) {
  const chamadas: Chamada[] = [];
  const uploads: string[] = [];
  const opcoesDoUpload: Record<string, unknown>[] = [];
  const consulta = (tabela: string) => {
    const c: Chamada = { tabela, op: "select", filtros: [] };
    const executa = (terminal: Chamada["terminal"]) => {
      c.terminal = terminal;
      chamadas.push(c);
      return Promise.resolve(responder(c));
    };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: () => b,
      update: (p: unknown) => ((c.op = "update"), (c.payload = p), b),
      insert: (p: unknown) => ((c.op = "insert"), (c.payload = p), b),
      upsert: (p: unknown) => ((c.op = "upsert"), (c.payload = p), b),
      eq: (col: string, v: unknown) => (c.filtros.push(["eq", col, v]), b),
      in: (col: string, v: unknown) => (c.filtros.push(["in", col, v]), b),
      is: (col: string, v: unknown) => (c.filtros.push(["is", col, v]), b),
      maybeSingle: () => executa("maybeSingle"),
      single: () => executa("single"),
      then: (res: (v: Resposta) => unknown, rej: (e: unknown) => unknown) => executa("lista").then(res, rej),
    };
    return b;
  };
  const cliente = {
    from: consulta,
    storage: {
      from: (_bucket: string) => ({
        upload: (caminho: string, _bytes: Uint8Array, opcoes: Record<string, unknown>) => {
          uploads.push(caminho);
          opcoesDoUpload.push(opcoes);
          return Promise.resolve({ error: opts.erroUpload ?? null });
        },
      }),
    },
    auth: {
      getUser: (_token: string) =>
        Promise.resolve(
          opts.usuario === null || opts.usuario === undefined
            ? { data: { user: null }, error: { message: "jwt inválido" } }
            : { data: { user: opts.usuario }, error: null },
        ),
    },
  };
  const de = (tabela: string, op: Chamada["op"]) => chamadas.filter((c) => c.tabela === tabela && c.op === op);
  return { cliente, chamadas, uploads, opcoesDoUpload, de };
}

const ok = (data: unknown): Resposta => ({ data, error: null });
const URL_BASE = "https://x.supabase.co";
const ID_POST = "ca3df28a-fbf9-4aa8-a71c-d30ef256da47";
const ID_ADMIN = "11111111-1111-4111-8111-111111111111";
/** O `updated_at` do post que a pessoa abriu, como o PostgREST o devolve (microssegundos e +00:00). */
const VERSAO = "2026-10-21T20:11:03.123456+00:00";

/** JPEG mínimo: só SOI + SOF0 com altura e largura, o que o `lerJpeg` consome. */
function jpeg(largura: number, altura: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    altura >> 8, altura & 0xff, largura >> 8, largura & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
}

const POST_VALIDO = {
  origem: "teste-fila",
  corte: 2,
  publicar_em: "2026-10-31T15:00:00Z",
  caption: "Legenda do teste. #a #b #c",
  placements: ["feed"],
  slides: [{ arquivo: "slide-01.jpg", alt: "slide de teste" }],
};

function envio(
  post: unknown,
  opts: { chave?: string | null; arquivo?: Uint8Array | null; stories?: Record<string, Uint8Array> } = {},
): Request {
  const form = new FormData();
  form.set("post", JSON.stringify(post));
  const arquivo = opts.arquivo === undefined ? jpeg(1080, 1350) : opts.arquivo;
  if (arquivo) form.set("slide-01.jpg", new File([arquivo], "slide-01.jpg", { type: "image/jpeg" }));
  for (const [nome, bytes] of Object.entries(opts.stories ?? {})) {
    form.set(nome, new File([new Uint8Array(bytes)], nome, { type: "image/jpeg" }));
  }
  const headers = new Headers();
  if (opts.chave !== null) headers.set("x-social-draft-key", opts.chave ?? "chave-de-teste");
  return new Request(`${URL_BASE}/functions/v1/social-draft`, { method: "POST", headers, body: form });
}

function comChave<T>(fn: () => Promise<T>): Promise<T> {
  Deno.env.set("SOCIAL_DRAFT_KEY", "chave-de-teste");
  return fn();
}

Deno.test("submeter sem a chave é 401 e não toca em nada", async () => {
  const a = admin(() => ok(null));
  const res = await comChave(() => submeter(envio(POST_VALIDO, { chave: "errada" }), a.cliente, URL_BASE));
  assertEquals(res.status, 401);
  assertEquals(a.chamadas.length, 0);
  assertEquals(a.uploads.length, 0);
});

const CAMINHO_COM_HASH = /^social\/teste-fila\/2\/[0-9a-f]{16}\/slide-01\.jpg$/;

Deno.test("submeter novo rascunho: sobe no caminho com corte e hash, sem sobrescrever, e registra o evento", async () => {
  const a = admin((c) => {
    if (c.tabela === "social_post" && c.op === "insert") return ok({ id: ID_POST });
    return ok(null);
  });
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  const corpo = await res.json();
  assertEquals(res.status, 200);
  assertEquals(corpo.ok, true);
  assertEquals(corpo.id, ID_POST);
  assertEquals(corpo.aviso, undefined);
  assertEquals(a.uploads.length, 1);
  assertEquals(CAMINHO_COM_HASH.test(a.uploads[0]), true, a.uploads[0]);
  assertEquals(a.opcoesDoUpload[0].upsert, false);
  const inserido = a.de("social_post", "insert")[0].payload as {
    draft_key: string;
    status: string;
    slides: { path: string; url: string }[];
  };
  assertEquals(inserido.draft_key, "teste-fila:2");
  assertEquals(inserido.status, "pending_review");
  assertEquals(inserido.slides[0].path, a.uploads[0]);
  assertEquals(inserido.slides[0].url, `${URL_BASE}/storage/v1/object/public/assets-public/${a.uploads[0]}`);
  assertEquals(inserido.slides[0].url.includes("?"), false);
  const evento = a.de("social_post_event", "insert")[0].payload as { kind: string; social_post_id: string };
  assertEquals(evento.kind, "draft_received");
  assertEquals(evento.social_post_id, ID_POST);
});

Deno.test("submeter com rascunho já aprovado é 409, em português, e nada sobe nem é gravado", async () => {
  const a = admin((c) => (c.op === "select" && c.tabela === "social_post" ? ok({ id: ID_POST, status: "approved" }) : ok(null)));
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  const corpo = await res.json();
  assertEquals(res.status, 409);
  assertEquals(a.uploads.length, 0);
  assertEquals(a.de("social_post", "update").length + a.de("social_post", "insert").length, 0);
  assertEquals(a.de("social_post_event", "insert").length, 0);
  assertStringIncludes(corpo.erros[0], "Este rascunho já está aprovado e não pode ser substituído por um reenvio.");
  assertEquals(JSON.stringify(corpo).includes("approved"), false);
});

Deno.test("submeter: o update vai condicionado a pending_review e, sem linha de volta, é 409", async () => {
  // Estava em pending_review na leitura e foi aprovado antes da escrita: o update não acha linha.
  const a = admin((c) => {
    if (c.op === "select" && c.tabela === "social_post") return ok({ id: ID_POST, status: "pending_review" });
    if (c.op === "update") return ok([]);
    return ok(null);
  });
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  const corpo = await res.json();
  assertEquals(res.status, 409);
  // O texto precisa continuar verdadeiro: a imagem nova foi para outro caminho e a linha não mudou.
  assertStringIncludes(corpo.erros[0], "A versão enviada foi descartada e o post na fila ficou como estava.");
  const [u] = a.de("social_post", "update");
  assertEquals(u.filtros.some(([, col, v]) => col === "status" && v === "pending_review"), true);
  assertEquals(u.filtros.some(([, col, v]) => col === "id" && v === ID_POST), true);
  assertEquals(a.de("social_post_event", "insert").length, 0);
});

Deno.test("reenvio em pending_review com bytes diferentes sobe em outro caminho e nada é sobrescrito", async () => {
  const pendente = (c: Chamada) => {
    if (c.op === "select" && c.tabela === "social_post") return ok({ id: ID_POST, status: "pending_review" });
    if (c.op === "update") return ok([{ id: ID_POST }]);
    return ok(null);
  };
  const primeiro = admin(pendente);
  await comChave(() => submeter(envio(POST_VALIDO, { arquivo: jpeg(1080, 1350) }), primeiro.cliente, URL_BASE));
  const segundo = admin(pendente);
  await comChave(() => submeter(envio(POST_VALIDO, { arquivo: jpeg(1080, 1349) }), segundo.cliente, URL_BASE));
  const repetido = admin(pendente);
  await comChave(() => submeter(envio(POST_VALIDO, { arquivo: jpeg(1080, 1350) }), repetido.cliente, URL_BASE));

  assertEquals(primeiro.uploads.length + segundo.uploads.length + repetido.uploads.length, 3);
  // Bytes diferentes, mesmo corte e mesmo nome: caminhos diferentes. Nada ocupa o lugar do outro.
  assertEquals(primeiro.uploads[0] === segundo.uploads[0], false);
  // Mesmos bytes: mesmo caminho, e por isso o reenvio idêntico é idempotente.
  assertEquals(primeiro.uploads[0], repetido.uploads[0]);
  for (const a of [primeiro, segundo, repetido]) {
    assertEquals(a.opcoesDoUpload[0].upsert, false);
    assertEquals(CAMINHO_COM_HASH.test(a.uploads[0]), true, a.uploads[0]);
  }
  // O que o update grava aponta para o caminho novo.
  const gravado = segundo.de("social_post", "update")[0].payload as { slides: { path: string }[] };
  assertEquals(gravado.slides[0].path, segundo.uploads[0]);
});

Deno.test("objeto que já existe no bucket (mesmo conteúdo) conta como sucesso", async () => {
  const a = admin(
    (c) => (c.tabela === "social_post" && c.op === "insert" ? ok({ id: ID_POST }) : ok(null)),
    { erroUpload: { statusCode: "409", message: "The resource already exists" } },
  );
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  const corpo = await res.json();
  assertEquals(res.status, 200);
  assertEquals(corpo.ok, true);
  assertEquals(a.de("social_post", "insert").length, 1);
});

Deno.test("falha de upload que não é objeto existente é 500 e nada é gravado", async () => {
  const a = admin(() => ok(null), { erroUpload: { statusCode: "500", message: "storage fora do ar" } });
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  assertEquals(res.status, 500);
  assertEquals(a.de("social_post", "insert").length + a.de("social_post", "update").length, 0);
  assertEquals(a.de("social_post_event", "insert").length, 0);
});

Deno.test("submeter reenvio de rascunho em pending_review atualiza a mesma linha", async () => {
  const a = admin((c) => {
    if (c.op === "select" && c.tabela === "social_post") return ok({ id: ID_POST, status: "pending_review" });
    if (c.op === "update") return ok([{ id: ID_POST }]);
    return ok(null);
  });
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  const corpo = await res.json();
  assertEquals(res.status, 200);
  assertEquals(corpo.id, ID_POST);
  assertEquals(a.de("social_post", "insert").length, 0);
  assertEquals(a.de("social_post_event", "insert").length, 1);
});

Deno.test("submeter reenvio de rascunho recusado sem container volta para pending_review, limpo, e registra o motivo no rastro", async () => {
  const a = admin((c) => {
    if (c.op === "select" && c.tabela === "social_post") return ok({ id: ID_POST, status: "rejected", ig_container_id: null });
    if (c.op === "update") return ok([{ id: ID_POST }]);
    return ok(null);
  });
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  const corpo = await res.json();
  assertEquals(res.status, 200);
  assertEquals(corpo.ok, true);
  assertEquals(corpo.id, ID_POST);
  assertEquals(corpo.status, "pending_review");
  assertEquals(a.de("social_post", "insert").length, 0);
  const [u] = a.de("social_post", "update");
  const p = u.payload as { status: string; approved_by: null; approved_at: null; last_error: null; deleted_at: null };
  assertEquals(p.status, "pending_review");
  assertEquals(p.approved_by, null);
  assertEquals(p.approved_at, null);
  assertEquals(p.last_error, null);
  // A escrita confere, na própria condição, que ainda está recusado e que a Meta nunca recebeu nada.
  assertEquals(u.filtros.some(([op, col, v]) => op === "eq" && col === "status" && v === "rejected"), true);
  assertEquals(u.filtros.some(([op, col, v]) => op === "is" && col === "ig_container_id" && v === null), true);
  assertEquals(u.filtros.some(([, col, v]) => col === "status" && v === "pending_review"), false);
  const [e] = a.de("social_post_event", "insert");
  const ev = e.payload as { kind: string; note: string };
  assertEquals(ev.kind, "draft_received");
  assertStringIncludes(ev.note, "Reenviado depois de uma recusa");
});

Deno.test("submeter reenvio de rascunho recusado COM container é 409 e nada sobe nem é gravado", async () => {
  const a = admin((c) =>
    c.op === "select" && c.tabela === "social_post" ? ok({ id: ID_POST, status: "rejected", ig_container_id: "17900000000000001" }) : ok(null)
  );
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  const corpo = await res.json();
  assertEquals(res.status, 409);
  assertEquals(a.uploads.length, 0);
  assertEquals(a.de("social_post", "update").length + a.de("social_post", "insert").length, 0);
  assertEquals(a.de("social_post_event", "insert").length, 0);
  assertStringIncludes(corpo.erros[0], "tentativa de publicação na Meta");
  assertEquals(JSON.stringify(corpo).includes("rejected"), false);
});

Deno.test("submeter: recusado que ganhou container entre a leitura e a escrita é 409 e a linha fica como estava", async () => {
  // Lido sem container; o update condicionado a `ig_container_id is null` não acha linha.
  const a = admin((c) => {
    if (c.op === "select" && c.tabela === "social_post") return ok({ id: ID_POST, status: "rejected", ig_container_id: null });
    if (c.op === "update") return ok([]);
    return ok(null);
  });
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  assertEquals(res.status, 409);
  assertEquals(a.de("social_post_event", "insert").length, 0);
});

Deno.test("submeter: reenvio de pending_review com container antigo continua valendo (a regra nova só abre o recusado)", async () => {
  const a = admin((c) => {
    if (c.op === "select" && c.tabela === "social_post") return ok({ id: ID_POST, status: "pending_review", ig_container_id: "17900000000000001" });
    if (c.op === "update") return ok([{ id: ID_POST }]);
    return ok(null);
  });
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  assertEquals(res.status, 200);
  const [u] = a.de("social_post", "update");
  assertEquals(u.filtros.some(([, col, v]) => col === "status" && v === "pending_review"), true);
  assertEquals(u.filtros.some(([op, col]) => op === "is" && col === "ig_container_id"), false);
  const [e] = a.de("social_post_event", "insert");
  assertEquals((e.payload as { note: string }).note.includes("recusa"), false);
});

Deno.test("submeter: unique violada no insert (dois envios ao mesmo tempo) é 409", async () => {
  const a = admin((c) => {
    if (c.op === "insert" && c.tabela === "social_post") return { data: null, error: { code: "23505", message: "duplicate key" } };
    return ok(null);
  });
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  const corpo = await res.json();
  assertEquals(res.status, 409);
  assertStringIncludes(corpo.erros[0], "Outro envio deste rascunho chegou primeiro");
  assertEquals(a.de("social_post_event", "insert").length, 0);
});

Deno.test("submeter: outro erro do insert é 500, não 409", async () => {
  const a = admin((c) => {
    if (c.op === "insert" && c.tabela === "social_post") return { data: null, error: { code: "XX000", message: "falhou" } };
    return ok(null);
  });
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  assertEquals(res.status, 500);
});

Deno.test("submeter: erro na consulta do rascunho existente é 500", async () => {
  const a = admin((c) => (c.op === "select" && c.tabela === "social_post" ? { data: null, error: { message: "boom" } } : ok(null)));
  const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  assertEquals(res.status, 500);
  assertEquals(a.uploads.length, 0);
});

Deno.test("submeter com price_date inexistente é 422 e nada é lido, subido nem gravado", async () => {
  const a = admin(() => ok(null));
  const res = await comChave(() => submeter(envio({ ...POST_VALIDO, price_date: "2026-02-30" }), a.cliente, URL_BASE));
  const corpo = await res.json();
  assertEquals(res.status, 422);
  assertEquals(corpo.ok, false);
  assertEquals(a.chamadas.length, 0);
  assertEquals(a.uploads.length, 0);
});

Deno.test("submeter com publicar_em inexistente é 422 e nada é lido, subido nem gravado", async () => {
  const a = admin(() => ok(null));
  const res = await comChave(() => submeter(envio({ ...POST_VALIDO, publicar_em: "2026-02-30T12:00:00Z" }), a.cliente, URL_BASE));
  assertEquals(res.status, 422);
  assertEquals(a.chamadas.length, 0);
  assertEquals(a.uploads.length, 0);
});

Deno.test("submeter com arquivo que não é JPEG é 422 e nada é gravado", async () => {
  const a = admin(() => ok(null));
  const res = await comChave(() =>
    submeter(envio(POST_VALIDO, { arquivo: new TextEncoder().encode("texto") }), a.cliente, URL_BASE)
  );
  assertEquals(res.status, 422);
  assertEquals(a.chamadas.length, 0);
});

Deno.test("submeter: falha ao gravar o evento não derruba o 200, mas avisa", async () => {
  const erro = console.error;
  console.error = () => {};
  try {
    const a = admin((c) => {
      if (c.tabela === "social_post" && c.op === "insert") return ok({ id: ID_POST });
      if (c.tabela === "social_post_event") return { data: null, error: { code: "42501", message: "sem permissão" } };
      return ok(null);
    });
    const res = await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
    const corpo = await res.json();
    assertEquals(res.status, 200);
    assertEquals(corpo.ok, true);
    assertEquals(corpo.aviso, "o rastro não foi gravado");
  } finally {
    console.error = erro;
  }
});

function legenda(corpo: unknown, token: string | null = "jwt-de-teste"): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request(`${URL_BASE}/functions/v1/social-draft`, { method: "POST", headers, body: JSON.stringify(corpo) });
}

const POST_NA_FILA = {
  id: ID_POST,
  status: "approved",
  caption: "Legenda antiga",
  slides: [{ url: "u", path: "p", alt: "a", texto: null }],
  keyphrase: null,
  price_date: null,
};

/** Responde como o banco para um hub_admin que corrige a legenda de `post`. */
function roteiroLegenda(post: unknown, atualizado: unknown = [{ id: ID_POST }]) {
  return (c: Chamada): Resposta => {
    if (c.tabela === "profiles") return ok({ role: "hub_admin" });
    if (c.tabela === "social_post" && c.op === "select") return ok(post);
    if (c.tabela === "social_post" && c.op === "update") return ok(atualizado);
    return ok(null);
  };
}

Deno.test("update_caption sem token é 401", async () => {
  const a = admin(() => ok(null));
  const res = await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "x", expected_updated_at: VERSAO }, null), a.cliente);
  assertEquals(res.status, 401);
  assertEquals(a.chamadas.length, 0);
});

Deno.test("update_caption com token inválido é 401", async () => {
  const a = admin(() => ok(null), { usuario: null });
  const res = await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "x", expected_updated_at: VERSAO }), a.cliente);
  assertEquals(res.status, 401);
  assertEquals(a.chamadas.length, 0);
});

Deno.test("update_caption de quem não é hub_admin é 403 e não escreve", async () => {
  const a = admin((c) => (c.tabela === "profiles" ? ok({ role: "company_operator" }) : ok(null)), { usuario: { id: ID_ADMIN } });
  const res = await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "x", expected_updated_at: VERSAO }), a.cliente);
  assertEquals(res.status, 403);
  assertEquals(a.de("social_post", "update").length, 0);
  assertEquals(a.de("social_post_event", "insert").length, 0);
});

Deno.test("update_caption em post aprovado volta para pending_review e registra caption_edited", async () => {
  const a = admin(roteiroLegenda(POST_NA_FILA), { usuario: { id: ID_ADMIN } });
  const res = await corrigirLegenda(
    legenda({ action: "update_caption", id: ID_POST, caption: "  Legenda nova. #a #b #c  ", expected_updated_at: VERSAO }),
    a.cliente,
  );
  const corpo = await res.json();
  assertEquals(res.status, 200);
  assertEquals(corpo.ok, true);
  assertEquals(corpo.aviso, undefined);
  const [u] = a.de("social_post", "update");
  const p = u.payload as { caption: string; status: string; approved_by: null; approved_at: null };
  assertEquals(p.caption, "Legenda nova. #a #b #c");
  assertEquals(p.status, "pending_review");
  assertEquals(p.approved_by, null);
  assertEquals(p.approved_at, null);
  assertEquals(u.filtros.some(([op, col, v]) => op === "in" && col === "status" && JSON.stringify(v) === '["pending_review","approved"]'), true);
  // A versão aberta vai na própria escrita, com a string exatamente como veio (microssegundos e fuso).
  assertEquals(u.filtros.some(([op, col, v]) => op === "eq" && col === "updated_at" && v === VERSAO), true);
  const [e] = a.de("social_post_event", "insert");
  const ev = e.payload as { kind: string; actor: string; request: { antes: string; depois: string } };
  assertEquals(ev.kind, "caption_edited");
  assertEquals(ev.actor, ID_ADMIN);
  assertEquals(ev.request, { antes: "Legenda antiga", depois: "Legenda nova. #a #b #c" });
});

Deno.test("update_caption em post publicado é 409 em português e não escreve", async () => {
  const a = admin(roteiroLegenda({ ...POST_NA_FILA, status: "published" }), { usuario: { id: ID_ADMIN } });
  const res = await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "x", expected_updated_at: VERSAO }), a.cliente);
  const corpo = await res.json();
  assertEquals(res.status, 409);
  assertEquals(corpo.erros[0], "Não dá para corrigir a legenda: o post está publicado.");
  assertEquals(a.de("social_post", "update").length, 0);
});

Deno.test("update_caption: o post saiu do estado editável entre a leitura e a escrita, 409", async () => {
  const a = admin(roteiroLegenda(POST_NA_FILA, []), { usuario: { id: ID_ADMIN } });
  const res = await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "x", expected_updated_at: VERSAO }), a.cliente);
  assertEquals(res.status, 409);
  assertEquals(a.de("social_post_event", "insert").length, 0);
});

Deno.test("update_caption sem a versão aberta é 422 e não lê nem escreve o post", async () => {
  for (const faltando of [undefined, "", "  ", "ontem", null, 42]) {
    const a = admin(roteiroLegenda(POST_NA_FILA), { usuario: { id: ID_ADMIN } });
    const res = await corrigirLegenda(
      legenda({ action: "update_caption", id: ID_POST, caption: "Legenda nova.", expected_updated_at: faltando }),
      a.cliente,
    );
    const corpo = await res.json();
    assertEquals(res.status, 422, String(faltando));
    assertStringIncludes(corpo.erros[0], "qual versão do post estava aberta");
    assertEquals(a.chamadas.filter((c) => c.tabela === "social_post").length, 0, String(faltando));
    assertEquals(a.de("social_post_event", "insert").length, 0);
  }
  // Sem o campo nenhum (corpo antigo, de uma tela que ainda não conhece a versão).
  const a = admin(roteiroLegenda(POST_NA_FILA), { usuario: { id: ID_ADMIN } });
  const res = await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "Legenda nova." }), a.cliente);
  assertEquals(res.status, 422);
  assertEquals(a.de("social_post", "update").length, 0);
});

Deno.test("update_caption: o post mudou desde que a pessoa abriu (versão velha), 409 com o texto da versão e sem rastro", async () => {
  // Está em estado editável, mas o updated_at já não é o que ela viu: o update não acha linha.
  const a = admin(roteiroLegenda(POST_NA_FILA, []), { usuario: { id: ID_ADMIN } });
  const res = await corrigirLegenda(
    legenda({ action: "update_caption", id: ID_POST, caption: "Legenda nova.", expected_updated_at: "2026-10-20T10:00:00+00:00" }),
    a.cliente,
  );
  const corpo = await res.json();
  assertEquals(res.status, 409);
  assertEquals(corpo.erros, ["O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova."]);
  assertEquals(corpo.erros[0], TEXTO_VERSAO_VELHA);
  const [u] = a.de("social_post", "update");
  assertEquals(u.filtros.some(([op, col, v]) => op === "eq" && col === "updated_at" && v === "2026-10-20T10:00:00+00:00"), true);
  assertEquals(a.de("social_post_event", "insert").length, 0);
});

Deno.test("update_caption: erro de banco na consulta é 500, e post ausente é 404", async () => {
  const quebrado = admin(
    (c) => (c.tabela === "profiles" ? ok({ role: "hub_admin" }) : { data: null, error: { message: "boom" } }),
    { usuario: { id: ID_ADMIN } },
  );
  assertEquals((await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "x", expected_updated_at: VERSAO }), quebrado.cliente)).status, 500);

  const ausente = admin(roteiroLegenda(null), { usuario: { id: ID_ADMIN } });
  assertEquals((await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "x", expected_updated_at: VERSAO }), ausente.cliente)).status, 404);

  const semUuid = admin(roteiroLegenda(null), { usuario: { id: ID_ADMIN } });
  assertEquals((await corrigirLegenda(legenda({ action: "update_caption", id: "x", caption: "x", expected_updated_at: VERSAO }), semUuid.cliente)).status, 404);
  assertEquals(semUuid.de("social_post", "select").length, 0);
});

Deno.test("update_caption com corpo null ou ação errada é 400 e não estoura", async () => {
  for (const corpo of [null, [], "texto", { action: "outra" }]) {
    const a = admin(roteiroLegenda(POST_NA_FILA), { usuario: { id: ID_ADMIN } });
    const res = await corrigirLegenda(legenda(corpo), a.cliente);
    assertEquals(res.status, 400, JSON.stringify(corpo));
    assertEquals(a.de("social_post", "update").length, 0);
  }
});

Deno.test("update_caption com legenda vazia é 422", async () => {
  const a = admin(roteiroLegenda(POST_NA_FILA), { usuario: { id: ID_ADMIN } });
  const res = await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "   ", expected_updated_at: VERSAO }), a.cliente);
  assertEquals(res.status, 422);
  assertEquals(a.chamadas.filter((c) => c.tabela === "social_post").length, 0);
});

Deno.test("update_caption: falha ao gravar o evento mantém o 200 e avisa", async () => {
  const erro = console.error;
  console.error = () => {};
  try {
    const base = roteiroLegenda(POST_NA_FILA);
    const a = admin(
      (c) => (c.tabela === "social_post_event" ? { data: null, error: { code: "42501", message: "sem permissão" } } : base(c)),
      { usuario: { id: ID_ADMIN } },
    );
    const res = await corrigirLegenda(legenda({ action: "update_caption", id: ID_POST, caption: "Legenda nova.", expected_updated_at: VERSAO }), a.cliente);
    const corpo = await res.json();
    assertEquals(res.status, 200);
    assertEquals(corpo.aviso, "o rastro não foi gravado");
  } finally {
    console.error = erro;
  }
});

// ── stories ─────────────────────────────────────────────────────────────────────────

const POST_COM_STORIES = { ...POST_VALIDO, placements: ["feed", "story"], stories: [{ arquivo: "slide-01-story.jpg" }] };

Deno.test("submeter com stories: sobe a imagem 9:16 no caminho com hash e grava lugares e stories pendentes", async () => {
  const a = admin((c) => (c.tabela === "social_post" && c.op === "insert" ? ok({ id: ID_POST }) : ok(null)));
  const res = await comChave(() =>
    submeter(envio(POST_COM_STORIES, { stories: { "slide-01-story.jpg": jpeg(1080, 1920) } }), a.cliente, URL_BASE)
  );
  assertEquals(res.status, 200);
  assertEquals(a.uploads.length, 2);
  assertEquals(/^social\/teste-fila\/2\/[0-9a-f]{16}\/slide-01-story\.jpg$/.test(a.uploads[1]), true, a.uploads[1]);
  const inserido = a.de("social_post", "insert")[0].payload as Record<string, unknown>;
  assertEquals(inserido.placements, ["feed", "story"]);
  assertEquals(inserido.story_status, "pending");
  assertEquals(inserido.story_items, []);
  assertEquals(inserido.story_slides, [
    { url: `${URL_BASE}/storage/v1/object/public/assets-public/${a.uploads[1]}`, path: a.uploads[1] },
  ]);
});

Deno.test("submeter só feed: sem stories, o estado de story fica nulo", async () => {
  const a = admin((c) => (c.tabela === "social_post" && c.op === "insert" ? ok({ id: ID_POST }) : ok(null)));
  await comChave(() => submeter(envio(POST_VALIDO), a.cliente, URL_BASE));
  const inserido = a.de("social_post", "insert")[0].payload as Record<string, unknown>;
  assertEquals(inserido.placements, ["feed"]);
  assertEquals(inserido.story_status, null);
  assertEquals(inserido.story_slides, []);
});

Deno.test("submeter com story que não é 9:16, ou faltando, é 422 e nada sobe nem é gravado", async () => {
  const casos: Record<string, Uint8Array>[] = [{ "slide-01-story.jpg": jpeg(1080, 1350) }, {}];
  for (const stories of casos) {
    const a = admin(() => ok(null));
    const res = await comChave(() => submeter(envio(POST_COM_STORIES, { stories }), a.cliente, URL_BASE));
    assertEquals(res.status, 422);
    const corpo = await res.json();
    assertEquals(
      corpo.erros[0],
      Object.keys(stories).length
        ? "slide-01-story.jpg está em 1080x1350. O story precisa ser vertical 9:16, como 1080x1920."
        : "Faltou anexar o arquivo slide-01-story.jpg.",
    );
    assertEquals(a.uploads.length, 0);
    assertEquals(a.de("social_post", "insert").length, 0);
  }
});
