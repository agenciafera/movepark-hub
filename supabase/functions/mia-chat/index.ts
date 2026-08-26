// Edge Function: /mia-chat
// Ponte entre a bolinha de teste do Manager e a Mia, que roda no BeastBots.
//
// POST /functions/v1/mia-chat
// Authorization: Bearer <JWT hub_admin>
// { messages: [{ role: "user" | "assistant", content: string }] }
//
// ## Por que existe
//
// O `/api/*` do Mastra exige o `MASTRA_ADMIN_TOKEN`, que dá acesso total aos dois
// agentes. Esse segredo não pode viver num bundle servido a quem baixar o JS, então o
// navegador nunca fala com o BeastBots direto: fala aqui, e aqui confere o papel.
//
// ## Por que a identidade é montada AQUI, e não recebida
//
// A Mia usa o telefone da conversa como prova de posse para consultar reserva (D43). Se
// o navegador mandasse o `requestContext`, um admin poderia trocar o número e puxar a
// reserva de um cliente real, com placa e voucher, de dentro do Backoffice. O corpo
// aceito é só `messages`; telefone, nome e namespace de memória saem do JWT.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// @ts-expect-error - Deno global
const env = (k: string) => Deno.env.get(k) ?? "";

/** Telefone que NÃO é de ninguém: a Mia trata o número da conversa como prova de posse. */
const TELEFONE_DE_TESTE = "5500000000000";

/**
 * A identidade que a bolinha usa, montada a partir de quem está logado.
 *
 * Exportada para o teste: são quatro invariantes que, se quebrarem, quebram em silêncio
 * e só aparecem como dado de cliente errado dentro do Backoffice.
 */
export function identidadeDeTeste(uid: string, nome: string | null) {
  return {
    requestContext: {
      // D43: o telefone da conversa é o que autoriza consultar reserva. Um número real
      // aqui devolveria a reserva daquela pessoa, com placa e voucher.
      "movepark.customerPhone": TELEFONE_DE_TESTE,
      "movepark.customerName": nome ?? "Backoffice (teste)",
      // O white-label só conhece reserva-online, whatsapp-bot e webchat-bot, e não muda
      // do nosso lado. A bolinha fecha reserva de verdade, então valor fora dessa lista
      // faria a reserva falhar no parceiro em vez de falhar aqui.
      "movepark.origin": "webchat-bot",
    },
    // Por usuário, para dois testadores não dividirem a mesma conversa. O prefixo
    // `movepark-hub:` é o que o guarda de namespace do BeastBots exige.
    memory: {
      resource: `movepark-hub:manager:${uid}`,
      thread: `movepark-hub:manager:${uid}:main`,
    },
  };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Faltou o token de sessão." }, 401);

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { data: usuario, error: erroAuth } = await admin.auth.getUser(jwt);
  if (erroAuth || !usuario?.user) return json({ error: "Sessão inválida." }, 401);

  const { data: perfil } = await admin
    .from("profiles")
    .select("role, full_name")
    .eq("id", usuario.user.id)
    .maybeSingle();

  if (perfil?.role !== "hub_admin") return json({ error: "Acesso restrito." }, 403);

  const base = env("MASTRA_BASE_URL").replace(/\/+$/, "");
  const token = env("MASTRA_ADMIN_TOKEN");
  if (!base || !token) {
    return json({ error: "Mia não configurada: faltam MASTRA_BASE_URL ou MASTRA_ADMIN_TOKEN." }, 503);
  }

  let corpo: { messages?: unknown; acao?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  const uid = usuario.user.id;
  const { memory } = identidadeDeTeste(uid, null);

  /**
   * Apagar a conversa de teste.
   *
   * A thread vem do `uid`, nunca do corpo: assim um admin só consegue apagar a PRÓPRIA
   * conversa de teste, e não a de outro testador nem a de um cliente.
   *
   * 404 é sucesso aqui. Significa que já não havia nada, que é exatamente o estado que
   * quem clicou pediu.
   */
  if (corpo.acao === "limpar") {
    const alvo = `${base}/api/memory/threads/${encodeURIComponent(memory.thread)}?agentId=movepark-hub`;
    try {
      const r = await fetch(alvo, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok && r.status !== 404) {
        return json({ error: `Não consegui limpar (${r.status}).` }, 502);
      }
      return json({ limpo: true });
    } catch (cause) {
      return json(
        { error: `Não consegui limpar: ${cause instanceof Error ? cause.message : String(cause)}` },
        504,
      );
    }
  }

  const messages = Array.isArray(corpo.messages) ? corpo.messages : null;
  if (!messages?.length) return json({ error: "Mande ao menos uma mensagem." }, 400);

  let resposta: Response;
  try {
    resposta = await fetch(`${base}/api/agents/movepark-hub/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        ...identidadeDeTeste(uid, perfil?.full_name ?? null),
      }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch (cause) {
    return json(
      { error: `A Mia não respondeu: ${cause instanceof Error ? cause.message : String(cause)}` },
      504,
    );
  }

  const texto = await resposta.text();
  if (!resposta.ok) {
    // O corpo do Mastra pode conter detalhe interno; devolvemos o status e um recorte.
    return json({ error: `A Mia respondeu ${resposta.status}.`, detalhe: texto.slice(0, 300) }, 502);
  }

  return new Response(texto, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
if (import.meta.main) Deno.serve(handler);
