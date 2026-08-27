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
// ## A identidade é montada AQUI, mesmo agora que o telefone é escolhido
//
// A Mia usa o telefone da conversa como prova de posse para consultar reserva (D43), e
// por isso o navegador nunca mandou `requestContext`. Desde 27/08 ele pode escolher o
// **telefone** e a **origem**, porque esta é a bancada de teste do time e testar o
// atendimento de um cliente real é justamente o que ela serve para fazer. O que mudou é
// só isso: o `requestContext` continua sendo MONTADO aqui, campo a campo, e o corpo é
// uma lista fechada. Mandar uma chave a mais não a coloca no contexto.
//
// Três guardas seguram o que isso abriu:
//
// 1. **Formato conferido** (`telefoneValido`). Número torto vira 400 aqui, e não uma
//    consulta estranha no sistema do parceiro.
// 2. **Origem em allowlist.** O white-label só conhece três valores; um valor livre faria
//    a reserva falhar lá dentro, longe de quem digitou.
// 3. **A thread NUNCA é a do WhatsApp de verdade.** Ela é `manager:<uid>:<telefone>`. Se
//    fosse o namespace real, a mensagem de teste do admin entraria na conversa daquele
//    cliente e o admin leria o histórico dele. Simular a IDENTIDADE para as tools é o
//    objetivo; entrar na conversa alheia não é.
//
// Quem digita um número que não é seu fica registrado no log da função (`[mia-chat]
// identidade`), com quem pediu e qual número.

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

/** Telefone que NÃO é de ninguém: o padrão, para quem só quer conversar com a Mia. */
const TELEFONE_DE_TESTE = "5500000000000";

/**
 * As origens que o white-label conhece. Valor fora daqui não falha nesta Edge: falha lá
 * na frente, ao fechar a reserva no parceiro, onde ninguém liga o erro à causa.
 *
 * `reserva-online` é o checkout do site, não um agente, e fica de fora da bancada de
 * propósito: a bolinha é para testar atendimento.
 */
const ORIGENS = ["webchat-bot", "whatsapp-bot"] as const;
export type Origem = (typeof ORIGENS)[number];

export function origemValida(v: unknown): v is Origem {
  return typeof v === "string" && (ORIGENS as readonly string[]).includes(v);
}

/**
 * Só os dígitos, e só se o formato fechar.
 *
 * Brasil com DDI: 55 + DDD (2) + 8 ou 9 dígitos, ou seja 12 ou 13 no total. O
 * `5500000000000` do padrão tem 13 e passa. Aceitar qualquer coisa mandaria lixo para a
 * consulta do parceiro e devolveria erro sem sentido para quem digitou.
 */
export function telefoneValido(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 12 || digitos.length > 13) return null;
  if (!digitos.startsWith("55")) return null;
  return digitos;
}

/**
 * A identidade que a bolinha usa, montada a partir de quem está logado.
 *
 * Exportada para o teste: são quatro invariantes que, se quebrarem, quebram em silêncio
 * e só aparecem como dado de cliente errado dentro do Backoffice.
 */
export function identidadeDeTeste(
  uid: string,
  nome: string | null,
  telefone: string = TELEFONE_DE_TESTE,
  origem: Origem = "webchat-bot",
) {
  return {
    requestContext: {
      // D43: o telefone da conversa é o que autoriza consultar reserva. Aqui ele é
      // escolhido de propósito, para simular o atendimento de um cliente de verdade.
      "movepark.customerPhone": telefone,
      "movepark.customerName": nome ?? "Backoffice (teste)",
      "movepark.origin": origem,
    },
    /**
     * A thread carrega o telefone, e **não** é o namespace do WhatsApp.
     *
     * Por usuário, para dois testadores não dividirem conversa; por telefone, para
     * simular dois clientes sem um contaminar o outro. O que ela nunca é: a thread real
     * daquele número. Reusar o namespace do WhatsApp faria a mensagem de teste entrar na
     * conversa do cliente, e daria ao admin o histórico dele de brinde.
     *
     * O prefixo `movepark-hub:` é o que o guarda de namespace do BeastBots exige.
     */
    memory: {
      resource: `movepark-hub:manager:${uid}:${telefone}`,
      thread: `movepark-hub:manager:${uid}:${telefone}:main`,
    },
  };
}

/** Uma fala já gravada, do jeito que a tela desenha. */
export type FalaGravada = { role: "user" | "model"; text: string };

/**
 * O histórico do Mastra, reduzido ao que a tela precisa.
 *
 * Exportada para ter teste, porque ela decide o que aparece na bancada e errar aqui
 * mostraria conversa pela metade sem nenhum erro visível.
 *
 * **Mensagem sem texto sai.** Uma chamada de tool grava uma mensagem de assistente cujas
 * partes são `tool-invocation`, sem nada legível: desenhá-la viraria um balão vazio no
 * meio da conversa. Quais tools foram chamadas continua aparecendo, mas só na resposta
 * do turno que está acontecendo, que é quando a informação serve para testar.
 */
