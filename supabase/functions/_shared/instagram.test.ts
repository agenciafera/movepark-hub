// O cliente da Graph API é o único lugar que fala com a Meta. Os testes usam um fetch falso:
// conferem a ordem das chamadas, os campos de cada uma e que o token nunca vai para o rastro.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acharMidiaPorLegenda, type GraphCall, igConfigFromEnv, publicar } from "./instagram.ts";

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
  assertEquals(await acharMidiaPorLegenda(CFG, "Legenda certa", { fetcher }), { id: "m1", permalink: "https://www.instagram.com/p/abc/" });
});

Deno.test("igConfigFromEnv devolve nulo sem token", () => {
  assertEquals(igConfigFromEnv(() => undefined), null);
  assertEquals(igConfigFromEnv((k) => ({ INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_USER_ID: "1" } as Record<string, string>)[k]), {
    token: "t",
    igUserId: "1",
    versao: "v21.0",
  });
});
