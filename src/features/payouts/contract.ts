// Contrato de parceria Movepark <-> estacionamento.
//
// O TEXTO do contrato mora no banco (`partner_contract_version`, lido por `partner_contract_current()`
// via `useContractCurrent`), e o aceite grava a prova em `company` (versão, sha256 do texto, quem,
// quando, IP) pela RPC `operator_accept_contract`. Este arquivo não guarda mais uma cópia do texto:
// tinha duas fontes (front e banco) e ninguém conseguia provar qual delas foi aceita.
// Aqui ficam o resumo em tópicos da tela e os formatadores de download (.txt no cliente; o PDF
// sai da Edge `contract-pdf`).

/** Resumo em tópicos, mostrado na tela de assinatura acima do texto completo. */
export const CONTRACT_SUMMARY: string[] = [
  "A Movepark divulga seu estacionamento, recebe as reservas e o pagamento dos clientes.",
  "Você recebe o valor das reservas, menos a comissão da Movepark, no repasse combinado.",
  "Você define preço de balcão, capacidade e disponibilidade. O controle da vaga é seu.",
  "Dá pra pausar ou encerrar a parceria quando quiser, respeitando as reservas já confirmadas.",
  "Seus dados são tratados conforme a Política de Privacidade da Movepark.",
];

/** O que uma versão do contrato carrega (o que `partner_contract_current()` devolve). */
export type ContractText = {
  version: string;
  sha256: string;
  body: string;
};

export type ContractProofOpts = {
  companyName?: string | null;
  acceptedAt?: string | null;
};

/** Hash abreviado para a tela: os 12 primeiros hex + reticências. Nulo continua nulo. */
export function abbreviateHash(sha256: string | null | undefined, chars = 12): string | null {
  if (!sha256) return null;
  return sha256.length > chars ? `${sha256.slice(0, chars)}…` : sha256;
}

/** Nome do arquivo de PDF, o mesmo que a Edge usa no Content-Disposition. */
export function contractPdfFilename(version: string): string {
  const safe = version.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  return `contrato-parceria-movepark-${safe}.pdf`;
}

/** Texto completo para leitura e download (.txt): corpo da versão + bloco do parceiro/aceite. */
export function buildContractText(contract: ContractText, opts?: ContractProofOpts): string {
  const parceiro = opts?.companyName?.trim() || "PARCEIRO";
  const linhas: string[] = [contract.body, "", `Parceiro: ${parceiro}`];
  if (opts?.acceptedAt) {
    linhas.push(`Assinado em: ${new Date(opts.acceptedAt).toLocaleString("pt-BR")}`);
  }
  linhas.push(`Versão: ${contract.version}`, `SHA-256 do texto: ${contract.sha256}`);
  return linhas.join("\n");
}

/** Dispara o download de um arquivo no navegador. No-op fora dele (SSG). */
export function saveBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Gera o .txt do contrato e dispara o download. */
export function downloadContract(contract: ContractText, opts?: ContractProofOpts): void {
  const text = buildContractText(contract, opts);
  saveBlob(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
    `contrato-parceria-movepark-${contract.version}.txt`,
  );
}
