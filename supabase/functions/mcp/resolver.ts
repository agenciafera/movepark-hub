// MCP — resolução de credencial em perfil.
//
// Função pura, com o lookup de chave injetado, para a matriz em
// `resolver.test.ts` rodar sem rede. Ela existe porque a autorização estava
// espalhada em condicionais dentro do `Deno.serve`, sem um único teste, e porque
// a fase 5 vai fazer a credencial escolher o perfil quando não houver path. No
// dia em que isso acontecer, esta função é a fronteira inteira.
//
// Três regras que ela codifica, e que antes não existiam em lugar nenhum:
//
//  1. `Authorization` é sempre o SUJEITO (quem age). `X-API-Key` é sempre o
//     AGENTE (por qual programa). Nunca se trocam.
//  2. Só é chave de API o que começa com `mp_`. Nada mais chega ao banco:
//     `keyPrefix` são 16 caracteres, e todo JWT HS256 do Supabase começa com a
//     mesma constante, então mandar JWT ao `api_key_verify` faria dele um
//     oráculo de prefixo válido, além de uma consulta por request anônima.
//  3. Credencial recusada responde igual, seja ela inexistente, revogada ou
//     expirada. O motivo existe, mas para o log.
//
// A superfície vem do path. A credencial confirma que ela pode ser aquela, e
// nunca promove: chave de empresa não abre o Manager, chave da Movepark não abre
// o parceiro. São duas fontes independentes, e é essa independência que segura o
// dia em que uma delas estiver errada.

export type Perfil = "public" | "partner" | "customer" | "manager" | "operator" | "marketing";

/**
 * `"raiz"` é o path sem superfície declarada, e é o que torna a URL única
 * possível: ali quem escolhe o perfil é a credencial. Nos outros, a superfície
 * está declarada e a credencial só confirma.
 */
export type Superficie = Perfil | "raiz";

/** O que `api_key_verify` devolve. */
export interface ChaveVerificada {
  ok: boolean;
  reason?: string;
  api_key_id?: string;
  company_id?: string | null;
  scopes?: string[];
  environment?: string;
}

export type Verificacao = (chave: string) => Promise<ChaveVerificada>;

/** O que `operator_assist_resolve` devolve para um token `mpo_`. */
export interface AssistenteVerificado {
  ok: boolean;
  reason?: string;
  profile_id?: string;
  company_id?: string;
  role?: string;
  scopes?: string[];
  user_name?: string | null;
  company_name?: string | null;
}

export type VerificacaoAssistente = (token: string) => Promise<AssistenteVerificado>;

/** O escopo que a chave do agente precisa ter para usar a superfície /operator. */
export const ESCOPO_ASSISTENTE = "operator:assist";

/** O que `marketing_assist_resolve` devolve para um token `mpm_`. */
export interface AssistenteMarketingVerificado {
  ok: boolean;
  reason?: string;
  profile_id?: string;
  conversa_id?: string;
  email?: string | null;
  user_name?: string | null;
}

export type VerificacaoAssistenteMarketing = (token: string) => Promise<AssistenteMarketingVerificado>;

/** O escopo que a chave do agente precisa ter para usar a superfície /marketing. */
export const ESCOPO_ASSISTENTE_MARKETING = "marketing:assist";

/** O que o agente de marketing pode fazer: ler e gravar. Disparo, nunca (vira proposta). */
export const ESCOPOS_DO_ASSISTENTE_MARKETING = ["marketing:assist", "marketing:read", "marketing:write"];

export interface Entrada {
  path: string;
  authorization: string | null;
  xApiKey: string | null;
  verificar: Verificacao;
  /** Só a superfície /operator usa. Ausente, ela recusa tudo. */
  verificarAssistente?: VerificacaoAssistente;
  /** Só a superfície /marketing usa. Ausente, ela recusa tudo. */
  verificarAssistenteMarketing?: VerificacaoAssistenteMarketing;
}

