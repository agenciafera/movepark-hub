// Edge Function: /indexnow
// Drena a fila `indexnow_request` e submete os caminhos ao IndexNow, que é o protocolo de
// submissão do índice da Microsoft (o mesmo que alimenta a busca do ChatGPT). Chamada interna pelo
// pg_cron via pg_net; o header x-indexnow-dispatch-key é validado contra o Vault por RPC, então o
// segredo nunca vira env desta Edge. verify_jwt = false (server-to-server).
// Ver docs/specs/indexnow.md.
//
// POST /functions/v1/indexnow  (header: x-indexnow-dispatch-key: <segredo do Vault>)
// → { ok, claimed, submitted, status }
//
// A fila guarda caminho e esta função monta a URL absoluta com o `sitePath()` do _shared, que é a
// única fonte do host no lado Deno. Por isso o POST mora aqui e não no pg_net do cron.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { siteUrl, sitePath } from "../_shared/site.ts";
import { INDEXNOW_ENDPOINT, INDEXNOW_KEY, INDEXNOW_MAX_URLS } from "../_shared/indexnow.ts";
import { hostDe, urlsDosCaminhos } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function env(k: string): string {
  // @ts-expect-error - Deno env
  return Deno.env.get(k) ?? "";
}

interface Pedido {
  id: string;
  path: string;
  dispatch_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  const chave = req.headers.get("x-indexnow-dispatch-key") ?? "";
  const { data: valida, error: erroChave } = await admin.rpc("indexnow_dispatch_key_valid", {
    p_key: chave,
  });
  if (erroChave) return json({ error: "Falha ao validar a chave." }, 500);
  if (!valida) return json({ error: "Chave inválida." }, 401);

  const { data: pedidos, error: erroClaim } = await admin.rpc("indexnow_claim", {
    p_limit: INDEXNOW_MAX_URLS,
  });
  if (erroClaim) return json({ error: erroClaim.message }, 500);

  const lote = (pedidos ?? []) as Pedido[];
  if (!lote.length) return json({ ok: true, claimed: 0, submitted: 0, status: null });

  const dispatchId = lote[0].dispatch_id;
  const urlList = urlsDosCaminhos(
    lote.map((p) => p.path),
    sitePath,
  );

  let status = 0;
  try {
    const resposta = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: hostDe(siteUrl()),
        key: INDEXNOW_KEY,
        keyLocation: sitePath(`${INDEXNOW_KEY}.txt`),
        urlList,
      }),
    });
    status = resposta.status;
  } catch {
    // Rede fora do ar devolve os pedidos para a fila pelo mesmo caminho de um 5xx.
    status = 599;
  }

  await admin.rpc("indexnow_settle", { p_dispatch_id: dispatchId, p_status_code: status });

  const ok = status >= 200 && status < 300;
  return json({ ok, claimed: lote.length, submitted: ok ? urlList.length : 0, status }, 200);
});
