/**
 * As quatro marcas da casa, como dado.
 *
 * Fonte única da vitrine (`/grupo`), do `brand` no JSON-LD (`src/lib/jsonld.ts`) e do
 * gêmeo Markdown (`public/grupo.md`, preso a este arquivo por teste). Marca nova entra
 * aqui, não numa tela nova.
 *
 * **O estágio é campo obrigatório de propósito.** Produto anunciado sem estágio vira
 * promessa: quem lê assume que dá para contratar hoje. Ver docs/specs/grupo-movepark.md.
 */

export type Estagio = "no-ar" | "em-desenvolvimento";

export type Marca = {
  id: string;
  nome: string;
  /** Uma linha, o que a marca faz. É o que aparece embaixo do logo no mural. */
  resumo: string;
  /** O corpo do cartão, na ordem em que deve ser lido. */
  paragrafos: string[];
  estagio: Estagio;
  /** Frase curta ao lado do selo de estágio. */
  estagioDetalhe: string;
  /** Site próprio, quando existe. */
  url?: string;
  /** Cor da marca, usada no selo e no traço do cartão. Não é token: é identidade. */
  cor: string;
  acento: string;
};

export const MARCAS: Marca[] = [
  {
    id: "movepark-hub",
    nome: "Movepark Hub",
    resumo: "Reserva de vaga em estacionamento de aeroporto, com preço fechado na tela.",
    paragrafos: [
      "É a plataforma de reserva onde você está agora. Busca pelo destino, compara os estacionamentos parceiros, escolhe o tipo de vaga e paga online. O valor da tela é o valor da reserva, sem taxa na chegada.",
      "O pagamento é dividido na hora da compra entre a Movepark e o estacionamento. O parceiro recebe a parte dele direto do meio de pagamento, sem abrir conta em lugar nenhum e sem depender de repasse manual no fim do mês.",
      "Quem prefere resolver pelo WhatsApp fala com um assistente que entende o pedido, consulta o preço daquela unidade e devolve o link de pagamento na própria conversa.",
    ],
    estagio: "no-ar",
    estagioDetalhe: "Reserva e pagamento funcionando em todas as unidades parceiras.",
    cor: "#4041A3",
    acento: "#5D5FEF",
  },
  {
    id: "go2park",
    nome: "Go2Park",
    resumo: "A van do traslado no mapa, em tempo real, sem instalar nada.",
    paragrafos: [
      "A Go2Park mostra no mapa, em tempo real, a van que está indo buscar você. Não precisa instalar aplicativo nem criar conta: o link abre no navegador do celular e avisa quando a van se aproxima.",
      "Três estacionamentos parceiros já operam com ela: um no Aeroporto Afonso Pena, em Curitiba, e dois no Aeroporto de Viracopos, em Campinas. Nas páginas dessas unidades o rastreio aparece em destaque, porque nenhum vizinho de aeroporto oferece o mesmo.",
    ],
    estagio: "no-ar",
    estagioDetalhe: "Em três unidades com contrato.",
    url: "https://go2park.com.br",
    cor: "#1B5FFF",
    acento: "#A4E244",
  },
  {
    id: "go2med",
    nome: "Go2Med",
    resumo: "O mesmo rastreio da van, aplicado ao transporte de hospital.",
    paragrafos: [
      "A Go2Med leva o rastreio da Go2Park para o transporte de hospital. Paciente e família passam a ver onde está a van que vai buscá-lo, e a equipe acompanha a frota sem precisar ligar para o motorista a cada viagem.",
    ],
    estagio: "em-desenvolvimento",
    estagioDetalhe: "Ainda não está disponível para contratação.",
    cor: "#1B5FFF",
    acento: "#11B5A8",
  },
  {
    id: "coopark",
    nome: "Coopark",
    resumo: "Vaga mensal com demanda somada, para quem estaciona todo dia.",
    paragrafos: [
      "O Coopark é para quem estaciona todo dia no mesmo lugar. Ele junta quem procura vaga mensal na mesma região e leva essa demanda somada até os estacionamentos com vaga parada, o que abre espaço para um preço melhor do que o de quem negocia sozinho no balcão.",
    ],
    estagio: "em-desenvolvimento",
    estagioDetalhe: "Ainda não está disponível para contratação.",
    cor: "#29263F",
    acento: "#5D5FEF",
  },
];

export const ESTAGIO_ROTULO: Record<Estagio, string> = {
  "no-ar": "No ar",
  "em-desenvolvimento": "Em desenvolvimento",
};
