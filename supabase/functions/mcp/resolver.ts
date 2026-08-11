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

export type Perfil = "public" | "partner" | "customer" | "manager";

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

export interface Entrada {
  path: string;
  authorization: string | null;
  xApiKey: string | null;
  verificar: Verificacao;
}

export interface Resolucao {
  perfil: Perfil;
  /** 200 segue, 400 pede correção do cliente, 401 recusa, 404 path inexistente. */
  status: 200 | 400 | 401 | 404;
  escopos: string[];
  companyId: string | null;
  apiKeyId: string | null;
  environment: string | null;
  /** Para o log, nunca para a resposta. */
  motivo: string;
}

const PREFIXO_CHAVE = "mp_";

const VAZIO: Omit<Resolucao, "perfil" | "status" | "motivo"> = {
  escopos: [],
  companyId: null,
  apiKeyId: null,
  environment: null,
};

/**
 * Superfície declarada no path. `null` quando o path não é superfície.
 *
 * O mesmo servidor é alcançado por dois caminhos: `/partner` pelo worker, e
 * `/functions/v1/mcp/partner` direto no Supabase (a Edge `chat` usa esse). O
 * sufixo depois de `mcp` é o que vale, e o resto é prefixo de hospedagem.
 */
export function superficieDoPath(path: string): Perfil | null {
  let p = path.replace(/\/+$/, "");
  const i = p.lastIndexOf("/mcp");
  if (i !== -1) p = p.slice(i + 4);
  if (p === "" || p === "/" || p === "/public") return "public";
  if (p === "/partner") return "partner";
  if (p === "/customer") return "customer";
  if (p === "/manager") return "manager";
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
): { tipo: "ausente" } | { tipo: "chave"; valor: string } | { tipo: "jwt"; valor: string } {
  const bruto = (authorization ?? "").trim();
  if (!bruto.toLowerCase().startsWith("bearer ")) return { tipo: "ausente" };

  const valor = bruto.slice(7).trim();
  if (!valor || valor === "null" || valor === "undefined") return { tipo: "ausente" };
  if (valor.startsWith(PREFIXO_CHAVE)) return { tipo: "chave", valor };
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

  const sujeito = classificarSujeito(e.authorization);
  const agenteBruto = (e.xApiKey ?? "").trim();
  const agente = agenteBruto.startsWith(PREFIXO_CHAVE) ? agenteBruto : null;

  // Duas chaves de API, uma em cada header, é ambiguidade de identidade. Escolher
  // uma em silêncio foi o que gerava 401 sem explicação.
  if (sujeito.tipo === "chave" && agente) {
    return { perfil: "public", status: 400, motivo: "credencial_ambigua", ...VAZIO };
  }

  // ── Sujeito é chave de API: parceiro ou Manager ──────────────────────────
  if (sujeito.tipo === "chave") {
    const v = await e.verificar(sujeito.valor);
    if (!v.ok) {
      return { perfil: "public", status: 401, motivo: `chave_${v.reason ?? "invalida"}`, ...VAZIO };
    }

    const daPlataforma = v.company_id == null;
    const alvo: Perfil = daPlataforma ? "manager" : "partner";

    // A credencial confirma a superfície declarada; nunca promove nem desvia.
    // Chave de empresa no /manager e chave da Movepark no /partner recusam com a
    // MESMA resposta de chave inválida: quem tentou não descobre qual dos dois
    // errou.
    if (superficie !== alvo) {
      return { perfil: "public", status: 401, motivo: `chave_fora_da_superficie_${superficie}`, ...VAZIO };
    }

    return {
      perfil: alvo,
      status: 200,
      escopos: v.scopes ?? [],
      companyId: v.company_id ?? null,
      apiKeyId: v.api_key_id ?? null,
      environment: v.environment ?? null,
      motivo: "ok",
    };
  }

  // ── Sujeito é JWT, ou não há sujeito ─────────────────────────────────────
  // As superfícies de chave exigem chave, inclusive para `tools/list`: sem ela
  // não se descobre o que existe.
  if (superficie === "partner" || superficie === "manager") {
    return { perfil: "public", status: 401, motivo: "credencial_ausente", ...VAZIO };
  }

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
    perfil: superficie,
    status: 200,
    escopos,
    companyId: null,
    apiKeyId,
    environment: null,
    motivo: sujeito.tipo === "jwt" ? "sujeito_jwt" : "anonimo",
  };
}