export function falasDoHistorico(corpo: unknown): FalaGravada[] {
  const lista = (corpo as { messages?: unknown })?.messages;
  if (!Array.isArray(lista)) return [];

  return lista.flatMap((m): FalaGravada[] => {
    const bruto = m as { role?: unknown; content?: unknown };
    const role = bruto.role === "user" ? "user" : "model";

    const conteudo = bruto.content as
      | { content?: unknown; parts?: Array<{ type?: string; text?: unknown }> }
      | string
      | undefined;

    let texto = "";
    if (typeof conteudo === "string") {
      texto = conteudo;
    } else if (typeof conteudo?.content === "string") {
      texto = conteudo.content;
    } else if (Array.isArray(conteudo?.parts)) {
      texto = conteudo.parts
        .filter((p) => p?.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n");
    }

    texto = texto.trim();
    return texto ? [{ role, text: texto }] : [];
  });
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

  let corpo: { messages?: unknown; acao?: unknown; telefone?: unknown; origem?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  const uid = usuario.user.id;

  /**
   * Telefone e origem vêm do corpo, e é aqui que param de ser texto livre.
   *
   * Campo ausente cai no padrão, para quem só abriu a bolinha e quer conversar. Campo
   * presente e torto é 400: consultar o parceiro com lixo devolve um erro que não ajuda
   * ninguém, e o certo é dizer isso a quem digitou.
   */
  const telefone = corpo.telefone === undefined || corpo.telefone === ""
    ? TELEFONE_DE_TESTE
    : telefoneValido(corpo.telefone);
  if (!telefone) {
    return json({ error: "Telefone inválido. Use DDI 55 mais DDD e número, como 5541988149449." }, 400);
  }

  const origem = corpo.origem === undefined || corpo.origem === "" ? "webchat-bot" : corpo.origem;
  if (!origemValida(origem)) {
    return json({ error: `Origem inválida. Vale ${ORIGENS.join(" ou ")}.` }, 400);
  }

  /**
   * Rastro de quem simulou qual número.
   *
   * A bolinha alcança dado de cliente real (reserva, placa, voucher). Quem usou continua
   * sendo `hub_admin`, e a Movepark já tem essas credenciais, mas "a empresa pode" não é
   * o mesmo que "não precisa saber quem foi". Fica no log da função, que é o rastro
   * possível sem inventar tabela para uma ferramenta de teste.
   */
  if (telefone !== TELEFONE_DE_TESTE) {
    console.log(
      `[mia-chat] identidade simulada uid=${uid} email=${usuario.user.email ?? "?"} telefone=${telefone} origem=${origem}`,
    );
  }

  const { memory } = identidadeDeTeste(uid, null, telefone, origem);

  /**
   * Apagar a conversa de teste.
   *
   * A thread vem do `uid` mais o telefone simulado, e o `uid` nunca vem do corpo: assim
   * um admin só apaga conversa de teste DELE, seja qual for o número que simulou, e
   * nunca a de outro testador nem a de um cliente no WhatsApp.
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

  /**
   * Devolver a conversa que já existe, para a tela não parecer amnésica.
   *
   * A memória vive no servidor e sobrevive ao F5; a lista de mensagens da tela é estado
   * do navegador e não sobrevive. Sem isto, recarregar a página mostrava conversa vazia
   * enquanto a Mia continuava lembrando de tudo, e a bancada mentia sobre o próprio
   * estado, que é o pior defeito que uma ferramenta de teste pode ter.
   *
   * 404 é lista vazia: significa que aquele número ainda não tem conversa.
   */
  if (corpo.acao === "historico") {
    const alvo = `${base}/api/memory/threads/${encodeURIComponent(memory.thread)}/messages?agentId=movepark-hub`;
    try {
      const r = await fetch(alvo, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (r.status === 404) return json({ mensagens: [] });
      if (!r.ok) return json({ error: `Não consegui ler a conversa (${r.status}).` }, 502);
      return json({ mensagens: falasDoHistorico(await r.json()) });
    } catch (cause) {
      return json(
        { error: `Não consegui ler a conversa: ${cause instanceof Error ? cause.message : String(cause)}` },
        504,
      );
    }
  }

  const messages = Array.isArray(corpo.messages) ? corpo.messages : null;
  if (!messages?.length) return json({ error: "Mande ao menos uma mensagem." }, 400);

  let resposta: Response;
  try {
    // `/chat` e nao `/api/agents/.../generate`: e' a porta que intercepta comando de
    // canal (`/limpar`, `/comandos`) antes do agente. Chamando o `generate` direto, a
    // barra chegava ao modelo como texto e a bolinha ficava sem comando nenhum. A lista
    // de comandos mora no BeastBots, uma so' para todos os canais.
    resposta = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "movepark-hub",
        messages,
        ...identidadeDeTeste(uid, perfil?.full_name ?? null, telefone, origem),
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
