/**
 * Config compartilhada de renderização de documentos legais (Termos/Privacidade).
 * Usada tanto na página cheia quanto no modal do checkout — mantém a allowlist
 * de sanitização num único lugar (evita divergência de segurança).
 */

// Allowlist casando com o schema restrito do Tiptap. Mesmo que markup seja gravado
// fora do editor, nada além destas tags/atributos renderiza — e o DOMPurify bloqueia
// javascript:/data: em href.
export const LEGAL_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "b", "i", "s", "a", "br"],
  ALLOWED_ATTR: ["href", "rel", "target"],
};

/** Estilo do corpo do documento (child-selectors do HTML sanitizado). */
export const LEGAL_PROSE_CLASS =
  "space-y-4 text-body-sm text-muted [&_a]:text-mp-indigo [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-8 [&_h2]:text-title-sm [&_h2]:text-ink [&_li]:mt-1 [&_p]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5";
