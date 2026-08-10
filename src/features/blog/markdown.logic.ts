/**
 * Markdown do post → blocos tipados, para render em React.
 *
 * Escopo fechado de propósito: cobre só o que os 93 posts importados do WordPress
 * usam (títulos, listas, citação, imagem, link, negrito, itálico). Sem tabela, sem
 * bloco de código, sem HTML cru — a importação não deixou nenhum.
 *
 * O ganho de não usar uma lib de markdown com `dangerouslySetInnerHTML` é que
 * não existe caminho de XSS: o corpo nunca vira HTML, vira elemento React.
 */

export type MdInline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "link"; href: string; label: string };

export type MdBlock =
  | { type: "heading"; level: 2 | 3 | 4; content: MdInline[] }
  | { type: "paragraph"; content: MdInline[] }
  | { type: "list"; ordered: boolean; items: MdInline[][] }
  | { type: "quote"; content: MdInline[] }
  | { type: "image"; src: string; alt: string };

/**
 * Imagem sozinha na linha, com ou sem link em volta.
 *
 * O WordPress embrulha imagem em link para abrir a lightbox, e o destino é o
 * próprio arquivo. O link não serve para nada aqui, então fica só a imagem.
 */
const IMAGE_ONLY =
  /^\[?!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\]\([^)\s]+\))?$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

/**
 * Quebra o texto em trechos com marcação inline.
 *
 * A ordem importa: imagem antes de link, porque `![x](y)` contém `[x](y)`.
 * Imagem inline vira o próprio alt como texto — imagem de verdade só existe
 * como bloco, e é assim que ela ganha `loading="lazy"` e largura controlada.
 */
export function parseInline(input: string): MdInline[] {
  const out: MdInline[] = [];
  const pattern =
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^*]+)\*\*|(?<![\w\\])_([^_\n]+)_(?![\w])/g;

  let last = 0;
  for (const m of input.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", value: input.slice(last, start) });

    if (m[1] !== undefined) {
      if (m[1]) out.push({ type: "text", value: m[1] });
    } else if (m[3] !== undefined) {
      out.push({ type: "link", href: m[4], label: m[3] });
    } else if (m[5] !== undefined) {
      out.push({ type: "bold", value: m[5] });
    } else if (m[6] !== undefined) {
      out.push({ type: "italic", value: m[6] });
    }
    last = start + m[0].length;
  }
  if (last < input.length) out.push({ type: "text", value: input.slice(last) });

  return out.filter((n) => n.type !== "text" || n.value !== "");
}

/**
 * Markdown → blocos.
 *
 * `#` do corpo é rebaixado para `##`: o `<h1>` da página é o título do post, e
 * dois h1 na mesma página é ruído de hierarquia para o buscador.
 */
export function parseMarkdown(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", content: parseInline(text) });
    paragraph = [];
  };
  const flushList = () => {
    if (list && list.items.length) {
      blocks.push({
        type: "list",
        ordered: list.ordered,
        items: list.items.map((i) => parseInline(i)),
      });
    }
    list = null;
  };
  const flushQuote = () => {
    const text = quote.join(" ").trim();
    if (text) blocks.push({ type: "quote", content: parseInline(text) });
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushAll();
      continue;
    }

    const image = line.match(IMAGE_ONLY);
    if (image) {
      flushAll();
      blocks.push({ type: "image", src: image[2], alt: image[1] });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flushAll();
      const level = Math.min(Math.max(heading[1].length, 2), 4) as 2 | 3 | 4;
      blocks.push({ type: "heading", level, content: parseInline(heading[2]) });
      continue;
    }

    const quoted = line.match(QUOTE);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    const ordered = line.match(ORDERED);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }

    const unordered = line.match(UNORDERED);
    if (unordered) {
      flushParagraph();
      flushQuote();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(unordered[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line);
  }

  flushAll();
  return blocks;
}

/** Texto puro do post, para resumo automático e para o corpo em `text/markdown`. */
export function plainText(md: string): string {
  return parseMarkdown(md)
    .flatMap((b) => {
      if (b.type === "image") return [];
      if (b.type === "list") return b.items.map(inlineText);
      return [inlineText(b.content)];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function inlineText(nodes: MdInline[]): string {
  return nodes
    .map((n) => (n.type === "link" ? n.label : n.type === "text" ? n.value : n.value))
    .join("");
}

/**
 * Meta description do post, no limite que o Google mostra.
 *
 * Só 71 dos 93 posts migrados trazem a description escrita no Yoast. Nos outros a
 * alternativa é o resumo automático do WordPress, que vem longo e terminado em
 * "[...]": jogar isso na meta entrega ao buscador um trecho cortado no meio da
 * frase. Aqui a queda é controlada, cortando na última frase ou palavra que couber.
 */
export function metaDescription(
  metaFromCms: string | null | undefined,
  excerpt: string | null | undefined,
  body: string,
  limit = 155,
): string {
  const escrita = metaFromCms?.trim();
  if (escrita) return escrita;

  const bruto = (excerpt ?? "").replace(/\[[.…]+\]\s*$/, "").trim() || plainText(body);
  return truncateAtBoundary(bruto, limit);
}

function truncateAtBoundary(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;

  const janela = clean.slice(0, limit);

  // Prefere fechar numa frase inteira, desde que ela use ao menos metade do
  // espaço: abaixo disso o corte entrega uma description curta demais para
  // descrever a página.
  const fim = Math.max(janela.lastIndexOf(". "), janela.lastIndexOf("! "), janela.lastIndexOf("? "));
  if (fim >= limit * 0.5) return janela.slice(0, fim + 1).trim();

  const espaco = janela.lastIndexOf(" ");
  const cortado = janela.slice(0, espaco > 0 ? espaco : limit).trim();
  // Reticências só quando a frase ficou mesmo pela metade.
  return /[.!?]$/.test(cortado) ? cortado : `${cortado}...`;
}

/** Minutos de leitura, arredondado para cima, mínimo 1. Base: 200 palavras/minuto. */
export function readingMinutes(md: string): number {
  const words = plainText(md).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
