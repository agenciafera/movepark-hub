/**
 * Markdown do post → blocos tipados, para render em React.
 *
 * Escopo fechado de propósito: cobre só o que os 93 posts importados do WordPress
 * usam (títulos, listas, citação, imagem, link, negrito, itálico e tabela em pipe,
 * que são 249 linhas em 32 posts). Sem bloco de código e sem HTML cru, porque a
 * importação não deixou nenhum.
 *
 * O ganho de não usar uma lib de markdown com `dangerouslySetInnerHTML` é que
 * não existe caminho de XSS: o corpo nunca vira HTML, vira elemento React.
 */

/**
 * Todo nó que envolve outro guarda `children`, não texto.
 *
 * O WordPress aninhou marcação à vontade: `[**Nome**](url)` em 28 links e
 * `**[Nome](url)**` em 20 blocos. Guardando o miolo como string crua, um deles
 * sempre aparecia literal na tela, dependendo de qual ficasse por fora.
 */
export type MdInline =
  | { type: "text"; value: string }
  | { type: "bold"; children: MdInline[] }
  | { type: "italic"; children: MdInline[] }
  | { type: "link"; href: string; children: MdInline[] };

/** Item de lista, com no máximo um nível de sublista (é o que o acervo usa). */
export type MdListItem = {
  content: MdInline[];
  sub?: { ordered: boolean; items: MdInline[][] };
};

export type MdBlock =
  | { type: "heading"; level: 2 | 3 | 4; content: MdInline[] }
  | { type: "paragraph"; content: MdInline[] }
  | { type: "list"; ordered: boolean; items: MdListItem[] }
  | { type: "quote"; content: MdInline[] }
  | { type: "image"; src: string; alt: string }
  | { type: "rule" }
  /** Cabeçalho separado do corpo: 32 posts trazem comparativo de preço. */
  | { type: "table"; head: MdInline[][]; rows: MdInline[][][] };

/**
 * Imagem sozinha na linha, com ou sem link em volta.
 *
 * O WordPress embrulha imagem em link para abrir a lightbox, e o destino é o
 * próprio arquivo. O link não serve para nada aqui, então fica só a imagem.
 */
const IMAGE_ONLY = /^\[?!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\]\([^)\s]+\))?$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
/**
 * Separador temático. Precisa ser testado ANTES da lista: `* * *` casa com
 * `UNORDERED` e virava um item com o texto "* *". São 105 no acervo, em 14 posts.
 */
const RULE = /^([-*_])(\s*\1){2,}$/;
const TABLE_ROW = /^\|(.+)\|\s*$/;
/** Linha separadora do cabeçalho: `| --- | :--: |`. */
const TABLE_SEP = /^\|[\s:|-]+\|\s*$/;

/**
 * Quebra `| a | b |` nas células, já sem os pipes das pontas.
 *
 * O corte ignora `\|`, que é pipe dentro do texto da célula e não separador. Sem
 * isso, uma célula com pipe vira duas e desalinha a linha inteira.
 */
