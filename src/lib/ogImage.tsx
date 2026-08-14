import { Helmet } from "react-helmet-async";
import { optimizedImageUrl } from "@/lib/storage";

/**
 * Imagem do card de compartilhamento (og:image).
 *
 * Existe porque, até 14/08/2026, só a home declarava `og:image`, e apontava para
 * `/og/home.jpg`, arquivo que nunca foi commitado: o card da home ia para o
 * WhatsApp com 404 no lugar da imagem. Todo o resto (`/destinos`, `/precos`,
 * `/search`, `/faq`, `/blog`, ficha de lote, e destino sem hero) compartilhava sem
 * imagem nenhuma.
 *
 * A regra é um DEFAULT no shell do consumer, que cada página sobrescreve quando
 * tem imagem própria (o destino usa a hero dele, a unidade usa a foto dela). O
 * `react-helmet-async` deduplica `<meta>` por `property`, então a instância mais
 * profunda vence, e o card nunca fica com duas `og:image`.
 *
 * As imagens moram no Storage e são servidas pelo `render/image`, igual às heroes:
 * o recorte 1200x630 (1.91:1, o que Facebook e WhatsApp usam) fica garantido pelo
 * endpoint, mesmo que alguém troque o arquivo de origem por um de outra proporção.
 * E o endpoint entrega JPEG para quem não pede WebP, que é o caso do robô do
 * WhatsApp.
 *
 * Imagem nova entra com uma linha em `docs/procedencia-imagens.md`, no mesmo
 * commit: é lá que mora de onde ela veio e sob qual licença.
 */

const BUCKET = "https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/og";

/**
 * Quatro imagens, não uma por rota: nove arquivos viram nove coisas para manter
 * desalinhadas, e estas áreas se resolvem em quatro ideias visuais.
 */
export const OG_FALLBACK = {
  /** Marca. Home, institucional, e qualquer rota sem imagem própria. */
  marca: `${BUCKET}/marca-70c1657.jpg`,
  /**
   * Índice de destinos, e só ele.
   *
   * Paisagem de aeroporto afirma geografia, então esta é deliberadamente sem
   * litoral, serra ou skyline: a primeira versão tinha praia, e como destino sem
   * hero caía aqui, o card de Goiânia (a 800 km do mar) mostrava mar. Destino sem
   * hero passou a usar `marca`, que não afirma lugar nenhum.
   *
   * Os aviões são brancos SEM pintura por exigência do prompt: numa geração
   * anterior o modelo colocou livery da Delta e da United, com título na fuselagem.
   * Marca de terceiro num asset de marketing sugere associação que não existe. Ao
   * regerar esta imagem, confira as caudas com zoom antes de subir.
   */
  destinos: `${BUCKET}/destinos-b78e562.jpg`,
  /** Índice de preços e a página de preço por destino. */
  precos: `${BUCKET}/precos-54ed7ac.jpg`,
  /** FAQ e blog. */
  conteudo: `${BUCKET}/conteudo-c449e02.jpg`,
} as const;

export type OgArea = keyof typeof OG_FALLBACK;

/** URL final, já com o recorte que o card espera. */
export function ogImageUrl(area: OgArea) {
  // A entrada é uma const do bucket, nunca vazia, então o `undefined` do
  // `optimizedImageUrl` (que existe para url nula) não acontece aqui.
  return optimizedImageUrl(OG_FALLBACK[area], { width: 1200, height: 630, resize: "cover" }) ?? OG_FALLBACK[area];
}

/**
 * Declara a `og:image` de uma área.
 *
 * A ficha do lote mapeado usa `marca` de propósito, NUNCA foto do pátio: o ADR-010
 * e o `ProspectCard` são explícitos que foto do lote numa página que não vende é o
 * que faz o dono pedir para sair, e a foto do site dele é obra de terceiro. Um card
 * de compartilhamento com a foto dele reintroduziria pela porta dos fundos o que a
 * página inteira evita.
 */
export function OgImage({ area, alt }: { area: OgArea; alt?: string }) {
  const url = ogImageUrl(area);
  return (
    <Helmet>
      <meta property="og:image" content={url} />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={alt ?? "Movepark, estacionamento em aeroportos"} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={url} />
    </Helmet>
  );
}
