/**
 * Quatro posts de rede social recortados de um artigo do blog.
 *
 * A premissa da atividade é que o Instagram distribui o conteúdo do blog, e não
 * que ele produz conteúdo próprio. Isso muda a natureza do problema: não é
 * geração, é **recorte**. Um artigo escrito pela skill `blogpost-seo-geo` já
 * nasce com anatomia rígida (tabela de preço datada, H2 em forma de pergunta,
 * FAQ em `###` terminado em `?`, lista de checagem), e é essa anatomia que
 * define os quatro formatos aqui.
 *
 * A diferença prática de pedir a um modelo "leia 3.000 palavras e escreva 4
 * posts": o recorte **não inventa número**. Todo valor em R$ que sai daqui saiu
 * de uma célula de tabela do artigo, com a data de referência que o artigo
 * declara. Modelo generativo erra preço, e preço errado no Instagram é oferta
 * enganosa (CDC art. 30), não errata de conteúdo.
 *
 * Duas regras do projeto viram código, não instrução de prompt:
 *
 * - **ADR-009**: nenhum recorte pode prometer transação (vaga garantida,
 *   cancelamento grátis, preço fixo). Se a frase aparecer, o rascunho sai
 *   bloqueado, com o motivo, em vez de sair copiável.
 * - **Valor em R$ carrega data de referência.** Sem data no artigo, o rascunho
 *   de preço é bloqueado. Tarifa sem data vira promessa que o código não
 *   consegue retirar depois que virou print.
 *
 * O travessão é normalizado para " - " (regra de marca do `CLAUDE.md`), porque o
 * acervo herdado do WordPress está cheio deles e o recorte não pode reintroduzir
 * o que a marca proíbe.
 */
import { siteUrl } from "@/lib/site";
import {
  faqPairsFrom,
  inlineText,
  parseMarkdown,
  truncateAtBoundary,
  type MdBlock,
} from "./markdown.logic";

export type SocialFormat = "ancora-de-preco" | "pergunta" | "comparativo" | "checklist";

/** Um card do carrossel. O primeiro é a capa. */
export type SocialCard = {
  /** Linha pequena acima do título (aeroporto, data de referência). */
  eyebrow?: string;
  title: string;
  body?: string;
};

export type SocialDraft = {
  format: SocialFormat;
  /** Rótulo do formato na tela. */
  label: string;
  /** Onde no artigo o corte foi feito, para conferir na fonte. */
  source: string;
  cards: SocialCard[];
  caption: string;
  /** Texto alternativo da publicação, exigido por acessibilidade. */
  alt: string;
  /** Data que acompanha o valor em R$, quando o recorte carrega preço. */
  priceDate: string | null;
  /** Impede a publicação. Enquanto houver, o rascunho não é copiável. */
  blockers: string[];
  /** Merece olhar antes de publicar, mas não impede. */
  warnings: string[];
};

export type SocialGap = { format: SocialFormat; reason: string };

export type SocialDerivation = {
  drafts: SocialDraft[];
  /** Formato que o artigo não sustenta, com o motivo. */
  gaps: SocialGap[];
};

export type SocialSource = {
  title: string;
  slug: string;
  bodyMd: string;
  destinationName?: string | null;
  /** Nome curto do destino ("Afonso Pena"), que é o que vira hashtag. */
  destinationShortName?: string | null;
  destinationSlug?: string | null;
};

const ROTULO: Record<SocialFormat, string> = {
  "ancora-de-preco": "Âncora de preço",
  pergunta: "Pergunta da FAQ",
  comparativo: "Comparativo",
  checklist: "Checklist",
};

/**
 * Promessa de transação (ADR-009). O artigo já não pode prometer, então achar
 * uma dessas aqui significa que o artigo passou algo que a unidade não declara,
 * e o recorte não amplifica isso para o Instagram.
 */
