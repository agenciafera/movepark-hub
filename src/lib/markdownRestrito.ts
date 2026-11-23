/**
 * Markdown RESTRITO do aviso do estacionamento (`location.partner_notice_md`).
 *
 * Só o que um aviso de política precisa: parágrafo, lista (com `-`, `*` ou `1.`), negrito
 * (`**x**`), itálico (`_x_` ou `*x*`) e link (`[texto](https://...)`). Nada vira HTML cru: o
 * texto nunca passa por `dangerouslySetInnerHTML`, vira elemento React em
 * `@/components/shared/MarkdownRestrito`. Título, imagem, citação e tabela não existem aqui de
 * propósito; `#` e `>` no começo da linha são tratados como texto comum.
 *
 * Cada linha não vazia é um parágrafo (ou um item de lista). O parceiro escreve linha a linha,
 * sem saber que Markdown exige linha em branco para separar, e o resultado tem que sair como
 * ele vê na caixa de texto.
 *
 * Espelho de `supabase/functions/_shared/markdown-restrito.ts` (e-mail e PDF do voucher).
 * Ao mudar um, mude o outro: os dois têm o mesmo teste de amostras.
 */

export const AVISO_MAX_CHARS = 2000;

export type InlineRestrito =
  | { type: "text"; value: string }
  | { type: "bold"; children: InlineRestrito[] }
  | { type: "italic"; children: InlineRestrito[] }
  | { type: "link"; href: string; children: InlineRestrito[] };

export type BlocoRestrito =
  | { type: "paragraph"; content: InlineRestrito[] }
  | { type: "list"; ordered: boolean; items: InlineRestrito[][] };

const UNORDERED = /^\s*[-*•]\s+(.*\S)\s*$/;
const ORDERED = /^\s*\d+[.)]\s+(.*\S)\s*$/;

/** Só http(s) vira link; qualquer outro esquema (javascript:, data:, mailto:) sai como texto. */
export function hrefSeguro(href: string): string | null {
  return /^https?:\/\/\S+$/i.test(href) ? href : null;
}

/**
 * Trechos com marcação inline. A barra invertida vem primeiro (`\*` é asterisco literal); o link
 * vem antes do negrito porque o rótulo dele pode ter negrito dentro.
 */
export function parseInlineRestrito(input: string): InlineRestrito[] {
  const out: InlineRestrito[] = [];
  const pattern =
    /\\([\\*_[\]()])|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|(?<![\w\\])_([^_\n]+)_(?![\w])|(?<![\w*\\])\*([^*\n]+)\*(?![\w*])/g;

  let last = 0;
  for (const m of input.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", value: input.slice(last, start) });

    if (m[1] !== undefined) {
      out.push({ type: "text", value: m[1] });
    } else if (m[2] !== undefined) {
      const href = hrefSeguro(m[3]);
      const children = parseInlineRestrito(m[2]);
      if (href) out.push({ type: "link", href, children });
      else out.push(...children);
    } else if (m[4] !== undefined) {
      out.push({ type: "bold", children: parseInlineRestrito(m[4]) });
    } else if (m[5] !== undefined) {
      out.push({ type: "italic", children: parseInlineRestrito(m[5]) });
    } else if (m[6] !== undefined) {
      out.push({ type: "italic", children: parseInlineRestrito(m[6]) });
    }
    last = start + m[0].length;
  }
  if (last < input.length) out.push({ type: "text", value: input.slice(last) });

  return out.filter((n) => n.type !== "text" || n.value !== "");
}

/** Markdown restrito → blocos. Vazio (ou só espaço) devolve lista vazia: o bloco não existe. */
export function parseMarkdownRestrito(md: string | null | undefined): BlocoRestrito[] {
  const blocks: BlocoRestrito[] = [];
  const lines = String(md ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  let list: { ordered: boolean; items: InlineRestrito[][] } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    const li = UNORDERED.exec(line) ?? ORDERED.exec(line);
    if (li) {
      const ordered = ORDERED.test(line) && !UNORDERED.test(line);
      if (!list || list.ordered !== ordered) {
        list = { ordered, items: [] };
        blocks.push({ type: "list", ...list });
      }
      list.items.push(parseInlineRestrito(li[1]));
      continue;
    }
    list = null;
    blocks.push({ type: "paragraph", content: parseInlineRestrito(line) });
  }
  return blocks;
}

/** O aviso existe? Branco e só espaço contam como vazio: sem bloco, sem título órfão. */
export function temAviso(md: string | null | undefined): boolean {
  return parseMarkdownRestrito(md).length > 0;
}

/** Texto corrido, sem marcação. Serve para `aria-label`, resumo e teste. */
export function textoDoInline(nodes: InlineRestrito[]): string {
  return nodes.map((n) => (n.type === "text" ? n.value : textoDoInline(n.children))).join("");
}
