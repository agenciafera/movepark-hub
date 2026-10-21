// O cliente da Graph API é o único lugar que fala com a Meta. Os testes usam um fetch falso:
// conferem a ordem das chamadas, os campos de cada uma e que o token nunca vai para o rastro.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acharMidiaPorLegenda, esperarContainer, type GraphCall, graph, igConfigFromEnv, publicar } from "./instagram.ts";

const CFG = { token: "TOKEN-SECRETO", igUserId: "17841", versao: "v21.0" };

function fetchFalso(respostas: Array<{ status?: number; body: unknown }>) {
  const chamadas: { url: string; corpo: string }[] = [];
  let i = 0;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), corpo: init?.body ? String(init.body) : "" });
    const r = respostas[Math.min(i++, respostas.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { fetcher, chamadas };
}

const rapido = { esperaMs: 0, tentativas: 2 };

Deno.test("carrossel: um container por slide, o pai com os filhos, espera e publica", async () => {
  const { fetcher, chamadas } = fetchFalso([
    { body: { id: "c1" } },
    { body: { id: "c2" } },
    { body: { id: "pai" } },
    { body: { status_code: "FINISHED" } },
    { body: { id: "midia" } },
  ]);
  const containers: string[] = [];
  const r = await publicar(
    CFG,
    { caption: "Legenda", images: [{ url: "https://x.co/1.jpg", alt: "um" }, { url: "https://x.co/2.jpg", alt: "dois" }] },
    { ...rapido, fetcher, onContainer: (id) => void containers.push(id) },
  );
  assertEquals(r, { ok: true, mediaId: "midia", containerId: "pai" });
  assertEquals(chamadas.length, 5);
  assertEquals(chamadas[0].corpo.includes("is_carousel_item=true"), true);
  assertEquals(chamadas[0].corpo.includes("alt_text=um"), true);
  assertEquals(chamadas[2].corpo.includes("media_type=CAROUSEL"), true);
  assertEquals(decodeURIComponent(chamadas[2].corpo).includes("children=c1,c2"), true);
  assertEquals(chamadas[4].url.endsWith("/17841/media_publish"), true);
  assertEquals(containers, ["pai"]);
});

Deno.test("post único: um container com legenda, espera e publica", async () => {
  const { fetcher, chamadas } = fetchFalso([
    { body: { id: "unico" } },
    { body: { status_code: "FINISHED" } },
    { body: { id: "midia" } },
  ]);
  const r = await publicar(CFG, { caption: "Legenda", images: [{ url: "https://x.co/1.jpg" }] }, { ...rapido, fetcher });
  assertEquals(r.ok, true);
  assertEquals(chamadas.length, 3);
  assertEquals(chamadas[0].corpo.includes("caption=Legenda"), true);
});

Deno.test("falha no segundo slide para antes de criar o pai e de publicar", async () => {
  const { fetcher, chamadas } = fetchFalso([
    { body: { id: "c1" } },
    { status: 400, body: { error: { message: "Only photo or video can be accepted as media type." } } },
  ]);
  const r = await publicar(
    CFG,
    { caption: "x", images: [{ url: "https://x.co/1.jpg" }, { url: "https://x.co/2.jpg" }] },
    { ...rapido, fetcher },
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.etapa, "container do slide 2");
  assertEquals(chamadas.length, 2);
});

Deno.test("container com ERROR não é publicado e devolve o id do container", async () => {
  const { fetcher } = fetchFalso([{ body: { id: "unico" } }, { body: { status_code: "ERROR", status: "falhou" } }]);
  const r = await publicar(CFG, { caption: "x", images: [{ url: "https://x.co/1.jpg" }] }, { ...rapido, fetcher });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals([r.etapa, r.containerId], ["container não ficou pronto", "unico"]);
});

Deno.test("o rastro recebe toda chamada e nunca o token", async () => {
  const { fetcher } = fetchFalso([
    { body: { id: "unico" } },
    { body: { status_code: "FINISHED" } },
    { body: { id: "midia" } },
  ]);
  const rastro: GraphCall[] = [];
  await publicar(CFG, { caption: "x", images: [{ url: "https://x.co/1.jpg" }] }, {
    ...rapido,
    fetcher,
    onCall: (c) => void rastro.push(c),
  });
  assertEquals(rastro.map((c) => c.kind), ["container_parent", "container_status", "media_publish"]);
  assertEquals(JSON.stringify(rastro).includes("TOKEN-SECRETO"), false);
});

Deno.test("acharMidiaPorLegenda acha pela legenda, ignorando espaço nas pontas", async () => {
  const { fetcher } = fetchFalso([
    { body: { data: [{ id: "m9", caption: "Outra" }, { id: "m1", caption: "Legenda certa\n", permalink: "https://www.instagram.com/p/abc/" }] } },
  ]);
  assertEquals(await acharMidiaPorLegenda(CFG, "Legenda certa", { fetcher }), {
    id: "m1",
    permalink: "https://www.instagram.com/p/abc/",
    timestamp: null,
  });
});

Deno.test("acharMidiaPorLegenda devolve o timestamp da mídia, que é quando ela foi ao ar", async () => {
  const { fetcher, chamadas } = fetchFalso([
    {
      body: {
        data: [{ id: "m1", caption: "Legenda certa", permalink: "https://www.instagram.com/p/abc/", timestamp: "2026-10-29T02:55:00+0000" }],
      },
    },
  ]);
  assertEquals(await acharMidiaPorLegenda(CFG, "Legenda certa", { fetcher }), {
    id: "m1",
    permalink: "https://www.instagram.com/p/abc/",
    timestamp: "2026-10-29T02:55:00+0000",
  });
  assertEquals(new URL(chamadas[0].url).searchParams.get("fields"), "id,caption,permalink,timestamp");
});

Deno.test("igConfigFromEnv devolve nulo sem token", () => {
  assertEquals(igConfigFromEnv(() => undefined), null);
  assertEquals(igConfigFromEnv((k) => ({ INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_USER_ID: "1" } as Record<string, string>)[k]), {
    token: "t",
    igUserId: "1",
    versao: "v21.0",
  });
});

Deno.test("erro de rede que cita a URL com o token não vaza o token nem para o resultado nem para o rastro", async () => {
  const fetcher = (() => {
    throw new Error(
      "error sending request for url (https://graph.facebook.com/v21.0/x?access_token=TOKEN-SECRETO)",
    );
  }) as unknown as typeof fetch;
  const rastro: GraphCall[] = [];
  const onCall = (c: GraphCall) => void rastro.push(c);

  const r = await graph(CFG, "x", "GET", {}, { fetcher, onCall });
  assertEquals(r.ok, false);
  assertEquals(r.status, 0);
  assertEquals(JSON.stringify(r).includes("TOKEN-SECRETO"), false);

  const p = await publicar(CFG, { caption: "x", images: [{ url: "https://x.co/1.jpg" }] }, { ...rapido, fetcher, onCall });
  assertEquals(p.ok, false);
  assertEquals(JSON.stringify(p).includes("TOKEN-SECRETO"), false);
  assertEquals(rastro.length >= 2, true);
  assertEquals(JSON.stringify(rastro).includes("TOKEN-SECRETO"), false);
});

Deno.test("falha ao gravar o rastro não derruba a publicação nem perde o mediaId", async () => {
  const { fetcher } = fetchFalso([
    { body: { id: "unico" } },
    { body: { status_code: "FINISHED" } },
    { body: { id: "midia" } },
  ]);
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
  try {
    const sincrono = await publicar(CFG, { caption: "x", images: [{ url: "https://x.co/1.jpg" }] }, {
      ...rapido,
      fetcher,
      onCall: () => {
        throw new Error("banco fora do ar");
      },
    });
    assertEquals(sincrono, { ok: true, mediaId: "midia", containerId: "unico" });

    const { fetcher: f2 } = fetchFalso([
      { body: { id: "unico" } },
      { body: { status_code: "FINISHED" } },
      { body: { id: "midia" } },
    ]);
    const assincrono = await publicar(CFG, { caption: "x", images: [{ url: "https://x.co/1.jpg" }] }, {
      ...rapido,
      fetcher: f2,
      onCall: () => Promise.reject(new Error("banco fora do ar")),
    });
    assertEquals(assincrono, { ok: true, mediaId: "midia", containerId: "unico" });
  } finally {
    console.error = original;
  }
  assertEquals(logs.length > 0, true);
  assertEquals(logs.join("\n").includes("TOKEN-SECRETO"), false);
});

Deno.test("sem imagem, publicar recusa antes de falar com a Meta", async () => {
  const { fetcher, chamadas } = fetchFalso([{ body: { id: "nunca" } }]);
  const r = await publicar(CFG, { caption: "x", images: [] }, { ...rapido, fetcher });
  assertEquals(r, { ok: false, etapa: "sem imagem", resposta: null });
  assertEquals(chamadas.length, 0);
});

Deno.test("esperarContainer: sem tentativas informadas, consulta 30 vezes antes de desistir (carrossel de 10 slides)", async () => {
  const { fetcher, chamadas } = fetchFalso([{ body: { status_code: "IN_PROGRESS" } }]);
  const r = await esperarContainer(CFG, "pai", { fetcher, esperaMs: 0 });
  assertEquals(r, { pronto: false, status: "TIMEOUT" });
  assertEquals(chamadas.length, 30);
});

Deno.test("esperarContainer: para na primeira consulta que vem FINISHED, sem gastar o resto", async () => {
  const { fetcher, chamadas } = fetchFalso([
    { body: { status_code: "IN_PROGRESS" } },
    { body: { status_code: "IN_PROGRESS" } },
    { body: { status_code: "FINISHED" } },
  ]);
  const r = await esperarContainer(CFG, "pai", { fetcher, esperaMs: 0 });
  assertEquals(r, { pronto: true, status: "FINISHED" });
  assertEquals(chamadas.length, 3);
});
