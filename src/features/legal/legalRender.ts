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

/**
 * Estilo do corpo do documento (child-selectors do HTML sanitizado).
 * Corpo em `body` (16px/#424242) e h2 em `display-sm`: é o contrato de página de
 * conteúdo (skill `harmonizar-paginas`). Antes o documento inteiro era 14px muted,
 * o que deixava Termos e Privacidade sem hierarquia e no contraste mais baixo do
 * site, justamente nas páginas de leitura mais longa.
 */
export const LEGAL_PROSE_CLASS =
  "space-y-4 text-body-md text-body [&_a]:text-mp-indigo [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-8 [&_h2]:text-display-sm [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:text-title-md [&_h3]:text-ink [&_li]:mt-1 [&_p]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5";
