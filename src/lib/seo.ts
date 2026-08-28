/**
 * Rótulos de SEO derivados do destino: uma fonte única para `<title>`, H1 e H2.
 *
 * Por que existe, medido no Search Console (export de 13/08/2026, 3 meses):
 *
 *   "estacionamento aeroporto <X>" colado ....... 647 cliques / 50.402 impressões
 *   "estacionamento <prep> aeroporto <X>" ....... 177 cliques / 14.061 impressões
 *   consulta contendo "aeroporto" ............... 40,6% dos cliques
 *
 * O título antigo quebrava o bigrama com duas preposições ("Estacionamento no Aeroporto de
 * Curitiba") e o H1 nem trazia a palavra "aeroporto" ("Estacionamento em Afonso Pena").
 * Aqui o rótulo já vem do banco na ordem em que as pessoas digitam, e estas funções só
 * montam as variações. Lógica pura, sem rede, para o teste travar a regressão.
 *
 * A regra de repetição importa tanto quanto a de correspondência: título e H1 usam a forma
 * exata, os H2 variam. Repetir o mesmo bigrama em toda a estrutura da página é sinal de
 * spam, não de relevância.
 */

/** O mínimo que estas funções precisam saber de um destino. */
export type SeoDestination = {
  seo_label?: string | null;
  short_name?: string | null;
  name: string;
  type?: string | null;
};

/**
 * Rótulo completo, com a variante secundária e o código: "Aeroporto Curitiba, Afonso Pena (CWB)".
 * Cai para `short_name` e depois `name` quando o destino ainda não tem rótulo escrito.
 */
export function seoLabel(d: SeoDestination): string {
  return d.seo_label?.trim() || d.short_name?.trim() || d.name;
}

/** Tira o código entre parênteses do fim: "Aeroporto Curitiba (CWB)" vira "Aeroporto Curitiba". */
function semCodigo(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Só a primeira forma de chamar o destino, sem a variante secundária e sem o código:
 * "Aeroporto Curitiba, Afonso Pena (CWB)" vira "Aeroporto Curitiba".
 *
 * É o que entra em título de unidade e em H2, onde o rótulo inteiro estouraria o tamanho.
 */
export function seoLabelPrimary(d: SeoDestination): string {
  return semCodigo(seoLabel(d)).split(",")[0].trim();
}

/** A primeira forma com o código de volta: "Aeroporto Curitiba (CWB)". */
export function seoLabelPrimaryWithCode(d: SeoDestination): string {
  const label = seoLabel(d);
  const codigo = label.match(/\(([^)]*)\)\s*$/)?.[0] ?? "";
  const primary = seoLabelPrimary(d);
  return codigo ? `${primary} ${codigo.trim()}` : primary;
}

/** `<title>` do destino: "Estacionamento Aeroporto Curitiba, Afonso Pena (CWB) | Movepark". */
export function destinationTitle(d: SeoDestination): string {
  return `Estacionamento ${seoLabel(d)} | Movepark`;
}

/**
 * H1 do destino: "Estacionamento Aeroporto Curitiba, Afonso Pena".
 * Sem o código, que já está no título e na trilha e só polui a leitura do cabeçalho.
 */
export function destinationHeading(d: SeoDestination): string {
  return `Estacionamento ${semCodigo(seoLabel(d))}`;
}

/** H2 da lista de unidades: "Estacionamentos Aeroporto Curitiba (CWB)". */
export function destinationListHeading(d: SeoDestination): string {
  return `Estacionamentos ${seoLabelPrimaryWithCode(d)}`;
}

/** Verdadeiro quando o destino é aeroporto, o que libera os H2 com artigo masculino. */
function ehAeroporto(d: SeoDestination): boolean {
  return d.type === "airport";
}

/**
 * H2 do bloco de traslado. Em aeroporto vira "Traslado até o Aeroporto Curitiba"; em
 * rodoviária ou bairro o artigo mudaria de gênero, então o texto genérico continua valendo.
 * Guardar a preposição no banco só para acertar isso seria caro para o que resolve.
 */
export function shuttleHeading(d: SeoDestination): string {
  return ehAeroporto(d) ? `Traslado até o ${seoLabelPrimary(d)}` : "Como funciona o traslado";
}

/** H2 do mapa. "onde fica o aeroporto de confins" tem 729 impressões e zero clique hoje. */
export function locationHeading(d: SeoDestination): string {
  return ehAeroporto(d) ? `Onde fica o ${seoLabelPrimary(d)}` : "Localização";
}

