// Teste dos branches de validação. Validar aqui, e não deixar a Meta recusar,
// importa porque o carrossel cria N containers antes do publish: falhar no
// sétimo deixaria seis containers órfãos pendurados na conta por 24h.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler, PUBLICACAO_SO_PELA_FILA } from "./index.ts";
import { autorizado, ehCarrossel, LIMITES, validar } from "./logic.ts";

const img = (n: number) => ({
  url: `https://exemplo.co/slide-${n}.jpg`,
  alt: `pátio de estacionamento no aeroporto de Confins, slide ${n}`,
});

Deno.test("payload bom passa sem erro", () => {
  assertEquals(validar({ caption: "Legenda válida. #confins", images: [img(1)] }), []);
});

Deno.test("caption vazia é recusada", () => {
  const e = validar({ caption: "   ", images: [img(1)] });
  assertEquals(e.includes("caption vazia"), true);
});

Deno.test("caption acima de 2200 é recusada", () => {
  const e = validar({ caption: "a".repeat(LIMITES.legenda + 1), images: [img(1)] });
  assertEquals(e.some((m) => m.includes("2200")), true);
});

Deno.test("mais de 30 hashtags é recusado", () => {
  const caption = "texto " + Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
  assertEquals(validar({ caption, images: [img(1)] }).some((m) => m.includes("hashtags")), true);
});

Deno.test("hashtag com acento conta (a regex é unicode)", () => {
  const caption = "texto " + Array.from({ length: 31 }, (_, i) => `#tagáç${i}`).join(" ");
  assertEquals(validar({ caption, images: [img(1)] }).some((m) => m.includes("31 hashtags")), true);
});

Deno.test("mais de 20 menções é recusado", () => {
  const caption = "oi " + Array.from({ length: 21 }, (_, i) => `@perfil${i}`).join(" ");
  assertEquals(validar({ caption, images: [img(1)] }).some((m) => m.includes("menções")), true);
});

Deno.test("carrossel acima de 10 slides é recusado", () => {
  const images = Array.from({ length: 11 }, (_, i) => img(i));
  assertEquals(validar({ caption: "ok", images }).some((m) => m.includes("limite do carrossel")), true);
});

Deno.test("sem imagem é recusado", () => {
  assertEquals(validar({ caption: "ok", images: [] }).includes("nenhuma imagem"), true);
});

Deno.test("imagem http é recusada, porque a Meta só busca https", () => {
  const e = validar({ caption: "ok", images: [{ url: "http://exemplo.co/a.jpg" }] });
  assertEquals(e.some((m) => m.includes("não é https")), true);
});

Deno.test("imagem que não é jpg é recusada", () => {
  const e = validar({ caption: "ok", images: [{ url: "https://exemplo.co/a.webp" }] });
  assertEquals(e.some((m) => m.includes("JPEG")), true);
});

Deno.test("jpg com query string continua valendo", () => {
  assertEquals(validar({ caption: "ok", images: [{ url: "https://exemplo.co/a.jpg?v=2" }] }), []);
});

Deno.test("alt acima de 1000 é recusado", () => {
  const e = validar({ caption: "ok", images: [{ url: "https://e.co/a.jpg", alt: "x".repeat(1001) }] });
  assertEquals(e.some((m) => m.includes("alt da imagem 1")), true);
});

Deno.test("ehCarrossel separa post único de carrossel", () => {
  assertEquals(ehCarrossel([1]), false);
  assertEquals(ehCarrossel([1, 2]), true);
});

Deno.test("autorizado exige a chave configurada e igual", () => {
  assertEquals(autorizado("segredo", "segredo"), true);
  assertEquals(autorizado("segredo", "outro"), false);
  assertEquals(autorizado(undefined, "qualquer"), false);
  assertEquals(autorizado(undefined, null), false);
});

// ── O handler: esta rota não publica ──────────────────────────────────────────────────────
// A publicação real é da fila (social-dispatch). Aqui só existem diagnose e o ensaio.

const CHAVE = "chave-de-teste-publish";