const PROMESSAS: { termo: RegExp; rotulo: string }[] = [
  { termo: /vagas?\s+garantidas?/i, rotulo: "vaga garantida" },
  { termo: /cancelamento\s+(gr[áa]tis|gratuito|sem\s+custo)/i, rotulo: "cancelamento grátis" },
  { termo: /pre[çc]o\s+fixo/i, rotulo: "preço fixo" },
  { termo: /(melhor|menor)\s+pre[çc]o\s+garantido/i, rotulo: "melhor preço garantido" },
  { termo: /reserva\s+garantida/i, rotulo: "reserva garantida" },
  { termo: /satisfa[çc][ãa]o\s+garantida/i, rotulo: "satisfação garantida" },
];

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Instagram corta a legenda em 2.200 caracteres. */
const LIMITE_LEGENDA = 2200;
/** Título de card lido de relance, no celular, na fila do embarque. */
const LIMITE_TITULO = 70;
const LIMITE_CORPO = 180;
/** Capa mais cinco. O limite do Instagram é 10, mas ninguém desliza até lá. */
const MAX_CARDS = 6;

type TableBlock = Extract<MdBlock, { type: "table" }>;

/** Substitui travessão e traço por hífen com espaços (regra de marca). */
export function semTravessao(texto: string): string {
  return texto.replace(/\s*[—–]\s*/g, " - ");
}

function limpa(texto: string): string {
  return semTravessao(texto).replace(/\s+/g, " ").trim();
}

function cortaTitulo(texto: string): string {
  const limpo = limpa(texto);
  if (limpo.length <= LIMITE_TITULO) return limpo;
  // Fecha na oração, não no meio da palavra: card com reticência no meio de uma
  // frase parece erro de exportação, não escolha.
  const janela = limpo.slice(0, LIMITE_TITULO);
  const corte = Math.max(janela.lastIndexOf(", "), janela.lastIndexOf(": "));
  if (corte >= LIMITE_TITULO * 0.5) return janela.slice(0, corte).trim();
  return truncateAtBoundary(limpo, LIMITE_TITULO);
}

function temPreco(texto: string): boolean {
  return /R\$/.test(texto);
}

function tabelas(blocks: MdBlock[]): TableBlock[] {
  return blocks.filter((b): b is TableBlock => b.type === "table");
}

function textoDaTabela(t: TableBlock): string {
  const cabecalho = t.head.map(inlineText).join(" ");
  const corpo = t.rows.map((linha) => linha.map(inlineText).join(" ")).join(" ");
  return `${cabecalho} ${corpo}`;
}

/**
 * Data de referência do preço, do jeito que o artigo escreve.
 *
 * Duas formas aparecem no acervo: `27/08/2026` no cabeçalho da tabela e "em 27
 * de agosto de 2026" na prosa logo abaixo. As duas devolvem o formato curto,
 * que é o que cabe no card.
 */
export function dataDeReferencia(md: string): string | null {
  const numerica = md.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (numerica) return `${numerica[1]}/${numerica[2]}/${numerica[3]}`;

  const extenso = md.match(
    new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MESES.join("|")})\\s+de\\s+(\\d{4})\\b`, "i"),
  );
  if (!extenso) return null;

  const dia = extenso[1].padStart(2, "0");
  const mes = String(MESES.indexOf(extenso[2].toLowerCase()) + 1).padStart(2, "0");
  return `${dia}/${mes}/${extenso[3]}`;
}

function promessasEm(textos: string[]): string[] {
  const achadas = new Set<string>();
  for (const texto of textos) {
    for (const { termo, rotulo } of PROMESSAS) {
      if (termo.test(texto)) achadas.add(rotulo);
    }
  }
  return [...achadas];
}

/**
 * Hashtags do post, sem inventar tema que o artigo não tem.
 *
 * O destino entra como **uma** tag, montada do nome curto ("Afonso Pena" vira
 * `#afonsopena`). Quebrar o nome em palavras gerava `#afonso #pena`, duas tags
 * que ninguém segue e que não descrevem lugar nenhum.
 */
function hashtags(source: SocialSource): string {
  const base = ["#estacionamento", "#aeroporto", "#movepark"];
  const nome = source.destinationShortName || source.destinationName || "";
  const tag = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return (tag ? [...base, `#${tag}`] : base).join(" ");
}

