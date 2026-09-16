import type { LoginChannel } from "@/features/users/api";

/** Telefone como o Supabase guarda (E.164 sem "+") no formato brasileiro de leitura. */
export function formatPhoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  if (!m) return `+${digits}`;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

export const LOGIN_CHANNEL_LABEL: Record<LoginChannel, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  google: "Google",
};

/** Página atual, número de páginas e o intervalo "de X a Y de N" para o rodapé da tabela. */
export function pageInfo(total: number, page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  return { pages, current, from, to, hasPrev: current > 1, hasNext: current < pages };
}