export interface Resolucao {
  perfil: Perfil;
  /** 200 segue, 400 pede correção do cliente, 401 recusa, 404 path inexistente. */
  status: 200 | 400 | 401 | 404;
  escopos: string[];
  companyId: string | null;
  apiKeyId: string | null;
  environment: string | null;
  /** Só no /operator: o operador em nome de quem o agente age. */
  actingUserId: string | null;
  /** Só no /operator: o papel dele na empresa (ou `hub_admin`). */
  papel: string | null;
  /** Só no /marketing: a conversa presa ao token do turno. */
  conversaId: string | null;
  /** Só no /marketing: o nome do admin na auditoria. */
  actingLabel: string | null;
  /** Para o log, nunca para a resposta. */
  motivo: string;
}

const PREFIXO_CHAVE = "mp_";
/**
 * Token do assistente do operador. Não começa com `mp_` de propósito: ele nunca
 * pode chegar ao `api_key_verify`, e uma chave de API nunca pode ser lida como ele.
 */
const PREFIXO_ASSISTENTE = "mpo_";
/** Token do assistente da Automação. Mesmo raciocínio do `mpo_`: nunca chega ao api_key_verify. */
const PREFIXO_ASSISTENTE_MARKETING = "mpm_";

const VAZIO: Omit<Resolucao, "perfil" | "status" | "motivo"> = {
  escopos: [],
  companyId: null,
  apiKeyId: null,
  environment: null,
  actingUserId: null,
  papel: null,
  conversaId: null,
  actingLabel: null,
};

/**
 * Superfície declarada no path. `null` quando o path não é superfície.
 *
 * O mesmo servidor é alcançado por dois caminhos: `/partner` pelo worker, e
 * `/functions/v1/mcp/partner` direto no Supabase (a Edge `chat` usa esse). O
 * sufixo depois de `mcp` é o que vale, e o resto é prefixo de hospedagem.
 */
export function superficieDoPath(path: string): Superficie | null {
  let p = path.replace(/\/+$/, "");
  const i = p.lastIndexOf("/mcp");
  if (i !== -1) p = p.slice(i + 4);
  // Raiz e `/public` não são a mesma coisa: a raiz aceita ser qualquer perfil,
  // conforme a credencial; `/public` é uma escolha explícita de ficar anônimo.
  if (p === "" || p === "/") return "raiz";
  if (p === "/public") return "public";
  if (p === "/partner") return "partner";
  if (p === "/customer") return "customer";
  if (p === "/manager") return "manager";
  if (p === "/operator") return "operator";
  if (p === "/marketing") return "marketing";
  return null;
}

/**
 * O valor de `Authorization`, classificado.
 *
 * `Bearer ` vazio, `Bearer null` e lixo não são credencial: eles aparecem quando
 * um cliente MCP injeta o próprio OAuth por engano, e tratá-los como credencial
 * ruim quebraria a descoberta pública, que hoje funciona ignorando o header.
 */
export function classificarSujeito(
  authorization: string | null,
):
  | { tipo: "ausente" }
  | { tipo: "chave"; valor: string }
  | { tipo: "jwt"; valor: string }
  | { tipo: "assistente"; valor: string }
  | { tipo: "assistente_marketing"; valor: string } {
  const bruto = (authorization ?? "").trim();
  if (!bruto.toLowerCase().startsWith("bearer ")) return { tipo: "ausente" };

  const valor = bruto.slice(7).trim();
  if (!valor || valor === "null" || valor === "undefined") return { tipo: "ausente" };
  if (valor.startsWith(PREFIXO_CHAVE)) return { tipo: "chave", valor };
  if (valor.startsWith(PREFIXO_ASSISTENTE)) return { tipo: "assistente", valor };
  if (valor.startsWith(PREFIXO_ASSISTENTE_MARKETING)) return { tipo: "assistente_marketing", valor };
  // Um JWT tem três partes separadas por ponto. O resolvedor não valida a
  // assinatura: quem valida é o GoTrue, no handler que usa a sessão.
  if (valor.split(".").length === 3) return { tipo: "jwt", valor };
  return { tipo: "ausente" };
}