function montaLegenda(
  gancho: string,
  apoio: string[],
  source: SocialSource,
  priceDate: string | null,
): string {
  const url = siteUrl(`/blog/${source.slug}/`);
  const linhas = [
    limpa(gancho),
    "",
    ...apoio.map(limpa).filter(Boolean),
    "",
    priceDate
      ? `Valores consultados em ${priceDate}. A tabela completa e a fonte de cada número estão no post: ${url}`
      : `O texto completo está no post: ${url}`,
    "",
    hashtags(source),
  ];
  return linhas
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Corta a legenda no limite do Instagram sem achatar as quebras de linha.
 *
 * O `truncateAtBoundary` normaliza espaço em branco e transformaria a legenda
 * inteira num parágrafo só, mesmo quando ela cabe. Aqui o corte é por linha:
 * entram as que couberem, e a última entra cortada na palavra.
 */
function legendaFinal(texto: string): string {
  if (texto.length <= LIMITE_LEGENDA) return texto;

  const linhas = texto.split("\n");
  const mantidas: string[] = [];
  let usado = 0;
  for (const linha of linhas) {
    const custo = linha.length + 1;
    if (usado + custo > LIMITE_LEGENDA) {
      const sobra = LIMITE_LEGENDA - usado;
      if (sobra > 40) mantidas.push(truncateAtBoundary(linha, sobra));
      break;
    }
    mantidas.push(linha);
    usado += custo;
  }
  return mantidas.join("\n").trim();
}

function montaDraft(
  format: SocialFormat,
  source: string,
  cards: SocialCard[],
  caption: string,
  alt: string,
  priceDate: string | null,
  labelOverride?: string,
): SocialDraft {
  const textos = [...cards.flatMap((c) => [c.eyebrow ?? "", c.title, c.body ?? ""]), caption, alt];
  const blockers = promessasEm(textos).map(
    (p) => `Promete transação ("${p}"), o que o ADR-009 não permite fora da unidade.`,
  );
  const warnings: string[] = [];

  const carregaPreco = textos.some(temPreco);
  if (carregaPreco && !priceDate) {
    blockers.push("Traz valor em R$ e o artigo não declara data de referência.");
  }

  const longos = cards.filter((c) => c.title.length > LIMITE_TITULO).length;
  if (longos) warnings.push(`${longos} título(s) acima de ${LIMITE_TITULO} caracteres.`);

  return {
    format,
    label: labelOverride ?? ROTULO[format],
    source,
    cards: cards.slice(0, MAX_CARDS),
    caption: legendaFinal(caption),
    alt: limpa(alt),
    priceDate,
    blockers,
    warnings,
  };
}

/**
 * 1. Âncora de preço.
 *
 * Sai da primeira tabela com R$. Nas âncoras do acervo essa é a "Resposta
 * rápida", de duas colunas, que já é um par rótulo/valor por linha: o formato
 * de card pronto. Numa tabela mais larga o corte usa a primeira e a última
 * coluna, que é rótulo e o valor da maior faixa.
 */
function ancoraDePreco(
  blocks: MdBlock[],
  source: SocialSource,
  priceDate: string | null,
): SocialDraft | SocialGap {
  const tabela = tabelas(blocks).find((t) => temPreco(textoDaTabela(t)));
  if (!tabela) {
    return { format: "ancora-de-preco", reason: "O artigo não tem tabela com valor em R$." };
  }

  const eyebrow = [source.destinationName, priceDate].filter(Boolean).join(", ") || undefined;
  const todas = tabela.rows
    .map((linha) => ({
      rotulo: limpa(inlineText(linha[0] ?? [])),
      valor: limpa(inlineText(linha[linha.length - 1] ?? [])),
    }))
    .filter((l) => l.rotulo && l.valor);

  // Só linha com valor em R$. A "Resposta rápida" mistura preço com distância e
  // contagem de pátios, e um card escrito "2 / Pátios parceiros" não é âncora de
  // preço: é sobra de tabela.
  const comPreco = todas.filter((l) => temPreco(l.valor));
  const linhas = comPreco.length ? comPreco : todas;
  const primeira = linhas[0];
  if (!primeira) {
    return { format: "ancora-de-preco", reason: "A tabela de preço não tem linha legível." };
  }

  const cards: SocialCard[] = [
    { eyebrow, title: primeira.valor, body: primeira.rotulo },
    ...linhas
      .filter((l) => l !== primeira)
      .slice(0, MAX_CARDS - 1)
      .map((l) => ({ eyebrow, title: cortaTitulo(l.valor), body: l.rotulo })),
  ];

  const caption = montaLegenda(
    `${primeira.rotulo}: ${primeira.valor}.`,
    [limpa(source.title) + "."],
    source,
    priceDate,
  );

  return montaDraft(
    "ancora-de-preco",
    'Primeira tabela com valor em R$ do artigo (nas âncoras, a "Resposta rápida")',
    cards,
    caption,
    `Card com ${primeira.rotulo.toLowerCase()} de ${primeira.valor}${
      priceDate ? ` em ${priceDate}` : ""
    }`,
    priceDate,
  );
}

/**
 * 2. Pergunta da FAQ.
 *
 * O `faqPairsFrom` é o mesmo extrator que emite o `FAQPage` da página, então a
 * pergunta que vira card é literalmente a que o Google já lê. Vale a primeira
 * cuja resposta cabe no card; se nenhuma couber, a mais curta, cortada.
 */
function perguntaDaFaq(source: SocialSource, priceDate: string | null): SocialDraft | SocialGap {
  const pares = faqPairsFrom(source.bodyMd);
  if (!pares.length) {
    return { format: "pergunta", reason: "O artigo não tem FAQ em ### terminado em ?." };
  }

  const cabe = pares.find((p) => limpa(p.answer).length <= LIMITE_CORPO * 2);
  const escolhido =
    cabe ?? [...pares].sort((a, b) => limpa(a.answer).length - limpa(b.answer).length)[0];

  const resposta = limpa(escolhido.answer);
  // A primeira frase responde sozinha (é assim que a skill manda escrever a FAQ),
  // então ela vira o título do card e o resto fica de apoio, em corpo menor.
  const corte = resposta.search(/[.!?]\s/);
  const abertura = corte > 0 ? resposta.slice(0, corte + 1) : resposta;
  const restante = corte > 0 ? resposta.slice(corte + 2).trim() : "";

  const cards: SocialCard[] = [
    { eyebrow: source.destinationName ?? undefined, title: cortaTitulo(escolhido.question) },
    {
      title: cortaTitulo(abertura),
      body: restante ? truncateAtBoundary(restante, LIMITE_CORPO) : undefined,
    },
  ];

  const carregaPreco = temPreco(resposta) || temPreco(escolhido.question);
  const dataDoCorte = carregaPreco ? priceDate : null;
  const caption = montaLegenda(limpa(escolhido.question), [resposta], source, dataDoCorte);

  return montaDraft(
    "pergunta",
    `FAQ do artigo, ${pares.length} pergunta(s) disponível(is)`,
    cards,
    caption,
    `Card com a pergunta "${limpa(escolhido.question)}"`,
    dataDoCorte,
  );
}

/**
 * 3. Comparativo.
 *
 * A tabela mais larga do artigo, uma linha por card. Comparação é o formato que
 * o Instagram salva, e é o que o artigo tem de mais difícil de reproduzir num
 * post concorrente.
 */
function comparativo(
  blocks: MdBlock[],
  source: SocialSource,
  priceDate: string | null,
): SocialDraft | SocialGap {
  const candidatas = tabelas(blocks).filter((t) => t.head.length >= 3 && t.rows.length >= 3);
  if (!candidatas.length) {
    return {
      format: "comparativo",
      reason: "Nenhuma tabela do artigo tem 3 colunas e 3 linhas.",
    };
  }

  const tabela = candidatas.reduce((maior, t) =>
    t.head.length * t.rows.length > maior.head.length * maior.rows.length ? t : maior,
  );
  const colunas = tabela.head.map((c) => limpa(inlineText(c)));
  const eyebrow = [source.destinationName, priceDate].filter(Boolean).join(", ") || undefined;

  const cards: SocialCard[] = [
    {
      eyebrow,
      title: cortaTitulo(colunas[0] || "Comparativo"),
      body: colunas.slice(1).join(" · "),
    },
    ...tabela.rows.slice(0, MAX_CARDS - 1).map((linha) => {
      const celulas = linha.map((c) => limpa(inlineText(c)));
      return {
        eyebrow,
        title: cortaTitulo(celulas[0] ?? ""),
        body: celulas
          .slice(1)
          .map((valor, i) => `${colunas[i + 1] ?? ""}: ${valor}`)
          .join(" · "),
      };
    }),
  ];

  const dataDoCorte = temPreco(textoDaTabela(tabela)) ? priceDate : null;
  const caption = montaLegenda(
    `${limpa(source.title)}.`,
    [`Comparativo por ${colunas.slice(1).join(", ")}.`],
    source,
    dataDoCorte,
  );

  return montaDraft(
    "comparativo",
    `Tabela de ${tabela.head.length} colunas e ${tabela.rows.length} linhas do artigo`,
    cards,
    caption,
    `Carrossel comparando ${tabela.rows.length} opções por ${colunas.slice(1).join(" e ")}`,
    dataDoCorte,
  );
}

/**
 * 4. Checklist.
 *
 * A maior lista do artigo. Sem lista boa, as seções em H2 servem: elas são o
 * roteiro do texto, e um card por seção entrega o mesmo "o que você precisa
 * saber" sem escrever uma linha nova.
 */
function checklist(
  blocks: MdBlock[],
  source: SocialSource,
  priceDate: string | null,
): SocialDraft | SocialGap {
  // Cinco itens, não três: no artigo do Afonso Pena a maior lista de três itens
  // era a das áreas do estacionamento oficial, e ela virava um "checklist" que
  // vendia o concorrente. Abaixo desse piso, as seções em H2 descrevem melhor o
  // que o post responde.
  const listas = blocks.filter(
    (b): b is Extract<MdBlock, { type: "list" }> => b.type === "list" && b.items.length >= 5,
  );
  const maior = listas.reduce<Extract<MdBlock, { type: "list" }> | null>(
    (acc, l) => (!acc || l.items.length > acc.items.length ? l : acc),
    null,
  );

  const itens = maior
    ? maior.items.map((i) => limpa(inlineText(i.content)))
    : blocks
        .filter((b) => b.type === "heading" && b.level === 2)
        .map((b) => limpa(inlineText((b as Extract<MdBlock, { type: "heading" }>).content)));

  if (itens.length < 3) {
    return { format: "checklist", reason: "O artigo não tem lista nem 3 seções em H2." };
  }

  const origem = maior
    ? `Maior lista do artigo, ${itens.length} itens`
    : `Seções em H2 do artigo, ${itens.length} no total`;
  const cards: SocialCard[] = [
    {
      eyebrow: source.destinationName ?? undefined,
      title: cortaTitulo(source.title),
      body: `${Math.min(itens.length, MAX_CARDS - 1)} pontos que o post detalha`,
    },
    ...itens.slice(0, MAX_CARDS - 1).map((item, i) => ({
      eyebrow: `${i + 1}`,
      title: cortaTitulo(item),
    })),
  ];

  const dataDoCorte = itens.some(temPreco) ? priceDate : null;
  const caption = montaLegenda(
    limpa(source.title) + ".",
    itens.slice(0, 5).map((i, n) => `${n + 1}. ${i}`),
    source,
    dataDoCorte,
  );

  return montaDraft(
    "checklist",
    origem,
    cards,
    caption,
    `Carrossel com ${Math.min(itens.length, MAX_CARDS - 1)} pontos sobre ${limpa(source.title)}`,
    dataDoCorte,
    maior ? undefined : "O que o post responde",
  );
}

function ehGap(v: SocialDraft | SocialGap): v is SocialGap {
  return "reason" in v;
}

/**
 * Recorta os quatro posts do artigo.
 *
 * O que o artigo não sustenta vira `gap` com o motivo, nunca card inventado: o
 * jeito de ter os quatro é o artigo ter a anatomia que a skill `blogpost-seo-geo`
 * exige, e não a derivação preencher buraco com texto novo.
 */
export function derivarPostsSociais(source: SocialSource): SocialDerivation {
  const blocks = parseMarkdown(source.bodyMd);
  const priceDate = dataDeReferencia(source.bodyMd);

  const resultados = [
    ancoraDePreco(blocks, source, priceDate),
    perguntaDaFaq(source, priceDate),
    comparativo(blocks, source, priceDate),
    checklist(blocks, source, priceDate),
  ];

  return {
    drafts: resultados.filter((r): r is SocialDraft => !ehGap(r)),
    gaps: resultados.filter(ehGap),
  };
}
