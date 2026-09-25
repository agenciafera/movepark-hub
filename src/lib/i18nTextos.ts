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
  // Página de uma pergunta (/faq/<slug> e equivalentes traduzidos).
  faqTrilha: string;
  postLeiaTambem: string;
  postNestaPagina: string;
  postVerResumo: string;
  postCtaTitulo: (destino: string) => string;
  postCtaTexto: string;
  postCtaBotao: string;
  postVoltar: string;
  postLeitura: (minutos: number) => string;
  // Página de um post do blog.
  postNaoEncontrado: string;
  postNaoEncontradoTexto: string;
  postVerTodos: string;
  postUltimos: string;
  feedTitulo: string;
  ogImageAlt: string;
  faqVerTodas: string;
  faqNaoEncontrada: string;
  faqNaoEncontradaTexto: string;
  faqComoEscolher: (aeroporto: string) => string;
  faqComoEscolherTexto: (aeroporto: string) => string;
  paginaDaPergunta: string;
  faqAtualizado: string;
  intlLocale: string;
  faqReservarEm: (destino: string) => string;
  faqBuscar: string;
  faqCompararPrecos: string;
  faqRespostaRapida: string;
  faqPrecoHeading: (aeroporto: string) => string;
  faqChecklist: (a: { semParceiro: boolean }) => string[];
  faqIntro: (destino: string | null) => string;
  faqPrecoLead: (a: { aeroporto: string; menor: string | null }) => string;
  faqPrecoFonte: string;
  faqPeriodo: string;
  faqTotalAPartirDe: string;
  faqPorDia: string;
  faqPorDiaUnidade: string;
  faqNoComparativo: (a: { unidades: number; parceiros: number }) => string;
  faqEstacionamentoCom: string;
  faqRedeTexto: (a: { unidades: number; destinos: number; menor: string | null }) => string;
  faqIndicePrecos: string;
  faqComoReservar: string;
  faqComoReservarTexto: string;
  faqOQueConferir: string;
  faqVerEstacionamentos: (destino: string) => string;
  faqCompararEm: (destino: string) => string;
  faqCompararOutros: string;
  faqRelacionadas: string;
  faqTodasPerguntas: string;
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
  faqTrilha: "Perguntas frequentes",
  postLeiaTambem: "Leia também",
  postNestaPagina: "Nesta página",
  postVerResumo: "Ver resumo",
  postCtaTitulo: (d) => `Vai viajar por ${d}?`,
  postCtaTexto: "Compare os estacionamentos parceiros e garanta sua vaga antes de sair de casa.",
  postCtaBotao: "Ver estacionamentos",
  postVoltar: "Voltar para o blog",
  postLeitura: (m) => `${m} min de leitura`,
  postNaoEncontrado: "Post não encontrado.",
  postNaoEncontradoTexto: "Ele pode ter saído do ar.",
  postVerTodos: "Ver todos os posts",
  postUltimos: "Últimos posts",
  feedTitulo: "Blog da Movepark",
  ogImageAlt: "Movepark, estacionamento em aeroportos",
  faqVerTodas: "Ver todas as perguntas",
  faqNaoEncontrada: "Pergunta não encontrada",
  faqNaoEncontradaTexto: "Essa pergunta não existe ou saiu do ar.",
  faqComoEscolher: (a) => `Como escolher o estacionamento no ${a}?`,
  faqComoEscolherTexto: (a) =>
    `Neste aeroporto a reserva é fechada direto com o estacionamento. A página do ${a} mapeia os da região, com endereço, telefone e avaliação do Google: cote dois ou três, compare o total do período e confirme o traslado antes de pagar.`,
  paginaDaPergunta: "Página desta pergunta",
  faqAtualizado: "Atualizado em",
  intlLocale: "pt-BR",
  faqReservarEm: (d) => `Reservar vaga em ${d}`,
  faqBuscar: "Buscar estacionamento",
  faqCompararPrecos: "Comparar preços",
  faqRespostaRapida: "Resposta rápida",
  faqPrecoHeading: (a) => `Quanto custa estacionar por período no ${a}?`,
  faqChecklist: (a) => (a.semParceiro ? [
    "Vaga coberta ou descoberta: a coberta protege de sol e chuva, a descoberta costuma ter a menor diária.",
    "Traslado até o terminal: confirme se está incluído e de quanto em quanto tempo sai.",
    "Distância até o terminal: os estacionamentos mapeados estão na página do aeroporto.",
    "Cancelamento e tolerância de horário: confirme a política na cotação, antes de pagar.",
  ] : [
    "Vaga coberta ou descoberta: a coberta protege de sol e chuva, a descoberta costuma ter a menor diária.",
    "Traslado até o terminal: confirme se está incluído e de quanto em quanto tempo sai.",
    "Distância e tempo até o embarque: estão na página de cada estacionamento.",
    "Cancelamento e tolerância de horário: a política aparece antes de fechar a reserva.",
  ]),
  faqIntro: (d) =>
    d
      ? `O que saber antes de escolher um estacionamento perto do ${d}.`
      : "O que saber antes de escolher um estacionamento de aeroporto.",
  faqPrecoLead: (a) =>
    a.menor
      ? `A diária nos estacionamentos parceiros perto do ${a.aeroporto} começa em ${a.menor}, e o valor por dia cai conforme a estadia.`
      : `O valor por dia cai conforme a estadia nos estacionamentos parceiros perto do ${a.aeroporto}.`,
  faqPrecoFonte: "Os preços saem do motor de reservas, os mesmos do checkout.",
  faqPeriodo: "Período",
  faqTotalAPartirDe: "Total a partir de",
  faqPorDia: "Por dia",
  faqPorDiaUnidade: "/dia",
  faqNoComparativo: (a) =>
    `${a.unidades} ${a.unidades === 1 ? "estacionamento" : "estacionamentos"} de ${a.parceiros} ${a.parceiros === 1 ? "parceiro" : "parceiros"} no comparativo.`,
  faqEstacionamentoCom: "Estacionamento de aeroporto com a Movepark",
  faqRedeTexto: (a) =>
    `São ${a.unidades} estacionamentos comparados em ${a.destinos} destinos${a.menor ? `, com diária a partir de ${a.menor}` : ""}. O preço mostrado é o preço final da reserva, sem taxa na chegada.`,
  faqIndicePrecos: "Ver o índice de preços",
  faqComoReservar: "Como reservar com a Movepark?",
  faqComoReservarTexto:
    "Você busca pelo aeroporto, compara preço, tipo de vaga e avaliação dos estacionamentos credenciados e reserva online, com o valor fechado antes de pagar. Na maioria das unidades o traslado até o terminal está incluído.",
  faqOQueConferir: "O que conferir antes de reservar?",
  faqVerEstacionamentos: (d) => `Ver estacionamentos em ${d}`,
  faqCompararEm: (d) => `Comparar preços em ${d}`,
  faqCompararOutros: "Comparar preços em outros aeroportos",
  faqRelacionadas: "Perguntas relacionadas",
  faqTodasPerguntas: "Todas as perguntas frequentes",
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
  faqTrilha: "FAQ",
  postLeiaTambem: "Read next",
  postNestaPagina: "On this page",
  postVerResumo: "See summary",
  postCtaTitulo: (d) => `Flying out of ${d}?`,
  postCtaTexto: "Compare partner parking lots and lock in your spot before you leave home.",
  postCtaBotao: "See parking",
  postVoltar: "Back to the blog",
  postLeitura: (m) => `${m} min read`,
  postNaoEncontrado: "Post not found.",
  postNaoEncontradoTexto: "It may have been taken down.",
  postVerTodos: "See all posts",
  postUltimos: "Latest posts",
  feedTitulo: "Movepark blog",
  ogImageAlt: "Movepark, airport parking",
  faqVerTodas: "See all questions",
  faqNaoEncontrada: "Question not found",
  faqNaoEncontradaTexto: "This question does not exist or is no longer published.",
  faqComoEscolher: (a) => `How to choose a parking lot at ${a}?`,
  faqComoEscolherTexto: (a) =>
    `At this airport the booking is made directly with the parking lot. The ${a} page maps the ones nearby, with address, phone and Google rating: get two or three quotes, compare the total for your dates and confirm the shuttle before you pay.`,
  paginaDaPergunta: "Read the full answer",
  faqAtualizado: "Updated on",
  intlLocale: "en-US",
  faqReservarEm: (d) => `Book a spot at ${d}`,
  faqBuscar: "Find parking",
  faqCompararPrecos: "Compare prices",
  faqRespostaRapida: "Quick answer",
  faqPrecoHeading: (a) => `How much does parking at ${a} cost by length of stay?`,
  faqChecklist: (a) => (a.semParceiro ? [
    "Covered or uncovered spot: covered shields the car from sun and rain, uncovered usually has the lowest daily rate.",
    "Shuttle to the terminal: check whether it is included and how often it runs.",
    "Distance to the terminal: the mapped parking lots are listed on the airport page.",
    "Cancellation and grace period: confirm the policy in the quote, before you pay.",
  ] : [
    "Covered or uncovered spot: covered shields the car from sun and rain, uncovered usually has the lowest daily rate.",
    "Shuttle to the terminal: check whether it is included and how often it runs.",
    "Distance and time to the gate: both are on each parking lot page.",
    "Cancellation and grace period: the policy is shown before you confirm the booking.",
  ]),
  faqIntro: (d) =>
    d
      ? `What to know before choosing a parking lot near ${d}.`
      : "What to know before choosing airport parking.",
  faqPrecoLead: (a) =>
    a.menor
      ? `The daily rate at partner parking lots near ${a.aeroporto} starts at ${a.menor}, and the per-day price drops the longer you stay.`
      : `The per-day price drops the longer you stay at partner parking lots near ${a.aeroporto}.`,
  faqPrecoFonte: "Prices come from the booking engine, the same ones shown at checkout.",
  faqPeriodo: "Length of stay",
  faqTotalAPartirDe: "Total from",
  faqPorDia: "Per day",
  faqPorDiaUnidade: "/day",
  faqNoComparativo: (a) =>
    `${a.unidades} parking ${a.unidades === 1 ? "lot" : "lots"} from ${a.parceiros} ${a.parceiros === 1 ? "partner" : "partners"} in the comparison.`,
  faqEstacionamentoCom: "Airport parking with Movepark",
  faqRedeTexto: (a) =>
    `${a.unidades} parking lots compared across ${a.destinos} destinations${a.menor ? `, with daily rates from ${a.menor}` : ""}. The price shown is the final booking price, with nothing extra to pay on arrival.`,
  faqIndicePrecos: "See the price index",
  faqComoReservar: "How to book with Movepark?",
  faqComoReservarTexto:
    "You search by airport, compare price, spot type and ratings across accredited parking lots, and book online with the final amount shown before you pay. Most lots include the shuttle to the terminal.",
  faqOQueConferir: "What to check before booking?",
  faqVerEstacionamentos: (d) => `See parking at ${d}`,
  faqCompararEm: (d) => `Compare prices at ${d}`,
  faqCompararOutros: "Compare prices at other airports",
  faqRelacionadas: "Related questions",
  faqTodasPerguntas: "All frequently asked questions",
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
  faqTrilha: "Preguntas frecuentes",
  postLeiaTambem: "Seguí leyendo",
  postNestaPagina: "En esta página",
  postVerResumo: "Ver resumen",
  postCtaTitulo: (d) => `¿Vas a viajar por ${d}?`,
  postCtaTexto: "Compará los estacionamientos asociados y asegurá tu plaza antes de salir de casa.",
  postCtaBotao: "Ver estacionamientos",
  postVoltar: "Volver al blog",
  postLeitura: (m) => `${m} min de lectura`,
  postNaoEncontrado: "Publicación no encontrada.",
  postNaoEncontradoTexto: "Puede que haya salido del aire.",
  postVerTodos: "Ver todas las publicaciones",
  postUltimos: "Últimas publicaciones",
  feedTitulo: "Blog de Movepark",
  ogImageAlt: "Movepark, estacionamiento en aeropuertos",
  faqVerTodas: "Ver todas las preguntas",
  faqNaoEncontrada: "Pregunta no encontrada",
  faqNaoEncontradaTexto: "Esta pregunta no existe o dejó de estar publicada.",
  faqComoEscolher: (a) => `¿Cómo elegir el estacionamiento en el ${a}?`,
  faqComoEscolherTexto: (a) =>
    `En este aeropuerto la reserva se cierra directamente con el estacionamiento. La página del ${a} mapea los de la zona, con dirección, teléfono y calificación de Google: pedí dos o tres cotizaciones, compará el total del período y confirmá el traslado antes de pagar.`,
  paginaDaPergunta: "Ver la respuesta completa",
  faqAtualizado: "Actualizado el",
  intlLocale: "es-ES",
  faqReservarEm: (d) => `Reservar plaza en ${d}`,
  faqBuscar: "Buscar estacionamiento",
  faqCompararPrecos: "Comparar precios",
  faqRespostaRapida: "Respuesta rápida",
  faqPrecoHeading: (a) => `¿Cuánto cuesta estacionar por período en el ${a}?`,
  faqChecklist: (a) => (a.semParceiro ? [
    "Plaza cubierta o descubierta: la cubierta protege del sol y la lluvia, la descubierta suele tener la tarifa diaria más baja.",
    "Traslado a la terminal: confirmá si está incluido y cada cuánto sale.",
    "Distancia a la terminal: los estacionamientos mapeados están en la página del aeropuerto.",
    "Cancelación y tolerancia de horario: confirmá la política en la cotización, antes de pagar.",
  ] : [
    "Plaza cubierta o descubierta: la cubierta protege del sol y la lluvia, la descubierta suele tener la tarifa diaria más baja.",
    "Traslado a la terminal: confirmá si está incluido y cada cuánto sale.",
    "Distancia y tiempo hasta el embarque: están en la página de cada estacionamiento.",
    "Cancelación y tolerancia de horario: la política aparece antes de cerrar la reserva.",
  ]),
  faqIntro: (d) =>
    d
      ? `Lo que conviene saber antes de elegir un estacionamiento cerca del ${d}.`
      : "Lo que conviene saber antes de elegir un estacionamiento de aeropuerto.",
  faqPrecoLead: (a) =>
    a.menor
      ? `La tarifa diaria en los estacionamientos asociados cerca del ${a.aeroporto} empieza en ${a.menor}, y el precio por día baja cuanto más larga es la estadía.`
      : `El precio por día baja cuanto más larga es la estadía en los estacionamientos asociados cerca del ${a.aeroporto}.`,
  faqPrecoFonte: "Los precios salen del motor de reservas, los mismos del checkout.",
  faqPeriodo: "Duración",
  faqTotalAPartirDe: "Total desde",
  faqPorDia: "Por día",
  faqPorDiaUnidade: "/día",
  faqNoComparativo: (a) =>
    `${a.unidades} ${a.unidades === 1 ? "estacionamiento" : "estacionamientos"} de ${a.parceiros} ${a.parceiros === 1 ? "socio" : "socios"} en la comparación.`,
  faqEstacionamentoCom: "Estacionamiento de aeropuerto con Movepark",
  faqRedeTexto: (a) =>
    `Son ${a.unidades} estacionamientos comparados en ${a.destinos} destinos${a.menor ? `, con tarifa diaria desde ${a.menor}` : ""}. El precio que ves es el precio final de la reserva, sin cargos al llegar.`,
  faqIndicePrecos: "Ver el índice de precios",
  faqComoReservar: "¿Cómo reservar con Movepark?",
  faqComoReservarTexto:
    "Buscás por aeropuerto, comparás precio, tipo de plaza y calificación de los estacionamientos acreditados y reservás en línea, con el importe cerrado antes de pagar. La mayoría incluye el traslado a la terminal.",
  faqOQueConferir: "¿Qué mirar antes de reservar?",
  faqVerEstacionamentos: (d) => `Ver estacionamientos en ${d}`,
  faqCompararEm: (d) => `Comparar precios en ${d}`,
  faqCompararOutros: "Comparar precios en otros aeropuertos",
  faqRelacionadas: "Preguntas relacionadas",
  faqTodasPerguntas: "Todas las preguntas frecuentes",
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
