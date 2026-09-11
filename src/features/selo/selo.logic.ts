import { siteUrl } from "@/lib/site";

/**
 * Gerador do selo de parceiro.
 *
 * O selo é um bloco de HTML que o parceiro cola no rodapé do site dele, com um link
 * para a Movepark. O objetivo é backlink: link de domínio de terceiro que devolve
 * autoridade para `movepark.co`.
 *
 * Três decisões que não são estéticas:
 *
 * 1. **O link nunca é `nofollow`.** Um selo com `rel="nofollow"` não transfere nada e
 *    o esforço inteiro vira decoração. Em compensação, a âncora é sempre de marca
 *    ("Movepark"), nunca palavra-chave ("estacionamento barato em Confins"): rodapé
 *    repetido em N sites com âncora de palavra-chave é o padrão que o Google trata
 *    como esquema de links.
 * 2. **O estilo é inline, e não uma classe.** O selo vai cair dentro de CSS alheio
 *    (WordPress, Wix, tema de loja). Classe herda, inline não.
 * 3. **O texto do link é texto, não imagem.** Imagem com `alt` vale menos como âncora
 *    e some quando o CMS reescreve o caminho do arquivo.
 */

/** O que vem antes de "Movepark". Toda frase termina na marca, que é a âncora. */
export type FraseId = "parceiro" | "estacionamento" | "reserve" | "desenvolvido" | "feito";

/** Com caixa, sem caixa (só símbolo + texto) ou só o link de texto. */
export type Estilo = "caixa" | "simples" | "texto";

/** A cor do rodapé onde o selo vai morar. Decide o navy do símbolo e do texto. */
export type Fundo = "claro" | "escuro";

export type SeloOpcoes = {
  frase: FraseId;
  estilo: Estilo;
  fundo: Fundo;
  /** Nome do parceiro. Vira `utm_source`. Vazio = link sem UTM. */
  parceiro?: string;
};

type Frase = {
  id: FraseId;
  /** O que vem antes de "Movepark". */
  prefixo: string;
  /** Quando oferecer esta frase ao parceiro. Aparece na interface. */
  quando: string;
};

export const FRASES: Frase[] = [
  { id: "parceiro", prefixo: "Parceiro", quando: "Padrão. Serve para qualquer parceiro." },
  {
    id: "estacionamento",
    prefixo: "Estacionamento parceiro",
    quando: "Quando o rodapé tem espaço e você quer dizer do que se trata.",
  },
  {
    id: "reserve",
    prefixo: "Reserve pela",
    quando: "Quando o selo também serve de chamada para reserva.",
  },
  {
    id: "desenvolvido",
    prefixo: "Desenvolvido por",
    quando: "Só se a Movepark tiver feito o seu site.",
  },
  {
    id: "feito",
    prefixo: "Feito por",
    quando: "Mesma regra: só se a Movepark tiver feito o seu site.",
  },
];

export function textoDoSelo(frase: FraseId): string {
  const achada = FRASES.find((f) => f.id === frase) ?? FRASES[0];
  return `${achada.prefixo} Movepark`;
}

/**
 * Reduz o nome do parceiro ao que cabe num parâmetro de URL.
 *
 * Sem isso, "Estacionamento São João" viraria `utm_source=Estacionamento São João`, que
 * o navegador escapa e o relatório do analytics mostra como `Estacionamento%20S%C3%A3o`.
 */
export function slugificar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * O destino é sempre a home, e não uma página interna: é o domínio que precisa da
 * autoridade, e a home é a única URL que não muda quando o site é reorganizado.
 */
export function montarUrl(parceiro?: string): string {
  const base = siteUrl("/");
  const slug = slugificar(parceiro ?? "");
  if (!slug) return base;
  return `${base}?utm_source=${slug}&utm_medium=selo&utm_campaign=parceiros`;
}

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** O navy do símbolo vira branco sobre fundo escuro, senão os dois triângulos somem. */
function simbolo(fundo: Fundo): string {
  const navy = fundo === "escuro" ? "#FFFFFF" : "#29263F";
  return [
    '<svg width="20" height="13" viewBox="0 0 113 73" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="flex:none">',
    '<path d="M31.3281 72.2007H58.5883L112.091 0H84.8308L31.3281 72.2007Z" fill="#DA455E"/>',
    '<path d="M9.70703 72.2007H25.3143L78.7982 0H63.1909L9.70703 72.2007Z" fill="#A6DBDF"/>',
    `<path d="M0 72.2007H3.92435L57.4083 0H53.4839L0 72.2007Z" fill="${navy}"/>`,
    '<path d="M94.6281 23.553L84.8229 0L77.0117 47.3174L94.6281 23.553Z" fill="#AE374B"/>',
    `<path d="M112.088 0H84.8281V72.2007H112.088V0Z" fill="${navy}"/>`,
    "</svg>",
  ].join("");
}

function estiloDoLink(estilo: Estilo, fundo: Fundo): string {
  const cor = fundo === "escuro" ? "#FFFFFF" : "#29263F";
  const comum = `color:${cor};font-family:${FONTE};font-size:13px;line-height:1;text-decoration:none`;

  if (estilo === "texto") {
    return `${comum};font-weight:600`;
  }

  // Sobre escuro a moldura é transparente, e não navy: o rodapé do parceiro pode ser
  // preto, grafite ou uma foto, e um retângulo navy chapado apareceria como remendo.
  // Sobre claro o branco fica, porque aí ele é o que destaca o selo do cinza do rodapé.
  const caixa =
    fundo === "escuro"
      ? "border:1px solid rgba(255,255,255,0.24);background:transparent"
      : "border:1px solid #E6E6EA;background:#FFFFFF";

  const base = `display:inline-flex;align-items:center;gap:8px;white-space:nowrap;font-weight:500;${comum}`;
  return estilo === "caixa" ? `${base};padding:7px 12px;border-radius:10px;${caixa}` : base;
}

/**
 * Monta o HTML do selo.
 *
 * `opacity` no prefixo em vez de uma segunda cor: assim a mesma regra serve para fundo
 * claro e escuro sem um par de tokens por tema (5.6:1 sobre branco, 7.7:1 sobre navy).
 */
export function gerarSnippet(opcoes: SeloOpcoes): string {
  const { frase, estilo, fundo, parceiro } = opcoes;
  const url = montarUrl(parceiro);
  const prefixo = (FRASES.find((f) => f.id === frase) ?? FRASES[0]).prefixo;
  const rotulo = textoDoSelo(frase);

  const texto = `<span style="opacity:.72">${prefixo}</span> <strong style="font-weight:700">Movepark</strong>`;
  const interno = estilo === "texto" ? texto : `${simbolo(fundo)}<span>${texto}</span>`;

  return [
    "<!-- Selo Movepark -->",
    `<a href="${url}" target="_blank" rel="noopener" title="${rotulo}"`,
    `   style="${estiloDoLink(estilo, fundo)}">${interno}</a>`,
    "<!-- /Selo Movepark -->",
  ].join("\n");
}
