// Contrato de parceria Movepark ↔ estacionamento (simulado por ora). Texto versionado + download
// client-side. O aceite fica registrado em company.contract_accepted_at (RPC operator_accept_contract).

export const CONTRACT_VERSION = "v1";

/** Resumo em tópicos, mostrado na tela de assinatura. */
export const CONTRACT_SUMMARY: string[] = [
  "A Movepark divulga seu estacionamento, recebe as reservas e o pagamento dos clientes.",
  "Você recebe o valor das reservas, menos a comissão da Movepark, no repasse combinado.",
  "Você define preço de balcão, capacidade e disponibilidade. O controle da vaga é seu.",
  "Dá pra pausar ou encerrar a parceria quando quiser, respeitando as reservas já confirmadas.",
  "Seus dados são tratados conforme a Política de Privacidade da Movepark.",
];

/** Monta o texto completo do contrato para leitura e download. */
export function buildContractText(opts?: { companyName?: string | null; acceptedAt?: string | null }): string {
  const parceiro = opts?.companyName?.trim() || "PARCEIRO";
  const linhas: string[] = [
    "CONTRATO DE PARCERIA - MOVEPARK",
    `Versão ${CONTRACT_VERSION}`,
    "",
    `Parceiro: ${parceiro}`,
    "Plataforma: Movepark Tecnologia Ltda.",
    "",
    "1. OBJETO",
    "A Movepark divulga o estacionamento do Parceiro em sua plataforma, intermedeia as reservas",
    "e processa os pagamentos dos clientes finais.",
    "",
    "2. RESERVAS E PAGAMENTO",
    "O cliente paga a reserva antecipadamente pela Movepark. O Parceiro recebe o valor das reservas",
    "confirmadas, deduzida a comissão da Movepark, conforme o repasse combinado.",
    "",
    "3. CONTROLE DO PARCEIRO",
    "O Parceiro define preço de balcão, capacidade e disponibilidade de cada tipo de vaga, e pode",
    "ajustar essas informações a qualquer momento no painel.",
    "",
    "4. REPASSE",
    "O repasse é feito para a conta bancária informada pelo Parceiro no cadastro de recebimento,",
    "após a confirmação da reserva, na periodicidade combinada.",
    "",
    "5. VIGÊNCIA E ENCERRAMENTO",
    "A parceria vigora por prazo indeterminado. Qualquer das partes pode encerrá-la quando quiser,",
    "respeitando as reservas já confirmadas até a data do encerramento.",
    "",
    "6. DADOS E PRIVACIDADE",
    "Os dados do Parceiro são tratados conforme a Política de Privacidade da Movepark e a LGPD.",
    "",
    "7. ACEITE",
    "Ao assinar, o Parceiro declara ter lido e concordado com este contrato.",
  ];
  if (opts?.acceptedAt) {
    linhas.push("", `Assinado em: ${new Date(opts.acceptedAt).toLocaleString("pt-BR")}`);
  }
  return linhas.join("\n");
}

/** Gera o arquivo do contrato e dispara o download no navegador. */
export function downloadContract(opts?: { companyName?: string | null; acceptedAt?: string | null }): void {
  if (typeof document === "undefined") return;
  const text = buildContractText(opts);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contrato-parceria-movepark-${CONTRACT_VERSION}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