function celulas(linha: string): string[] {
  return linha
    .replace(/^\||\|\s*$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

/**
 * Quebra o texto em trechos com marcação inline.
 *
 * A ordem importa por dois motivos. A barra invertida vem primeiro: `\*` é um
 * asterisco literal, e sem consumi-lo antes de tudo a barra ia para a tela junto
 * com o caractere. E imagem vem antes de link, porque `![x](y)` contém `[x](y)`.
 * Imagem inline vira o próprio alt como texto: imagem de verdade só existe como
 * bloco, e é assim que ela ganha `loading="lazy"` e largura controlada.
 */
export function parseInline(input: string): MdInline[] {
  const out: MdInline[] = [];
  const pattern =
    /\\([\\`*_{}[\]()#+\-.!|>~])|!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^*]+)\*\*|(?<![\w\\])_([^_\n]+)_(?![\w])/g;

  let last = 0;
  for (const m of input.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", value: input.slice(last, start) });

    if (m[1] !== undefined) {
      out.push({ type: "text", value: m[1] });
    } else if (m[2] !== undefined) {
      if (m[2]) out.push({ type: "text", value: m[2] });
    } else if (m[4] !== undefined) {
      out.push({ type: "link", href: m[5], children: parseInline(m[4]) });
    } else if (m[6] !== undefined) {
      out.push({ type: "bold", children: parseInline(m[6]) });
    } else if (m[7] !== undefined) {
      out.push({ type: "italic", children: parseInline(m[7]) });
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

  type ItemEmMontagem = { text: string; sub?: { ordered: boolean; items: string[] } };
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: ItemEmMontagem[] } | null = null;
  let quote: string[] = [];
  /*
    Linha em branco não fecha a lista na hora.

    O WordPress separa os itens com uma linha de espaços e coloca o corpo do item
    indentado embaixo. Fechando na hora, a numeração reiniciava do 1 no item
    seguinte, o que aconteceu em 5 posts. Aqui a branco fica pendente e só fecha
    a lista se o que vier depois não pertencer a ela.
  */
  let brancoPendente = false;
  let tabela: string[][] | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) {
      const content = parseInline(text);
      /*
        Parágrafo que é só negrito e curto é subtítulo, não parágrafo.

        O editor clássico usava negrito no lugar de título em 165 blocos, quase
        sempre nome de estacionamento abrindo um trecho. Renderizado como
        parágrafo, o leitor perde a divisão e o outline fica sem os degraus.
        O limite de tamanho e a ausência de ponto final separam o subtítulo de
        uma frase inteira que por acaso está toda em negrito.
      */
      const unico = content.length === 1 ? content[0] : null;
      // O teste é sobre o texto de dentro, não sobre o cru: "**Frase.**" termina
      // em asterisco, e checar o cru deixava frase inteira virar título.
      const interno = unico?.type === "bold" ? inlineText(unico.children).trim() : "";
      const soNegrito =
        unico?.type === "bold" && interno.length <= 80 && !/[.!?:]$/.test(interno) ? unico : null;
      blocks.push(
        soNegrito
          ? { type: "heading", level: 4, content: soNegrito.children }
          : { type: "paragraph", content },
      );
    }
    paragraph = [];
  };
  const flushList = () => {
    if (list && list.items.length) {
      blocks.push({
        type: "list",
        ordered: list.ordered,
        items: list.items.map((i) => ({
          content: parseInline(i.text),
          ...(i.sub?.items.length
            ? { sub: { ordered: i.sub.ordered, items: i.sub.items.map((s) => parseInline(s)) } }
            : {}),
        })),
      });
    }
    list = null;
    brancoPendente = false;
  };
  /**
   * Fecha a tabela. A primeira linha é o cabeçalho quando veio a linha
   * separadora; sem ela, tudo vira corpo e o cabeçalho fica vazio.
   */
  const flushTable = () => {
    if (tabela && tabela.length) {
      const [cab, ...resto] = tabela;
      const temCabecalho = tabela.length > 1;
      blocks.push({
        type: "table",
        head: temCabecalho ? cab.map((c) => parseInline(c)) : [],
        rows: (temCabecalho ? resto : tabela).map((l) => l.map((c) => parseInline(c))),
      });
    }
    tabela = null;
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
    flushTable();
  };

  for (const raw of lines) {
    const line = raw.trim();
    const indentado = /^\s{2,}\S/.test(raw);

    if (!line) {
      // Dentro de lista a branco fica pendente; fora dela fecha tudo, como antes.
      if (list) brancoPendente = true;
      else flushAll();
      continue;
    }

    /*
      Linha indentada com lista aberta pertence ao item corrente: ou é sublista,
      ou é continuação do texto dele. Antes tudo virava parágrafo solto, o que
      picotava a lista e achatava a sublista em 16 posts.
    */
    if (list && indentado) {
      const item = list.items[list.items.length - 1];
      const marcador = line.match(UNORDERED) ?? line.match(ORDERED);
      if (item && marcador) {
        const ordenada = ORDERED.test(line);
        item.sub ??= { ordered: ordenada, items: [] };
        item.sub.items.push(semPrefixoDeTitulo(marcador[1]));
      } else if (item) {
        item.text = `${item.text} ${semPrefixoDeTitulo(line)}`.trim();
      }
      brancoPendente = false;
      continue;
    }

    // O que veio depois da branco não é da lista: fecha antes de seguir.
    if (brancoPendente && !UNORDERED.test(line) && !ORDERED.test(line)) flushList();

    const linhaDeTabela = line.match(TABLE_ROW);
    if (linhaDeTabela) {
      // A linha separadora só marca onde o cabeçalho termina; não vira conteúdo.
      if (!TABLE_SEP.test(line)) {
        flushParagraph();
        flushList();
        flushQuote();
        (tabela ??= []).push(celulas(line));
      }
      continue;
    }
    flushTable();

    if (RULE.test(line)) {
      flushAll();
      blocks.push({ type: "rule" });
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
      list.items.push({ text: semPrefixoDeTitulo(ordered[1]) });
      brancoPendente = false;
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
      list.items.push({ text: semPrefixoDeTitulo(unordered[1]) });
      brancoPendente = false;
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line);
  }

  flushAll();
  return normalizaTitulos(blocks);
}

/**
 * Sobe a hierarquia quando o post não tem nenhum `h2`.
 *
 * O `<h1>` é o título da página, então um post que abre em `###` pula um nível e
 * deixa um buraco no outline, que atrapalha leitor de tela e buscador. São 9 posts
 * do acervo. O deslocamento é relativo: se o post usa h3 e h4, vira h2 e h3, e a
 * estrutura interna continua a mesma.
 */
function normalizaTitulos(blocks: MdBlock[]): MdBlock[] {
  const niveis = blocks.filter((b) => b.type === "heading").map((b) => b.level);
  if (!niveis.length) return blocks;

  const menor = Math.min(...niveis);
  if (menor === 2) return blocks;

  const desloca = menor - 2;
  return blocks.map((b) =>
    b.type === "heading" ? { ...b, level: Math.max(2, b.level - desloca) as 2 | 3 | 4 } : b,
  );
}

/**
 * Tira o `###` que o WordPress deixou dentro de item de lista.
 *
 * Eram 12 itens em 3 posts mostrando o marcador na tela. O texto vira o próprio
 * item, que a lista já destaca; abrir um heading dentro de `<li>` bagunçaria a
 * hierarquia do documento.
 */
function semPrefixoDeTitulo(texto: string): string {
  return texto.replace(/^#{1,6}\s+/, "");
}

/** Texto puro do post, para resumo automático e para o corpo em `text/markdown`. */
export function plainText(md: string): string {
  return parseMarkdown(md)
    .flatMap((b) => {
      if (b.type === "image" || b.type === "rule") return [];
      if (b.type === "table") {
        return [...b.head, ...b.rows.flat()].map(inlineText);
      }
      if (b.type === "list") {
        return b.items.flatMap((i) => [
          inlineText(i.content),
          ...(i.sub?.items ?? []).map(inlineText),
        ]);
      }
      return [inlineText(b.content)];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function inlineText(nodes: MdInline[]): string {
  return nodes.map((n) => (n.type === "text" ? n.value : inlineText(n.children))).join("");
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
  const fim = Math.max(
    janela.lastIndexOf(". "),
    janela.lastIndexOf("! "),
    janela.lastIndexOf("? "),
  );
  if (fim >= limit * 0.5) return janela.slice(0, fim + 1).trim();

  const espaco = janela.lastIndexOf(" ");
  const cortado = janela.slice(0, espaco > 0 ? espaco : limit).trim();
  // Reticências só quando a frase ficou mesmo pela metade.
  return /[.!?]$/.test(cortado) ? cortado : `${cortado}...`;
}

/**
 * Lead da página do post, ou nada.
 *
 * O `excerpt` dos 93 posts migrados quase sempre é o resumo automático do
 * WordPress, que é o começo do próprio corpo cortado em "[...]". Mostrar isso
 * como linha fina faz o leitor ler o mesmo parágrafo duas vezes seguidas, com a
 * segunda versão truncada no meio da frase, que é pior que não ter lead nenhum.
 *
 * Só passa o resumo que o editor escreveu, ou seja, o que NÃO é o começo do
 * corpo. A comparação ignora acento, pontuação e caixa, porque o resumo do
 * WordPress passou por conversão de entidade HTML e volta com aspas diferentes
 * das do markdown.
 */
export function leadFrom(excerpt: string | null | undefined, body: string): string | null {
  const limpo = (excerpt ?? "").replace(/\[[.…]+\]\s*$/, "").trim();
  if (!limpo) return null;

  const chave = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const inicio = chave(plainText(body)).slice(0, chave(limpo).length);
  return inicio === chave(limpo) ? null : limpo;
}

/**
 * Âncora de uma seção do corpo.
 *
 * O prefixo não é enfeite: id começando com dígito é HTML válido e seletor CSS
 * inválido, e título de guia quase sempre começa com número ("1. Evolução…").
 * A ordem entra no id porque o acervo repete título entre seções ("Conclusão"),
 * e dois elementos com o mesmo id fazem a âncora cair sempre na primeira.
 */
export function headingId(title: string, ordem: number): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `secao-${ordem + 1}-${base}`;
}

/** Seções do post: os `h2` do corpo, na ordem, com a âncora de cada uma. */
export function sectionsFrom(md: string): { id: string; title: string }[] {
  return parseMarkdown(md)
    .filter((b) => b.type === "heading" && b.level === 2)
    .map((b, i) => {
      const title = inlineText((b as Extract<MdBlock, { type: "heading" }>).content);
      return { id: headingId(title, i), title };
    });
}

/** Minutos de leitura, arredondado para cima, mínimo 1. Base: 200 palavras/minuto. */
export function readingMinutes(md: string): number {
  const words = plainText(md).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * Pares de pergunta e resposta escritos no corpo do post, para emitir `FAQPage`.
 *
 * A FAQ do post é **dele**, não a da tabela `faq`. As perguntas de escopo global e
 * de destino já respondem em `/faq/<slug>`, em `/destinos/<slug>` e na single da
 * unidade (ADR-002): copiá-las para cá colocaria a mesma pergunta com a mesma
 * resposta numa quarta URL, que é a canibalização que o acervo já sofre. O post
 * pergunta o que só ele responde, e o schema sai do que está escrito nele.
 *
 * Três recortes, cada um por um motivo:
 *
 * 1. **Só `###`.** O `##` é seção do corpo, e a resposta dele se estende por vários
 *    parágrafos e tabelas. Recortar o primeiro parágrafo de uma seção entregaria ao
 *    Google um texto diferente do visível, que é schema inválido.
 * 2. **Só título terminado em `?`.** O acervo herdado usa `###` para numerar passo
 *    (`### **1. Reserve com Antecedência:**`), e sem esse filtro os 95 posts antigos
 *    emitiriam um `FAQPage` inventado, com "pergunta" que ninguém perguntou.
 * 3. **A resposta vai até o próximo bloco que não é prosa.** Parágrafo e lista
 *    entram; título, tabela, imagem, citação e linha param a leitura. É o que faz o
 *    `text` do `Answer` bater com o que o leitor vê embaixo da pergunta.
 *
 * Pergunta repetida fica na primeira ocorrência: `mainEntity` com duas `Question`
 * de mesmo `name` é erro no teste de resultados ricos.
 *
 * Atenção ao nível: o `parseMarkdown` normaliza a hierarquia (`normalizaTitulos`),
 * então o `###` que aqui interessa é o **renderizado**, não o que está no arquivo.
 * Num post que só tem `###`, eles sobem para `##` e viram seção, o que é a leitura
 * certa: sem `##` acima, aquelas perguntas são o primeiro nível do texto. Todo post
 * escrito pela skill abre as seções em `##`, então a FAQ dele cai em 3 e é lida.
 */
export function faqPairsFrom(md: string): { question: string; answer: string }[] {
  const blocks = parseMarkdown(md);
  const pares: { question: string; answer: string }[] = [];
  const vistas = new Set<string>();

  blocks.forEach((bloco, i) => {
    if (bloco.type !== "heading" || bloco.level !== 3) return;

    const question = inlineText(bloco.content).replace(/\s+/g, " ").trim();
    if (!question.endsWith("?")) return;

    const chave = question.toLocaleLowerCase("pt-BR");
    if (vistas.has(chave)) return;

    const resposta: string[] = [];
    for (let j = i + 1; j < blocks.length; j++) {
      const seguinte = blocks[j];
      if (seguinte.type === "paragraph") {
        resposta.push(inlineText(seguinte.content));
      } else if (seguinte.type === "list") {
        resposta.push(seguinte.items.map((item) => inlineText(item.content)).join(" "));
      } else {
        break;
      }
    }

    const answer = resposta.join(" ").replace(/\s+/g, " ").trim();
    if (!answer) return;

    vistas.add(chave);
    pares.push({ question, answer });
  });

  return pares;
}
