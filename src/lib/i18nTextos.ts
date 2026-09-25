/**
 * O texto da casca da página de destino em cada idioma.
 *
 * O conteúdo (intro, FAQ, post) mora no banco, nas tabelas `*_i18n`, porque muda por
 * edição editorial. A CASCA muda por deploy e é a mesma em toda página do tipo, então
 * mora aqui: cabeçalho de seção, rótulo de coluna, selo de tabela.
 *
 * Separar os dois importa na prática: a casca precisa existir nos três idiomas ANTES
 * de qualquer tradução de conteúdo, senão a primeira página traduzida sairia com
 * cabeçalho em português em volta de um texto em inglês, que é pior que não ter
 * página nenhuma.
 *
 * As frases carregam o nome do destino porque é assim que a consulta é digitada:
 * "airport parking guarulhos", e não "parking" solto.
 */

import type { Locale } from "./i18n";

export type Textos = {
  /** H1 da página de destino. */
  h1: (destino: string) => string;
  /** H2 da lista de unidades. Recebe o rótulo do destino. */
  listaDeEstacionamentos: (destino: string) => string;
  precoHeading: (destino: string) => string;
  distanciaHeading: (destino: string) => string;
  trasladoHeading: (destino: string) => string;
  ondeFicaHeading: (destino: string) => string;
  faqHeading: (destino: string) => string;
  leiaTambem: (destino: string) => string;
  outrosDestinos: string;
  perguntasGerais: string;

  /** Tabela de preços. */
  colunaEstacionamento: string;
  duracao: (dias: number) => string;
  porDiaria: string;
  melhorPreco: string;
  menorOnline: (pct: number) => string;
  precoBalcao: string;
  conferidoEm: string;
  tabelaCompleta: string;
  comoApuramos: string;
  verNaPagina: string;
  entradaMinima: (dias: number) => string;

  /** Distância. */
  distanciaIntro: string;
  semReservaOnline: string;
  doTerminal: string;

  /** Aviso de tradução parcial. */
  traducaoParcial: string;
};

const PT: Textos = {
  h1: (d) => `Estacionamento ${d}`,
  listaDeEstacionamentos: (d) => `Estacionamentos ${d}`,
  precoHeading: (d) => `Quanto custa estacionar no ${d}`,
  distanciaHeading: (d) => `Distância até o terminal do ${d}`,
  trasladoHeading: (d) => `Traslado até o ${d}`,
  ondeFicaHeading: (d) => `Onde fica o ${d}`,
  faqHeading: (d) => `Perguntas frequentes: estacionamento ${d}`,
  leiaTambem: (d) => `Leia também sobre ${d}`,
  outrosDestinos: "Estacionamento em outros destinos",
  perguntasGerais: "Perguntas gerais sobre reservar pela Movepark",
  colunaEstacionamento: "Estacionamento",
  duracao: (n) => (n === 1 ? "1 diária" : `${n} diárias`),
  porDiaria: "por diária",
  melhorPreco: "Melhor preço",
  menorOnline: (p) => `${p}% menor online`,
  precoBalcao: "Preço riscado: balcão do estacionamento, sem reserva.",
  conferidoEm: "Conferido no motor de reservas em",
  tabelaCompleta: "Ver a tabela completa de preços",
  comoApuramos: "Como a Movepark apura preço e distância",
  verNaPagina: "ver na página",
  entradaMinima: (n) => `entrada a partir de ${n} diárias`,
  distanciaIntro:
    "Medimos a distância a partir das coordenadas de cada endereço. Nenhum número desta lista é declarado pelo estacionamento.",
  semReservaOnline: "sem reserva online",
  doTerminal: "do terminal",
  traducaoParcial: "",
};

const EN: Textos = {
  h1: (d) => `${d} parking`,
  listaDeEstacionamentos: (d) => `${d} parking lots`,
  precoHeading: (d) => `How much does parking at ${d} cost`,
  distanciaHeading: (d) => `Distance from ${d} terminal`,
  trasladoHeading: (d) => `Shuttle to ${d}`,
  ondeFicaHeading: (d) => `Where ${d} is`,
  faqHeading: (d) => `Frequently asked questions: ${d} parking`,
  leiaTambem: (d) => `More about ${d}`,
  outrosDestinos: "Parking at other airports",
  perguntasGerais: "General questions about booking with Movepark",
  colunaEstacionamento: "Parking lot",
  duracao: (n) => (n === 1 ? "1 day" : `${n} days`),
  porDiaria: "per day",
  melhorPreco: "Best price",
  menorOnline: (p) => `${p}% cheaper online`,
  precoBalcao: "Struck-through price: the lot's walk-in rate, without a booking.",
  conferidoEm: "Checked against the booking engine on",
  tabelaCompleta: "See the full price table",
  comoApuramos: "How Movepark sources price and distance",
  verNaPagina: "see on the lot page",
  entradaMinima: (n) => `minimum stay of ${n} days`,
  distanciaIntro:
    "We measure distance from each address's coordinates. No number on this list is self-reported by the parking lot.",
  semReservaOnline: "no online booking",
  doTerminal: "from the terminal",
  // Só aparece quando parte do conteúdo ainda não foi traduzida. Dizer isso é melhor
  // que servir português no meio do inglês sem avisar.
  traducaoParcial:
    "Some answers on this page are still only available in Portuguese. Prices and distances are the same in every language.",
};

const ES: Textos = {
  h1: (d) => `Estacionamiento ${d}`,
  listaDeEstacionamentos: (d) => `Estacionamientos ${d}`,
  precoHeading: (d) => `Cuánto cuesta estacionar en ${d}`,
  distanciaHeading: (d) => `Distancia hasta la terminal de ${d}`,
  trasladoHeading: (d) => `Traslado a ${d}`,
  ondeFicaHeading: (d) => `Dónde queda ${d}`,
  faqHeading: (d) => `Preguntas frecuentes: estacionamiento ${d}`,
  leiaTambem: (d) => `Más sobre ${d}`,
  outrosDestinos: "Estacionamiento en otros aeropuertos",
  perguntasGerais: "Preguntas generales sobre reservar con Movepark",
  colunaEstacionamento: "Estacionamiento",
  duracao: (n) => (n === 1 ? "1 día" : `${n} días`),
  porDiaria: "por día",
  melhorPreco: "Mejor precio",
  menorOnline: (p) => `${p}% más barato en línea`,
  precoBalcao: "Precio tachado: tarifa de mostrador del estacionamiento, sin reserva.",
  conferidoEm: "Verificado en el motor de reservas el",
  tabelaCompleta: "Ver la tabla completa de precios",
  comoApuramos: "Cómo Movepark obtiene precio y distancia",
  verNaPagina: "ver en la página",
  entradaMinima: (n) => `estadía mínima de ${n} días`,
  distanciaIntro:
    "Medimos la distancia a partir de las coordenadas de cada dirección. Ningún número de esta lista lo declara el estacionamiento.",
  semReservaOnline: "sin reserva en línea",
  doTerminal: "de la terminal",
  traducaoParcial:
    "Algunas respuestas de esta página todavía están solo en portugués. Los precios y las distancias son los mismos en todos los idiomas.",
};

const POR_LOCALE: Record<Locale, Textos> = { "pt-BR": PT, en: EN, es: ES };

export function textos(locale: Locale): Textos {
  return POR_LOCALE[locale];
}
