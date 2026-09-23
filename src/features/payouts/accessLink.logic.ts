// Link de acesso ao Recebimento (23/09/2026): o que o Manager vê sobre o link vivo da empresa.
// Spec: docs/specs/link-de-acesso-recebimento.md

export type AccessLinkLike = {
  email: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
};

/** Frase de estado do link: quando nasceu, se foi aberto e quando. */
export function describeAccessLink(link: AccessLinkLike, fmt: (iso: string) => string): string {
  const base = `Gerado em ${fmt(link.created_at)} para ${link.email}.`;
  if (link.use_count === 0 || !link.last_used_at) return `${base} Ainda não foi aberto.`;
  const vezes = link.use_count === 1 ? "1 vez" : `${link.use_count} vezes`;
  return `${base} Aberto ${vezes}, a última em ${fmt(link.last_used_at)}.`;
}

/** Só o link não revogado conta como vivo. A lista vem ordenada do mais novo para o mais velho. */
export function activeAccessLink<T extends AccessLinkLike>(links: T[] | undefined): T | null {
  return links?.find((l) => !l.revoked_at) ?? null;
}

/** Texto pronto para colar no WhatsApp do dono. */
export function shareMessage(companyName: string, url: string): string {
  return [
    `Olá! Aqui é da Movepark. Este é o seu acesso ao painel de ${companyName}:`,
    url,
    "Ao abrir, você já entra logado e cai direto no cadastro de recebimento (dados bancários, CNPJ e contrato). Leva uns 5 minutos. Se precisar parar no meio, é só abrir o mesmo link de novo.",
  ].join("\n");
}
