// Markdown RESTRITO do aviso do estacionamento (`location.partner_notice_md`) para o e-mail de
// confirmação e o PDF do voucher. Parágrafo, lista, negrito, itálico e link; nada de HTML cru:
// todo texto passa por `escapeHtml` antes de virar HTML, e o href só sobrevive se for http(s).
//
// Cada linha não vazia é um parágrafo (ou item de lista): o parceiro escreve linha a linha, e o
// resultado tem que sair como ele vê na caixa de texto do Manager.
//
// Espelho de `src/lib/markdownRestrito.ts` (front). Ao mudar um, mude o outro: os dois têm o
// mesmo teste de amostras. Spec: docs/specs/aviso-do-estacionamento.md.

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
  const lines = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
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

export function temAviso(md: string | null | undefined): boolean {
  return parseMarkdownRestrito(md).length > 0;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface HtmlRestritoEstilos {
  /** `style` do `<p>` e do `<ul>/<ol>` (margem e tipografia do e-mail vão aqui). */
  paragrafo: string;
  lista: string;
  item: string;
  /** `style` do `<a>` e do `<strong>`. */
  link: string;
  negrito: string;
}

const SEM_ESTILO: HtmlRestritoEstilos = { paragrafo: "", lista: "", item: "", link: "", negrito: "" };

function attr(style: string): string {
  return style ? ` style="${style}"` : "";
}

function inlineHtml(nodes: InlineRestrito[], e: HtmlRestritoEstilos): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return escapeHtml(n.value);
      if (n.type === "bold") return `<strong${attr(e.negrito)}>${inlineHtml(n.children, e)}</strong>`;
      if (n.type === "italic") return `<em>${inlineHtml(n.children, e)}</em>`;
      return `<a href="${escapeHtml(n.href)}" target="_blank"${attr(e.link)}>${inlineHtml(n.children, e)}</a>`;
    })
    .join("");
}

/**
 * HTML inline (estilos no atributo, que é o que cliente de e-mail respeita). Tudo escapado:
 * `<b>` escrito no aviso sai como texto `&lt;b&gt;`, nunca como tag.
 */
export function markdownRestritoToHtml(md: string | null | undefined, estilos: Partial<HtmlRestritoEstilos> = {}): string {
  const e = { ...SEM_ESTILO, ...estilos };
  return parseMarkdownRestrito(md)
    .map((b) => {
      if (b.type === "paragraph") return `<p${attr(e.paragrafo)}>${inlineHtml(b.content, e)}</p>`;
      const tag = b.ordered ? "ol" : "ul";
      const itens = b.items.map((i) => `<li${attr(e.item)}>${inlineHtml(i, e)}</li>`).join("");
      return `<${tag}${attr(e.lista)}>${itens}</${tag}>`;
    })
    .join("");
}

function inlineTexto(nodes: InlineRestrito[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return n.value;
      if (n.type === "link") return `${inlineTexto(n.children)} (${n.href})`;
      return inlineTexto(n.children);
    })
    .join("");
}

/**
 * Texto puro, uma linha por parágrafo ou item (`• ` e `1. `), para o PDF do voucher, que não tem
 * marcação. O link vira "rótulo (url)", porque no papel ninguém clica.
 */
export function markdownRestritoToLinhas(md: string | null | undefined): string[] {
  const linhas: string[] = [];
  for (const b of parseMarkdownRestrito(md)) {
    if (b.type === "paragraph") {
      linhas.push(inlineTexto(b.content));
      continue;
    }
    b.items.forEach((item, i) => {
      linhas.push(`${b.ordered ? `${i + 1}.` : "•"} ${inlineTexto(item)}`);
    });
  }
  return linhas;
}