/** H2 da FAQ: "Perguntas frequentes: estacionamento Aeroporto Curitiba". */
export function faqHeading(d: SeoDestination): string {
  return `Perguntas frequentes: estacionamento ${seoLabelPrimary(d)}`;
}

/** H2 do bloco de melhores notas. Aqui a preposição fica, porque a frase é corrida. */
export function topRatedHeading(d: SeoDestination): string {
  return `Mais bem avaliados no ${seoLabelPrimary(d)}`;
}

/**
 * H2 da tabela de preços. Casa com a consulta como ela é digitada ("quanto custa
 * estacionar no aeroporto de viracopos"), que é a de maior intenção comercial da
 * página e a que o comparador concorrente responde em tabela.
 */
export function priceHeading(d: SeoDestination): string {
  return ehAeroporto(d)
    ? `Quanto custa estacionar no ${seoLabelPrimary(d)}`
    : `Quanto custa estacionar em ${seoLabelPrimary(d)}`;
}

/**
 * H2 do ranking de distância. Em aeroporto a âncora é o terminal, que é o que a
 * pessoa quer alcançar; nos demais destinos o ponto de referência é o próprio
 * destino, e "terminal" seria mentira.
 */
export function proximityHeading(d: SeoDestination): string {
  return ehAeroporto(d)
    ? `Distância até o terminal do ${seoLabelPrimary(d)}`
    : `Distância até ${seoLabelPrimary(d)}`;
}

/** Sufixo da distância na lista: "328 m do terminal" em aeroporto e rodoviária. */
export function proximityAnchorLabel(d: SeoDestination): string | null {
  return d.type === "airport" || d.type === "bus_terminal" ? "do terminal" : null;
}

/**
 * `<title>` da unidade: "Abbapark: Estacionamento Aeroporto Curitiba, Vaga Coberta | Movepark".
 *
 * A marca vem primeiro porque consulta de marca de parceiro vale 785 cliques e 114.327
 * impressões no período, o maior bloco isolado da demanda, e o título antigo ("Vaga Coberta ·
 * Aeroporto Afonso Pena") não trazia a marca em lugar nenhum. O tipo de vaga fecha a frase e
 * é o que diferencia as três páginas da mesma unidade.
 */
export function listingTitle(args: {
  publicName?: string | null;
  companyName: string;
  /** Aceito e ignorado: o mesmo objeto alimenta a descrição, que usa o tipo de vaga. */
  parkingTypeName?: string | null;
  destination?: SeoDestination | null;
  locationName: string;
}): string {
  return `${nomeDaFicha(args)} | Movepark`;
}

/**
 * O nome canônico da ficha: "{marca} - Estacionamento {destino}".
 *
 * Sai de `location.public_name`, escrito e revisado no banco. A composição aqui é o plano B
 * para unidade que ainda não foi nomeada, e usa a mesma fórmula, para as duas nunca
 * divergirem na tela.
 */
export function nomeDaFicha(args: {
  publicName?: string | null;
  companyName: string;
  parkingTypeName?: string | null;
  destination?: SeoDestination | null;
  locationName: string;
}): string {
  if (args.publicName?.trim()) return args.publicName.trim();
  const lugar = args.destination ? seoLabelPrimary(args.destination) : args.locationName;
  return `${args.companyName} - Estacionamento ${lugar}`;
}

/**
 * H1 da unidade: "Abbapark · Vaga Coberta · Aeroporto Curitiba".
 *
 * O separador evita o artigo, que mudaria de gênero em destino que não é aeroporto, e o tipo
 * de vaga no meio é o que faz as três páginas da mesma unidade deixarem de ter H1 idêntico.
 */
export function listingHeading(args: {
  publicName?: string | null;
  companyName: string;
  parkingTypeName?: string | null;
  destination?: SeoDestination | null;
  locationName: string;
}): string {
  return nomeDaFicha(args);
}

/** Meta description da unidade, usada quando não existe resumo escrito para ela. */
export function listingDescription(args: {
  companyName: string;
  parkingTypeName: string;
  destination?: SeoDestination | null;
  locationName: string;
  city?: string | null;
}): string {
  const lugar = args.destination ? seoLabelPrimary(args.destination) : args.locationName;
  const onde = args.city ? `${lugar}, ${args.city}` : lugar;
  return `${args.parkingTypeName} no ${args.companyName}. Estacionamento ${onde}. Reserve pela Movepark.`;
}
