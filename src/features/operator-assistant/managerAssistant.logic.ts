// Lógica pura do Manager › Mia para operadores (conversas e base).

export interface FalaGravada {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  used_tools: string[];
  error: string | null;
  booking_code: string | null;
  created_at: string;
  company: { name: string } | null;
  profile: { full_name: string | null } | null;
}

export interface Conversa {
  id: string;
  empresa: string;
  pessoa: string;
  ultimaEm: string;
  perguntas: number;
  comErro: boolean;
  falas: FalaGravada[];
}

/**
 * As falas chegam da mais nova para a mais velha (limite da consulta). A conversa é a lista em
 * ordem de leitura, e a lista de conversas começa pela que mexeu por último. O marcador "Nova
 * conversa" sai: ele só separa threads.
 */
export function agruparConversas(falas: FalaGravada[]): Conversa[] {
  const por = new Map<string, FalaGravada[]>();
  for (const f of falas) {
    if (f.role === "system" && f.content === "Nova conversa") continue;
    const lista = por.get(f.conversation_id) ?? [];
    lista.push(f);
    por.set(f.conversation_id, lista);
  }
  return [...por.entries()]
    .map(([id, lista]) => {
      const ordem = [...lista].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const ultima = ordem[ordem.length - 1];
      return {
        id,
        empresa: ultima.company?.name ?? "Empresa removida",
        pessoa: ultima.profile?.full_name?.trim() || "Sem nome",
        ultimaEm: ultima.created_at,
        perguntas: ordem.filter((f) => f.role === "user").length,
        comErro: ordem.some((f) => !!f.error),
        falas: ordem,
      };
    })
    .sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm));
}

/** "Cliente quer cancelar fora do prazo" → "cliente-quer-cancelar-fora-do-prazo". */
export function slugDoTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** O artigo precisa de título, categoria e corpo; corpo curto demais não ensina nada à Mia. */
export function erroDoArtigo(a: { title: string; category: string; body_md: string }): string | null {
  if (a.title.trim().length < 5) return "Escreva um título.";
  if (!a.category.trim()) return "Escolha a categoria.";
  if (a.body_md.trim().length < 40) return "O texto está curto demais para a Mia usar.";
  if (/[\u2013\u2014]/.test(`${a.title}${a.body_md}`)) return "Tire o travessão do texto (regra de escrita da Movepark).";
  return null;
}
