// Lógica pura de contract-pdf (testável sem rede): gates de acesso, validação do pedido,
// prova do aceite e o wrap de texto que o gerador de PDF usa.

/** Recusa: status HTTP + mensagem devolvida ao cliente. */
export interface ContractDenial {
  status: number;
  error: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exige JWT no header (membro da empresa ou hub_admin). */
export function checkContractAuth(authHeader: string | null): ContractDenial | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return { status: 401, error: "Autenticação necessária" };
  }
  return null;
}

/** O corpo precisa trazer o id da empresa (uuid). */
export function parseContractInput(
  body: unknown,
): { input: { company_id: string } | null; error?: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = typeof b.company_id === "string" ? b.company_id.trim() : "";
  if (!id) return { input: null, error: "company_id é obrigatório" };
  if (!UUID_RE.test(id)) return { input: null, error: "company_id inválido" };
  return { input: { company_id: id } };
}

/**
 * Quem pode baixar: hub_admin ou membro da empresa (qualquer papel). O aceite é só do dono, mas
 * a prova do que a empresa assinou interessa a quem trabalha nela.
 */
export function checkContractAccess(caller: {
  role: string | null | undefined;
  isMember: boolean;
}): ContractDenial | null {
  if (caller.role === "hub_admin" || caller.isMember) return null;
  return { status: 403, error: "Sem acesso a esta empresa" };
}

export interface ContractCompanyRow {
  contract_accepted_at: string | null;
  contract_version: string | null;
  contract_sha256: string | null;
}

export interface ContractVersionRow {
  version: string;
  sha256: string;
  body: string;
}

/**
 * Só existe PDF de contrato ACEITO, e o hash gravado na empresa tem que bater com o da versão:
 * se não bate, a prova não prova nada e o servidor recusa em vez de emitir um documento falso.
 * Aceite anterior a 27/09/2026 sem hash (backfill não alcançou) também cai no 409.
 */
export function checkContractProof(
  company: ContractCompanyRow | null,
  version: ContractVersionRow | null,
): ContractDenial | null {
  if (!company) return { status: 404, error: "Empresa não encontrada" };
  if (!company.contract_accepted_at || !company.contract_version) {
    return { status: 409, error: "Contrato ainda não foi aceito" };
  }
  if (!version) return { status: 409, error: "Versão aceita não existe mais no catálogo" };
  if (!company.contract_sha256 || company.contract_sha256 !== version.sha256) {
    return { status: 409, error: "Prova do aceite não bate com o texto da versão" };
  }
  return null;
}

/** Nome do arquivo: um por versão, sem espaço. */
export function contractPdfFilename(version: string): string {
  const safe = version.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  return `contrato-parceria-movepark-${safe}.pdf`;
}

/**
 * Quebra um parágrafo em linhas que cabem na largura, por palavra. `fits` é a medida real da
 * fonte (injetada para o teste não depender do pdf-lib). Palavra maior que a linha sai sozinha
 * na linha dela, sem cortar no meio.
 */
export function wrapParagraph(text: string, fits: (s: string) => boolean): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (fits(candidate)) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}
