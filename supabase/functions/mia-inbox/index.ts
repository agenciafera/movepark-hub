// Edge Function: /mia-inbox
// Caixa de entrada das conversas da Mia, para o Manager.
//
// POST /functions/v1/mia-inbox
// Authorization: Bearer <JWT hub_admin>
// { acao: "listar" | "abrir" | "marcar" | "assumir" | "devolver" | "responder", ... }
//
// ## Por que existe
//
// As conversas moram no Postgres do BeastBots, que é OUTRO projeto Supabase. O front do
// Manager não alcança aquele banco, e o `/inbox` de lá exige o `MASTRA_ADMIN_TOKEN`, que
// dá acesso total aos dois agentes e não pode viver num bundle servido ao navegador.
// Então o navegador fala aqui, e aqui confere o papel.
//
// ## O que o navegador NÃO manda
//
// Quem assumiu a conversa. Esse campo sai do JWT, sempre. Aceitá-lo do corpo deixaria um
// admin assumir em nome de outro, e o registro de quem estava atendendo é justamente o
// que dá sentido a "assumida por".

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

/** O agente cujas conversas a caixa de entrada mostra. Só a Mia, por decisão. */
const AGENT_ID = "movepark-hub";

/**
 * As ações que a Edge repassa, numa lista fechada.
 *
 * Lista, e não "repassa o que vier": o `/inbox` do BeastBots é chamado com o token de
 * admin, então tudo que passar por aqui roda com poder total. Ação nova entra aqui de
 * propósito, não por acidente.
 */
const ACOES = [
  "listar",
  "abrir",
  "marcar",
  "assumir",
  "devolver",
  "responder",
  "anexo",
  "compartilhar",
  "descompartilhar",
] as const;
export type AcaoDaCaixa = (typeof ACOES)[number];

export function acaoValida(v: unknown): v is AcaoDaCaixa {
  return typeof v === "string" && (ACOES as readonly string[]).includes(v);
}

/**
 * O corpo que vai ao BeastBots, montado campo a campo.
 *
 * Nunca é o corpo do navegador repassado inteiro: `assumidaPor` sai do JWT, e um campo
 * a mais vindo do cliente não entra por não estar aqui.
 */
export function corpoParaOBeastBots(
  acao: AcaoDaCaixa,
  uid: string,
  nome: string,
  entrada: {
    threadId?: unknown;
    lidaAte?: unknown;
    limite?: unknown;
    busca?: unknown;
    cursor?: unknown;
    texto?: unknown;
    messageId?: unknown;
    parte?: unknown;
  },
): Record<string, unknown> {
  const base: Record<string, unknown> = { acao, agentId: AGENT_ID };

  if (acao === "listar") {
    if (typeof entrada.limite === "number") base.limite = entrada.limite;
    // Busca e cursor precisam ATRAVESSAR o portao. Este corpo e' montado campo a
    // campo de proposito (nada do cliente passa direto), e o preco disso e' que um
    // campo esquecido some em silencio: a lista continua respondendo 200, so' que
    // sempre com a primeira pagina inteira, sem filtro.
    if (typeof entrada.busca === "string") base.busca = entrada.busca.slice(0, 120);
    if (typeof entrada.cursor === "string") base.cursor = entrada.cursor;
    return base;
  }

  base.threadId = typeof entrada.threadId === "string" ? entrada.threadId : "";

  if (acao === "marcar") base.lidaAte = entrada.lidaAte === null ? null : entrada.lidaAte;
  if (acao === "assumir") base.assumidaPor = uid;
  if (acao === "responder") {
    base.texto = typeof entrada.texto === "string" ? entrada.texto : "";
    base.assumidaPor = uid;
    /*
      O NOME de quem escreveu, e não só o uid.

      A tela tem dois lados direitos: a Mia e a equipe. Sem nome eles se confundem, e
      quem abre a conversa amanhã não sabe se aquela frase foi o robô ou um colega. O
      nome vem do perfil, nunca do corpo: senão qualquer admin assina como outro.
    */
    base.assumidaPorNome = nome;
  }
  if (acao === "anexo") {
    base.messageId = typeof entrada.messageId === "string" ? entrada.messageId : "";
    base.parte = Number(entrada.parte ?? -1);
  }
  return base;
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
    .select("role, full_name, first_name")
    .eq("id", usuario.user.id)
    .maybeSingle();

  // Só o super admin. A caixa de entrada não tem noção de empresa: quem entra lê a
  // conversa de todo cliente, com telefone e reserva.
  if (perfil?.role !== "hub_admin") return json({ error: "Acesso restrito." }, 403);

  const base = env("MASTRA_BASE_URL").replace(/\/+$/, "");
  const token = env("MASTRA_ADMIN_TOKEN");
  if (!base || !token) {
    return json({ error: "Caixa de entrada não configurada: faltam MASTRA_BASE_URL ou MASTRA_ADMIN_TOKEN." }, 503);
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  if (!acaoValida(corpo.acao)) {
    return json({ error: `Ação inválida. Vale ${ACOES.join(", ")}.` }, 400);
  }

  const nome = String(perfil?.full_name || perfil?.first_name || "").trim();
  const enviar = corpoParaOBeastBots(corpo.acao, usuario.user.id, nome, corpo);

  if (corpo.acao !== "listar" && !enviar.threadId) {
    return json({ error: "Faltou a conversa." }, 400);
  }
  if (corpo.acao === "responder" && !String(enviar.texto ?? "").trim()) {
    return json({ error: "Escreva a mensagem antes de enviar." }, 400);
  }

  // Quem escreve para o cliente ou assume a conversa fica registrado. A caixa alcança
  // dado de cliente real, e "a empresa pode" não é o mesmo que "não precisa saber quem foi".
  if (
    corpo.acao === "assumir" ||
    corpo.acao === "devolver" ||
    corpo.acao === "responder" ||
    corpo.acao === "compartilhar" ||
    corpo.acao === "descompartilhar"
  ) {
    console.log(
      `[mia-inbox] ${corpo.acao} uid=${usuario.user.id} email=${usuario.user.email ?? "?"} thread=${String(enviar.threadId)}`,
    );
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${base}/inbox`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(enviar),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (cause) {
    return json(
      { error: `A caixa de entrada não respondeu: ${cause instanceof Error ? cause.message : String(cause)}` },
      504,
    );
  }

  const texto = await resposta.text();
  if (!resposta.ok) {
    // O corpo do upstream pode carregar detalhe interno; devolvemos status e um recorte.
    return json({ error: `A caixa de entrada respondeu ${resposta.status}.`, detalhe: texto.slice(0, 300) }, 502);
  }

  return new Response(texto, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
if (import.meta.main) Deno.serve(handler);
