// Edge Function: /conversa-publica
// Leitura de uma conversa compartilhada por link, SEM sessão.
//
// POST /functions/v1/conversa-publica
// { token: "<64 hex>" }
//
// ## Por que existe uma porta sem sessão
//
// O link é para mandar a alguém de fora do painel analisar uma conversa. Essa pessoa não
// tem conta, e criar uma para ela seria pedir cadastro para ler uma página.
//
// ## O que segura, já que não há login
//
// O token, e só ele. São 64 caracteres sorteados no servidor (dois UUID v4), nunca
// derivados do id da conversa: derivar faria um link vazado revelar o padrão dos outros.
// Quem para de compartilhar apaga o token, e o link morre no mesmo instante.
//
// O telefone do cliente sai MASCARADO (só os quatro últimos). O link serve para alguém
// ler a conversa, e para isso o número inteiro não é necessário.

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

/**
 * O token tem forma fixa: 64 caracteres hexadecimais.
 *
 * Conferir aqui evita mandar lixo ao upstream e, principalmente, evita que um token
 * gigante ou com caractere estranho vire consulta. É lista fechada de formato, não
 * confiança no que chega.
 */
export function tokenValido(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  let corpo: { token?: unknown; messageId?: unknown; parte?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  if (!tokenValido(corpo.token)) return json({ error: "Link inválido." }, 400);

  const base = env("MASTRA_BASE_URL").replace(/\/+$/, "");
  const token = env("MASTRA_ADMIN_TOKEN");
  if (!base || !token) return json({ error: "Leitura não configurada." }, 503);

  let resposta: Response;
  try {
    resposta = await fetch(`${base}/inbox`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // `publica` é o único verbo que esta Edge alcança. Um verbo a mais aqui seria uma
      // porta sem sessão para a caixa de entrada inteira.
      body: JSON.stringify({
        acao: "publica",
        agentId: "movepark-hub",
        token: corpo.token,
        // Presentes, pedem UM anexo daquela mesma conversa; ausentes, pedem a conversa.
        ...(typeof corpo.messageId === "string" && corpo.messageId
          ? { messageId: corpo.messageId, parte: Number(corpo.parte ?? -1) }
          : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return json({ error: "Não consegui carregar a conversa." }, 504);
  }

  const texto = await resposta.text();
  if (!resposta.ok) {
    // Sem detalhe do upstream: quem lê aqui não é do time, e mensagem interna vira pista.
    return json({ error: "Este link não está mais válido." }, resposta.status === 404 ? 404 : 502);
  }

  return new Response(texto, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
if (import.meta.main) Deno.serve(handler);