export async function resolverPerfil(e: Entrada): Promise<Resolucao> {
  const superficie = superficieDoPath(e.path);
  if (superficie === null) {
    return { perfil: "public", status: 404, motivo: "path_desconhecido", ...VAZIO };
  }
  const naRaiz = superficie === "raiz";

  const sujeito = classificarSujeito(e.authorization);
  const agenteBruto = (e.xApiKey ?? "").trim();
  const agente = agenteBruto.startsWith(PREFIXO_CHAVE) ? agenteBruto : null;

  // Duas chaves de API, uma em cada header, é ambiguidade de identidade. Escolher
  // uma em silêncio foi o que gerava 401 sem explicação.
  if (sujeito.tipo === "chave" && agente) {
    return { perfil: "public", status: 400, motivo: "credencial_ambigua", ...VAZIO };
  }

  // ── Superfície do assistente do operador ─────────────────────────────────
  // Exige as DUAS credenciais: o token `mpo_` (o operador naquela empresa) e a
  // chave da Movepark com `operator:assist` (o programa que age por ele). Uma
  // sem a outra não serve: o token sozinho seria um atalho para quem o pegasse
  // num log, e a chave sozinha seria um agente agindo por ninguém.
  if (sujeito.tipo === "assistente" || superficie === "operator") {
    if (superficie !== "operator") {
      return { perfil: "public", status: 401, motivo: `assistente_fora_da_superficie_${superficie}`, ...VAZIO };
    }
    if (sujeito.tipo !== "assistente") {
      return { perfil: "public", status: 401, motivo: "credencial_ausente", ...VAZIO };
    }
    if (!agente) {
      return { perfil: "public", status: 401, motivo: "agente_ausente", ...VAZIO };
    }
    const k = await e.verificar(agente);
    if (!k.ok || k.company_id != null || !(k.scopes ?? []).includes(ESCOPO_ASSISTENTE)) {
      return { perfil: "public", status: 401, motivo: "agente_sem_operator_assist", ...VAZIO };
    }
    if (!e.verificarAssistente) {
      return { perfil: "public", status: 401, motivo: "assistente_sem_verificador", ...VAZIO };
    }
    const t = await e.verificarAssistente(sujeito.valor);
    if (!t.ok || !t.company_id || !t.profile_id) {
      return { perfil: "public", status: 401, motivo: `assistente_${t.reason ?? "invalido"}`, ...VAZIO };
    }
    const escopos = new Set(t.scopes ?? []);
    escopos.add(ESCOPO_ASSISTENTE);
    return {
      perfil: "operator",
      status: 200,
      escopos: [...escopos].sort(),
      companyId: t.company_id,
      apiKeyId: k.api_key_id ?? null,
      environment: k.environment ?? null,
      actingUserId: t.profile_id,
      papel: t.role ?? null,
      conversaId: null,
      actingLabel: null,
      motivo: "ok",
    };
  }

  // ── Superfície do assistente da Automação ────────────────────────────────
  // As DUAS credenciais, como no /operator: o token `mpm_` (o admin naquela conversa) e a chave
  // da Movepark com `marketing:assist` (o agente do beast-bots). O escopo é fixo e não inclui
  // `marketing:dispatch`: na superfície, disparo só cria proposta.
  if (sujeito.tipo === "assistente_marketing" || superficie === "marketing") {
    if (superficie !== "marketing") {
      return { perfil: "public", status: 401, motivo: `assistente_marketing_fora_da_superficie_${superficie}`, ...VAZIO };
    }
    if (sujeito.tipo !== "assistente_marketing") {
      return { perfil: "public", status: 401, motivo: "credencial_ausente", ...VAZIO };
    }
    if (!agente) {
      return { perfil: "public", status: 401, motivo: "agente_ausente", ...VAZIO };
    }
    const k = await e.verificar(agente);
    if (!k.ok || k.company_id != null || !(k.scopes ?? []).includes(ESCOPO_ASSISTENTE_MARKETING)) {
      return { perfil: "public", status: 401, motivo: "agente_sem_marketing_assist", ...VAZIO };
    }
    if (!e.verificarAssistenteMarketing) {
      return { perfil: "public", status: 401, motivo: "assistente_marketing_sem_verificador", ...VAZIO };
    }
    const t = await e.verificarAssistenteMarketing(sujeito.valor);
    if (!t.ok || !t.profile_id || !t.conversa_id) {
      return { perfil: "public", status: 401, motivo: `assistente_marketing_${t.reason ?? "invalido"}`, ...VAZIO };
    }
    return {
      perfil: "marketing",
      status: 200,
      escopos: [...ESCOPOS_DO_ASSISTENTE_MARKETING],
      companyId: null,
      apiKeyId: k.api_key_id ?? null,
      environment: k.environment ?? null,
      actingUserId: t.profile_id,
      papel: "hub_admin",
      conversaId: t.conversa_id,
      actingLabel: `${t.email ?? t.user_name ?? "hub_admin"} (assistente)`,
      motivo: "ok",
    };
  }

  // ── Sujeito é chave de API: parceiro ou Manager ──────────────────────────
  if (sujeito.tipo === "chave") {
    const v = await e.verificar(sujeito.valor);
    if (!v.ok) {
      return { perfil: "public", status: 401, motivo: `chave_${v.reason ?? "invalida"}`, ...VAZIO };
    }

    const daPlataforma = v.company_id == null;
    const alvo: Perfil = daPlataforma ? "manager" : "partner";

    // Na raiz, a credencial escolhe. Num path declarado, ela apenas confirma, e
    // nunca promove nem desvia: chave de empresa no /manager e chave da Movepark
    // no /partner recusam com a MESMA resposta de chave inválida, sem revelar
    // qual dos dois errou.
    //
    // A diferença importa: no path declarado sobram DUAS fontes independentes, o
    // que o cliente disse e o que o banco devolveu. É essa independência que
    // segura o dia em que uma delas estiver errada, e é por isso que o path
    // explícito continua existindo depois da URL única.
    if (!naRaiz && superficie !== alvo) {
      return { perfil: "public", status: 401, motivo: `chave_fora_da_superficie_${superficie}`, ...VAZIO };
    }

    return {
      perfil: alvo,
      status: 200,
      escopos: v.scopes ?? [],
      companyId: v.company_id ?? null,
      apiKeyId: v.api_key_id ?? null,
      environment: v.environment ?? null,
      actingUserId: null,
      papel: null,
      conversaId: null,
      actingLabel: null,
      motivo: "ok",
    };
  }

  // ── Sujeito é JWT, ou não há sujeito ─────────────────────────────────────
  // As superfícies de chave exigem chave, inclusive para `tools/list`: sem ela
  // não se descobre o que existe. Na raiz não há o que exigir, porque ninguém
  // pediu essas superfícies.
  if (superficie === "partner" || superficie === "manager") {
    return { perfil: "public", status: 401, motivo: "credencial_ausente", ...VAZIO };
  }

  // Na raiz: JWT de usuário abre o consumidor autenticado, e ausência de
  // credencial fica no consumidor anônimo. É o que mantém o `server-card.json`
  // honesto, porque ele descreve a raiz para quem chega sem nada.
  const perfilDaRaiz: Perfil = naRaiz
    ? (sujeito.tipo === "jwt" ? "customer" : "public")
    : (superficie as Perfil);

  // O agente é opcional e só carrega escopo. Chave ruim degrada em silêncio,
  // porque mandar errado vale tanto quanto não mandar. O que ele nunca faz é
  // credenciar alguém.
  let escopos: string[] = [];
  let apiKeyId: string | null = null;
  if (agente) {
    const v = await e.verificar(agente);
    // Agente confiável é chave da Movepark. Chave de empresa não vira agente,
    // mesmo que um dia carregue o escopo: é a segunda porta do `checkout:link`,
    // que hoje depende só de uma flag do catálogo.
    if (v.ok && v.company_id == null) {
      escopos = v.scopes ?? [];
      apiKeyId = v.api_key_id ?? null;
    }
  }

  return {
    perfil: perfilDaRaiz,
    status: 200,
    escopos,
    companyId: null,
    apiKeyId,
    environment: null,
    actingUserId: null,
    papel: null,
    conversaId: null,
    actingLabel: null,
    motivo: sujeito.tipo === "jwt" ? "sujeito_jwt" : "anonimo",
  };
}