/** Roda `fn` com o ambiente da Edge e um `fetch` de mentira que conta as chamadas. */
async function comAmbiente<T>(fn: (chamadas: string[]) => Promise<T>): Promise<T> {
  const antes = globalThis.fetch;
  const envs = {
    PUBLISH_INSTAGRAM_KEY: CHAVE,
    INSTAGRAM_ACCESS_TOKEN: "EAAB-token-secreto-de-teste",
    INSTAGRAM_USER_ID: "17841400000000000",
  };
  for (const [k, v] of Object.entries(envs)) Deno.env.set(k, v);
  const chamadas: string[] = [];
  globalThis.fetch = ((entrada: string | URL | Request, init?: RequestInit) => {
    chamadas.push(`${init?.method ?? "GET"} ${String(entrada)}`);
    return Promise.resolve(
      new Response("", { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
  }) as typeof fetch;
  try {
    return await fn(chamadas);
  } finally {
    globalThis.fetch = antes;
    for (const k of Object.keys(envs)) Deno.env.delete(k);
  }
}

function pedido(corpo: unknown, chave: string | null = CHAVE): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (chave) headers.set("x-publish-instagram-key", chave);
  return new Request("https://x.supabase.co/functions/v1/publish-instagram", {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

Deno.test("publish com dryRun false é 403 e não chama a Meta nem o servidor das imagens", async () => {
  await comAmbiente(async (chamadas) => {
    const res = await handler(
      pedido({ action: "publish", dryRun: false, caption: "Legenda. #a #b #c", images: [img(1), img(2)] }),
    );
    const corpo = await res.json();
    assertEquals(res.status, 403);
    assertEquals(corpo, { ok: false, erros: ["Publicação real só pela fila (/manager/social)."] });
    assertEquals(PUBLICACAO_SO_PELA_FILA, corpo.erros[0]);
    assertEquals(chamadas, [], "nenhuma chamada de rede: nem Graph API, nem HEAD de imagem");
  });
});

Deno.test("publish com dryRun false é 403 mesmo sem o token da Meta configurado", async () => {
  await comAmbiente(async (chamadas) => {
    Deno.env.delete("INSTAGRAM_ACCESS_TOKEN");
    const res = await handler(pedido({ action: "publish", dryRun: false, caption: "x", images: [img(1)] }));
    assertEquals(res.status, 403);
    assertEquals(chamadas, []);
  });
});

Deno.test("publish sem a chave certa continua 401, antes da recusa", async () => {
  await comAmbiente(async (chamadas) => {
    const res = await handler(pedido({ action: "publish", dryRun: false }, "errada"));
    assertEquals(res.status, 401);
    assertEquals(chamadas, []);
  });
});

Deno.test("o ensaio (dryRun padrão) continua valendo e diz que nada foi publicado", async () => {
  await comAmbiente(async (chamadas) => {
    for (const extra of [{}, { dryRun: true }]) {
      chamadas.length = 0;
      const res = await handler(
        pedido({ action: "publish", caption: "Legenda do ensaio. #a #b #c", images: [img(1), img(2)], ...extra }),
      );
      const corpo = await res.json();
      assertEquals(res.status, 200);
      assertEquals(corpo.ok, true);
      assertEquals(corpo.dryRun, true);
      assertEquals(corpo.publicaria.tipo, "carrossel");
      assertEquals(corpo.publicaria.slides, 2);
      // Só o HEAD das duas imagens: nenhum POST para a Graph API.
      assertEquals(chamadas.length, 2);
      assertEquals(chamadas.every((c) => c.startsWith("HEAD ")), true, chamadas.join(" | "));
    }
  });
});

Deno.test("o ensaio com payload inválido é 422 e não chama a rede", async () => {
  await comAmbiente(async (chamadas) => {
    const res = await handler(pedido({ action: "publish", caption: "", images: [] }));
    assertEquals(res.status, 422);
    assertEquals(chamadas, []);
  });
});

Deno.test("corpo que não é objeto cai no diagnóstico, sem estourar", async () => {
  await comAmbiente(async () => {
    const res = await handler(pedido(null));
    // diagnose chama a Graph API de mentira; o que importa é não ser 500 por TypeError.
    assertEquals(res.status !== 500, true);
  });
});
