// Decisões puras do descadastro, separadas do index.ts para terem teste sem Supabase.
//
// O que mora aqui é o que erra calado: aceitar um token que não é token, e gravar o descadastro
// pela metade (tirar do e-mail e deixar o WhatsApp ligado, ou o contrário).

export type UnsubChannel = "email" | "whatsapp" | "all";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O token tem formato de uuid?
 *
 * Filtra antes de consultar o banco. Não é defesa contra força bruta (o uuid aleatório já é),
 * é para um `?t=` vazio ou colado torto não virar consulta.
 */
export function isValidToken(token: unknown): boolean {
  return typeof token === "string" && UUID_RE.test(token.trim());
}

/** Normaliza o canal pedido. Qualquer coisa fora dos dois conhecidos vira "tudo". */
export function normalizeChannel(raw: unknown): UnsubChannel {
  return raw === "email" || raw === "whatsapp" ? raw : "all";
}

/**
 * O patch a aplicar em `marketing_contact`.
 *
 * `unsubscribed_at` só é carimbado quando a pessoa sai de TUDO. Sair só do WhatsApp não é sair da
 * base, e carimbar mesmo assim faria a matrícula de campanha (que filtra por `unsubscribed_at`)
 * excluir quem ainda aceita e-mail.
 */
export function patchFor(channel: UnsubChannel, agora: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (channel === "all" || channel === "email") patch.email_consent = false;
  if (channel === "all" || channel === "whatsapp") patch.whatsapp_consent = false;
  if (channel === "all") patch.unsubscribed_at = agora;
  return patch;
}

/**
 * Canais que entram na lista de supressão.
 *
 * A supressão é o que sobrevive a uma ressincronização: `marketing_sync_contacts` recria o contato
 * a partir das reservas, e sem esta linha uma reserva nova traria a pessoa de volta para a lista.
 */
export function channelsFor(channel: UnsubChannel): Array<"email" | "whatsapp"> {
  return channel === "all" ? ["email", "whatsapp"] : [channel];
}
