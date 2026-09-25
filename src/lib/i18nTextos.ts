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

  /** Tabela de preços, rótulos que faltavam. */
  diariaMaisBarata: string;
  mostrarPrecoDe: string;
  totalDoPeriodo: (pesquisado: boolean) => string;
  semReservaPesquisado: string;
  naoPesquisado: string;
  porDiariaColuna: string;
  /** Cabeçalho da coluna de total do período. O "Total" distingue da coluna por diária. */
  totalDuracao: (dias: number) => string;
  /** Resposta rápida: "1 diária: a partir de X no Y (Z, W por diária)". */
  aPartirDe: (a: { duracao: string; valor: string; onde: string; vaga: string; porDia?: string }) => string;
  /** Queda do preço por permanência. A ordem da frase muda por idioma. */
  quedaPorPermanencia: (a: { onde: string; de: string; para: string; pct: number; deDias: number; paraDias: number }) => string;

  /** Distância. */
  distanciaIntro: string;
  semReservaOnline: string;
  doTerminal: string;

  /** CTAs e casca compartilhada (topbar, rodapé). */
  verTodosEDatas: string;
  verListaDaRegiao: string;
  verTodasPerguntas: string;
  verTodosArtigos: string;
  buscarVaga: string;
  irParaHome: string;
  maisBuscados: string;
  menuDaConta: string;
  verTodosDestinos: string;
  duvidasRodape: string;
  verPerguntasFrequentes: string;
  rodapeCta: string;
  escolhaDuracao: (soPesquisa: boolean) => string;
  trilhaInicio: string;
  trilhaEstacionamentos: string;
  /** Rótulo embaixo do preço do card: diz a duração exata em que a diária vale. */
  rotuloDaDiaria: (dias: number) => string;
  vagasEmParceiros: (vagas: number, locais: number) => string;
  legendaTabela: (soPesquisa: boolean) => string;
  avisoPesquisado: string;
  distanciaIntroLonga: string;

  /** Estatísticas do hero e nota de rodapé da tabela. */
  comReservaOnline: (n: number) => string;
  mapeadosNaRegiao: (n: number) => string;
  maisPerto: (dist: string) => string;
  semReservaPorAqui: string;
  notaEntradaMinima: string;

  /** Hero: rótulos da ficha e do destaque. */
  aPartirDeRotulo: string;
  sufixoDiaria: string;
  verVagas: string;
  verALista: string;
  terminal: (n: number) => string;
  comReservaOnlineRotulo: string;
  mapeadosRotulo: string;
  parceiroMaisPertoRotulo: string;
  maisPertoRotulo: string;
  diariaAPartirDeRotulo: string;

  /** Bloco de traslado. */
  trasladoEyebrow: string;
  trasladoIntro: string;
  trasladoPassos: { t: string; d: string }[];

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
  diariaMaisBarata: "Diária mais barata:",
  mostrarPrecoDe: "Mostrar preço de",
  totalDoPeriodo: (p) => (p ? "Total do período, preço pesquisado" : "Total do período, com reserva online"),
  semReservaPesquisado: "Sem reserva online, preço pesquisado por nós",
  naoPesquisado: "não pesquisado",
  porDiariaColuna: "Por diária",
  totalDuracao: (n) => `Total ${n === 1 ? "1 diária" : `${n} diárias`}`,
  aPartirDe: (a) =>
    `${a.duracao}: a partir de ${a.valor} no ${a.onde} (${a.vaga}${a.porDia ? `, ${a.porDia} por diária` : ""})`,
  quedaPorPermanencia: (a) =>
    `No ${a.onde}, a diária cai de ${a.de} para ${a.para} (${a.pct}% menos) quando a estadia vai de ${a.deDias} para ${a.paraDias} diárias.`,
  distanciaIntro:
    "Medimos a distância a partir das coordenadas de cada endereço. Nenhum número desta lista é declarado pelo estacionamento.",
  semReservaOnline: "sem reserva online",
  doTerminal: "do terminal",
  verTodosEDatas: "Ver todos e escolher datas →",
  verListaDaRegiao: "Ver a lista da região →",
  verTodasPerguntas: "Ver todas as perguntas na central →",
  verTodosArtigos: "Ver todos os artigos →",
  buscarVaga: "Buscar vaga",
  irParaHome: "Ir para a home",
  maisBuscados: "Mais buscados",
  menuDaConta: "Menu da conta",
  verTodosDestinos: "Ver todos os destinos",
  duvidasRodape: "Dúvidas sobre estacionamento de aeroporto?",
  verPerguntasFrequentes: "Ver perguntas frequentes",
  rotuloDaDiaria: (d) => (d > 1 ? `por diária na estadia de ${d} dias` : "por diária"),
  escolhaDuracao: (p) =>
    p
      ? "Escolha a duração da estadia e compare o total. Nenhum destes lotes reserva pela Movepark: os valores foram pesquisados por nós, com a data ao lado de cada linha."
      : "Escolha a duração da estadia e compare o total nas vagas com reserva online.",
  trilhaInicio: "Início",
  trilhaEstacionamentos: "Estacionamentos",
  rodapeCta: "Preços, traslado, cancelamento e check-in: as respostas estão na central.",
  vagasEmParceiros: (v, l) =>
    `${v} ${v === 1 ? "vaga" : "vagas"} em ${l} ${l === 1 ? "estacionamento parceiro" : "estacionamentos parceiros"}.`,
  legendaTabela: (p) =>
    p
      ? "Preço por duração nos estacionamentos da região, pesquisado por nós, total do período"
      : "Preço por duração nos estacionamentos com reserva online e, abaixo, nos lotes sem reserva, com preço pesquisado por nós",
  avisoPesquisado:
    'Onde diz "sem reserva online", o preço foi PESQUISADO por nós na data da linha, direto com o estacionamento. Não é oferta da Movepark e pode ter mudado.',
  distanciaIntroLonga:
    "Medimos a distância a partir das coordenadas de cada endereço. Nenhum número desta lista é declarado pelo estacionamento, e nos lotes sem reserva online a reserva é feita direto com eles.",
  comReservaOnline: (n) => `${n} estacionamento${n === 1 ? "" : "s"} com reserva online`,
  mapeadosNaRegiao: (n) => `${n} estacionamento${n === 1 ? "" : "s"} mapeado${n === 1 ? "" : "s"} na região`,
  maisPerto: (d) => `o parceiro mais perto fica a ${d}`,
  semReservaPorAqui: "ainda sem reserva online por aqui",
  notaEntradaMinima:
    "Onde aparece a entrada mínima, o parceiro só aceita estadias a partir daquele número de diárias.",
  aPartirDeRotulo: "A partir de",
  sufixoDiaria: "/ diária",
  verVagas: "Ver vagas",
  verALista: "Ver a lista",
  terminal: (n) => (n === 1 ? "Terminal" : "Terminais"),
  comReservaOnlineRotulo: "Com reserva online",
  mapeadosRotulo: "Mapeados na região",
  parceiroMaisPertoRotulo: "Parceiro mais perto",
  maisPertoRotulo: "Mais perto",
  diariaAPartirDeRotulo: "Diária a partir de",
  trasladoEyebrow: "O traslado",
  trasladoIntro:
    "Quem oferece traslado leva e traz você entre o estacionamento e o terminal. O tempo e a frequência ficam na página de cada estacionamento.",
  trasladoPassos: [
    { t: "Chegue e apresente o voucher", d: "Na portaria, o QR Code da reserva identifica você e a vaga." },
    { t: "A van leva você ao terminal", d: "O trajeto do estacionamento até o terminal é feito pela van da unidade." },
    { t: "Na volta, é só avisar", d: "Mande uma mensagem quando desembarcar e a van passa no ponto de encontro." },
  ],
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
  diariaMaisBarata: "Cheapest daily rate:",
  mostrarPrecoDe: "Show price for",
  totalDoPeriodo: (p) => (p ? "Total for the period, researched price" : "Total for the period, with online booking"),
  semReservaPesquisado: "No online booking, price researched by us",
  naoPesquisado: "not researched",
  porDiariaColuna: "Per day",
  totalDuracao: (n) => `Total ${n === 1 ? "1 day" : `${n} days`}`,
  aPartirDe: (a) =>
    `${a.duracao}: from ${a.valor} at ${a.onde} (${a.vaga}${a.porDia ? `, ${a.porDia} per day` : ""})`,
  quedaPorPermanencia: (a) =>
    `At ${a.onde}, the daily rate drops from ${a.de} to ${a.para} (${a.pct}% less) when the stay goes from ${a.deDias} to ${a.paraDias} days.`,
  distanciaIntro:
    "We measure distance from each address's coordinates. No number on this list is self-reported by the parking lot.",
  semReservaOnline: "no online booking",
  doTerminal: "from the terminal",
  verTodosEDatas: "See all and pick your dates →",
  verListaDaRegiao: "See the lots in the area →",
  verTodasPerguntas: "See every question in the help centre →",
  verTodosArtigos: "See all articles →",
  buscarVaga: "Find a spot",
  irParaHome: "Go to the home page",
  maisBuscados: "Most searched",
  menuDaConta: "Account menu",
  verTodosDestinos: "See all airports",
  duvidasRodape: "Questions about airport parking?",
  verPerguntasFrequentes: "See frequently asked questions",
  rotuloDaDiaria: (d) => (d > 1 ? `per day on a ${d}-day stay` : "per day"),
  escolhaDuracao: (p) =>
    p
      ? "Pick the length of stay and compare the total. None of these lots book through Movepark: we researched the figures, and each row carries its date."
      : "Pick the length of stay and compare the total across the spots with online booking.",
  trilhaInicio: "Home",
  trilhaEstacionamentos: "Airport parking",
  rodapeCta: "Prices, shuttle, cancellation and check-in: the answers are in the help centre.",
  vagasEmParceiros: (v, l) =>
    `${v} ${v === 1 ? "spot" : "spots"} across ${l} partner ${l === 1 ? "lot" : "lots"}.`,
  legendaTabela: (p) =>
    p
      ? "Price by length of stay across the lots in the area, researched by us, total for the period"
      : "Price by length of stay for the lots with online booking and, below, for the ones without, with the price we researched",
  avisoPesquisado:
    'Where it says "no online booking", the price was RESEARCHED by us on the date shown, straight from the lot. It is not a Movepark offer and may have changed.',
  distanciaIntroLonga:
    "We measure distance from each address's coordinates. No number on this list is self-reported by the lot, and for the ones without online booking you book directly with them.",
  comReservaOnline: (n) => `${n} lot${n === 1 ? "" : "s"} with online booking`,
  mapeadosNaRegiao: (n) => `${n} lot${n === 1 ? "" : "s"} mapped in the area`,
  maisPerto: (d) => `the closest partner is ${d}`,
  semReservaPorAqui: "no online booking here yet",
  notaEntradaMinima:
    "Where a minimum stay is shown, the lot only takes bookings from that number of days up.",
  aPartirDeRotulo: "From",
  sufixoDiaria: "/ day",
  verVagas: "See spots",
  verALista: "See the list",
  terminal: (n) => (n === 1 ? "Terminal" : "Terminals"),
  comReservaOnlineRotulo: "With online booking",
  mapeadosRotulo: "Mapped in the area",
  parceiroMaisPertoRotulo: "Closest partner",
  maisPertoRotulo: "Closest",
  diariaAPartirDeRotulo: "Daily rate from",
  trasladoEyebrow: "The shuttle",
  trasladoIntro:
    "Lots that run a shuttle take you to the terminal and bring you back. Timing and frequency are on each lot's page.",
  trasladoPassos: [
    { t: "Arrive and show your voucher", d: "At the gate, the booking QR code identifies you and your spot." },
    { t: "The van takes you to the terminal", d: "The lot's own van covers the trip from the car park to the terminal." },
    { t: "On the way back, just message", d: "Send a message when you land and the van meets you at the pick-up point." },
  ],
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
  diariaMaisBarata: "Tarifa diaria más barata:",
  mostrarPrecoDe: "Mostrar precio de",
  totalDoPeriodo: (p) => (p ? "Total del período, precio investigado" : "Total del período, con reserva en línea"),
  semReservaPesquisado: "Sin reserva en línea, precio investigado por nosotros",
  naoPesquisado: "no investigado",
  porDiariaColuna: "Por día",
  totalDuracao: (n) => `Total ${n === 1 ? "1 día" : `${n} días`}`,
  aPartirDe: (a) =>
    `${a.duracao}: desde ${a.valor} en ${a.onde} (${a.vaga}${a.porDia ? `, ${a.porDia} por día` : ""})`,
  quedaPorPermanencia: (a) =>
    `En ${a.onde}, la tarifa diaria baja de ${a.de} a ${a.para} (${a.pct}% menos) cuando la estadía pasa de ${a.deDias} a ${a.paraDias} días.`,
  distanciaIntro:
    "Medimos la distancia a partir de las coordenadas de cada dirección. Ningún número de esta lista lo declara el estacionamiento.",
  semReservaOnline: "sin reserva en línea",
  doTerminal: "de la terminal",
  verTodosEDatas: "Ver todos y elegir fechas →",
  verListaDaRegiao: "Ver la lista de la zona →",
  verTodasPerguntas: "Ver todas las preguntas en el centro de ayuda →",
  verTodosArtigos: "Ver todos los artículos →",
  buscarVaga: "Buscar plaza",
  irParaHome: "Ir al inicio",
  maisBuscados: "Más buscados",
  menuDaConta: "Menú de la cuenta",
  verTodosDestinos: "Ver todos los aeropuertos",
  duvidasRodape: "¿Dudas sobre estacionamiento de aeropuerto?",
  verPerguntasFrequentes: "Ver preguntas frecuentes",
  rotuloDaDiaria: (d) => (d > 1 ? `por día en una estadía de ${d} días` : "por día"),
  escolhaDuracao: (p) =>
    p
      ? "Elige la duración de la estadía y compara el total. Ninguno de estos predios reserva por Movepark: investigamos los valores, y cada fila lleva su fecha."
      : "Elige la duración de la estadía y compara el total en las plazas con reserva en línea.",
  trilhaInicio: "Inicio",
  trilhaEstacionamentos: "Estacionamiento de aeropuerto",
  rodapeCta: "Precios, traslado, cancelación y check-in: las respuestas están en el centro de ayuda.",
  vagasEmParceiros: (v, l) =>
    `${v} ${v === 1 ? "plaza" : "plazas"} en ${l} ${l === 1 ? "estacionamiento socio" : "estacionamientos socios"}.`,
  legendaTabela: (p) =>
    p
      ? "Precio por duración en los estacionamientos de la zona, investigado por nosotros, total del período"
      : "Precio por duración en los estacionamientos con reserva en línea y, abajo, en los que no la tienen, con el precio que investigamos",
  avisoPesquisado:
    'Donde dice "sin reserva en línea", el precio lo INVESTIGAMOS nosotros en la fecha de la fila, directo con el estacionamiento. No es una oferta de Movepark y puede haber cambiado.',
  distanciaIntroLonga:
    "Medimos la distancia a partir de las coordenadas de cada dirección. Ningún número de esta lista lo declara el estacionamiento, y en los predios sin reserva en línea la reserva se hace directo con ellos.",
  comReservaOnline: (n) => `${n} estacionamiento${n === 1 ? "" : "s"} con reserva en línea`,
  mapeadosNaRegiao: (n) => `${n} estacionamiento${n === 1 ? "" : "s"} mapeado${n === 1 ? "" : "s"} en la zona`,
  maisPerto: (d) => `el socio más cercano está a ${d}`,
  semReservaPorAqui: "todavía sin reserva en línea por aquí",
  notaEntradaMinima:
    "Donde aparece la estadía mínima, el estacionamiento solo acepta reservas a partir de esa cantidad de días.",
  aPartirDeRotulo: "Desde",
  sufixoDiaria: "/ día",
  verVagas: "Ver plazas",
  verALista: "Ver la lista",
  terminal: (n) => (n === 1 ? "Terminal" : "Terminales"),
  comReservaOnlineRotulo: "Con reserva en línea",
  mapeadosRotulo: "Mapeados en la zona",
  parceiroMaisPertoRotulo: "Socio más cercano",
  maisPertoRotulo: "Más cercano",
  diariaAPartirDeRotulo: "Tarifa diaria desde",
  trasladoEyebrow: "El traslado",
  trasladoIntro:
    "Los estacionamientos con traslado te llevan y te traen entre el predio y la terminal. El tiempo y la frecuencia están en la página de cada uno.",
  trasladoPassos: [
    { t: "Llega y muestra el voucher", d: "En la portería, el código QR de la reserva te identifica a ti y a la plaza." },
    { t: "La van te lleva a la terminal", d: "El trayecto del estacionamiento a la terminal lo hace la van del predio." },
    { t: "A la vuelta, solo avisa", d: "Manda un mensaje al aterrizar y la van pasa por el punto de encuentro." },
  ],
  traducaoParcial:
    "Algunas respuestas de esta página todavía están solo en portugués. Los precios y las distancias son los mismos en todos los idiomas.",
};

const POR_LOCALE: Record<Locale, Textos> = { "pt-BR": PT, en: EN, es: ES };

export function textos(locale: Locale): Textos {
  return POR_LOCALE[locale];
}
