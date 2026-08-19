/**
 * A jornada completa da /como-funciona: três momentos e sete passos.
 *
 * É a versão longa do que `copy.ts` (HOW_IT_WORKS) resume em três passos na home
 * e na /sobre. As duas convivem, mas não podem se contradizer: o resumo diz o QUE
 * acontece, esta lista diz COMO. Se um passo mudar aqui e o resumo continuar
 * prometendo outra coisa, quem lê as duas páginas pega a divergência antes da gente.
 *
 * Regra que vale para todo texto deste arquivo: promessa que depende da unidade
 * (traslado, valet, horário) entra qualificada, nunca como fato da plataforma.
 * Em 21/07/2026 a contagem era de 16 unidades com traslado em 28 vendáveis, e 12
 * delas nem ficam em aeroporto. `journey.contract.test.ts` guarda essa regra.
 */

export type JourneyStep = {
  /** Numeração contínua através dos três momentos: quem lê vê um fluxo só. */
  n: number;
  text: string;
};

export type JourneyMoment = {
  id: string;
  /** Rótulo do momento, na pílula acima do título. */
  label: string;
  title: string;
  lead: string;
  steps: JourneyStep[];
};

export const JOURNEY_HEADLINE = "Da busca à chave de volta na sua mão";

export const JOURNEY_LEAD =
  "São sete passos, e o único que acontece no aeroporto é mostrar o QR Code na portaria.";

export const JOURNEY: JourneyMoment[] = [
  {
    id: "antes-da-viagem",
    label: "Antes da viagem",
    title: "Escolha a vaga e feche o preço",
    lead: "Busque pelo aeroporto e pelas datas. Você vê o preço final, a distância até o terminal e o que cada estacionamento oferece antes de decidir.",
    steps: [
      { n: 1, text: "Informe o aeroporto e as datas da viagem." },
      {
        n: 2,
        text: "Compare vaga coberta e descoberta, com o preço final já calculado.",
      },
      {
        n: 3,
        text: "Escolha a Tarifa, pague por PIX ou cartão e receba o voucher na hora.",
      },
    ],
  },
  {
    id: "na-chegada",
    label: "Na chegada",
    title: "Mostre o QR Code e siga para o embarque",
    lead: "Sua reserva já está no sistema da portaria. Você não pega fila no balcão nem discute preço na hora.",
    steps: [
      {
        n: 4,
        text: "Chegue com folga e apresente o QR Code do voucher na portaria.",
      },
      {
        n: 5,
        text: "Deixe o carro na vaga reservada. Onde a unidade opera traslado, a van leva você e a bagagem até o terminal.",
      },
    ],
  },
  {
    id: "na-volta",
    label: "Na volta",
    title: "Pegue o carro no mesmo lugar",
    lead: "O contato da unidade está no seu comprovante. Você avisa que pousou e retira o carro pelo valor que já estava fechado.",
    steps: [
      { n: 6, text: "Ao desembarcar, avise a unidade pelo contato do comprovante." },
      {
        n: 7,
        text: "Retire o carro no mesmo lugar. Se você ficar mais dias, acerta a diferença direto com a unidade.",
      },
    ],
  },
];

/**
 * Sinais do hero. Números conferidos no banco em 17/08/2026 (projeto
 * mgaigbezdalbyuqiofcf): 18 unidades listadas, todas com `is_24h`, em 6
 * aeroportos distintos. Ao mexer, rode a contagem de novo: número sem lastro é
 * o que esta página não pode ter.
 */
export const JOURNEY_STATS = [
  { value: "2 min", label: "Da busca ao voucher no seu e-mail" },
  { value: "24h", label: "Entrada e saída a qualquer hora, inclusive feriado" },
  { value: "0%", label: "de taxa cobrada pela Movepark" },
];

/**
 * As três garantias, escritas a partir de `guarantee/copy.ts` (GUARANTEE_POLICY),
 * que é a regra operacional aprovada. Texto de garantia que promete mais do que
 * a política vira reclamação com razão.
 */
export const JOURNEY_GUARANTEES = [
  {
    icon: "seal" as const,
    title: "Vaga garantida",
    text: "Se faltar vaga na chegada, realocamos você em um parceiro próximo e cobrimos a diferença. Sem alternativa, devolvemos 100% do valor mais um crédito pelo transtorno.",
  },
  {
    icon: "lock" as const,
    title: "Preço fechado",
    text: "O valor confirmado na reserva é o que você paga. Sem cobrança extra na saída e sem tabela de alta temporada depois que a reserva está de pé.",
  },
  {
    icon: "headset" as const,
    title: "Suporte na viagem",
    text: "Atraso, mudança de data ou imprevisto: nosso time acompanha e resolve junto com a unidade.",
  },
];

/** Com reserva x chegando no balcão. Uma linha por atrito que a reserva remove. */
/**
 * "Cancelamento" só entra na tela quando alguém a busca pela `k` já filtrada
 * pela capacidade real da unidade (`calculadora.tsx`, `LINHAS_QUALITATIVAS`,
 * ADR-009). Na tabela incondicional de `/como-funciona`, sem unidade em mãos
 * para checar, essa linha é excluída na renderização (ver `ComoFuncionaPage`).
 */
export const JOURNEY_COMPARISON = [
  { k: "Preço", mp: "Comparado entre parceiros antes de decidir", other: "Só sabe chegando" },
  { k: "Vaga", mp: "Reservada com o parceiro escolhido", other: "Sujeita a lotação" },
  {
    k: "Chegada",
    mp: "Reserva já combinada com a unidade",
    other: "Fila no balcão e cadastro na hora",
  },
  { k: "Cancelamento", mp: "Grátis, conforme a Tarifa", other: "Não se aplica" },
  { k: "Taxa da Movepark", mp: "Nenhuma", other: "Não se aplica" },
  { k: "Imprevisto", mp: "Suporte Movepark ajuda a resolver", other: "Direto com o estacionamento" },
];

/**
 * FAQ da página. As respostas de cancelamento e diária extra são as mesmas de
 * `content/pages.ts`, que já passaram por revisão: repetir a redação aprovada é
 * melhor do que escrever uma variação que diverge no detalhe.
 */
export const JOURNEY_FAQ = [
  {
    q: "Com quanta antecedência devo chegar?",
    a: "Some o tempo do trajeto até o terminal ao que você já separa para o check-in do voo. Onde a unidade opera traslado, a página dela mostra a frequência da van e o tempo médio até o terminal.",
  },
  {
    q: "Preciso imprimir o voucher?",
    a: "Não. O QR Code no celular é suficiente. Mas você pode imprimir se preferir.",
  },
  {
    q: "O traslado é gratuito?",
    a: "Depende da unidade. Nem todo estacionamento parceiro opera traslado, e quem opera informa a frequência e o tempo até o terminal na própria página. O que estiver lá é o que vale para a sua reserva.",
  },
  {
    q: "Meu voo atrasou. Perco a vaga?",
    a: "Avise a unidade pelo contato do comprovante assim que possível. Em dúvida, fale com o suporte: a gente ajuda a resolver com o parceiro.",
  },
  {
    q: "Posso cancelar se mudar de planos?",
    a: "Depende de como você reservou. Se a reserva foi concluída no site ou WhatsApp do estacionamento parceiro, vale a política que ele informou a você. Se foi feita dentro da Movepark, o reembolso é integral dentro do prazo da sua Tarifa: 24 horas antes do check-in na Básica e na Flex, ou até 1 minuto antes na Superflex.",
  },
  {
    q: "E se eu ficar mais dias do que reservei?",
    a: "Fale com o estacionamento no local. A Movepark vai ajustar o pagamento da diferença, se aplicável.",
  },
];

/**
 * HowTo com os sete passos na ordem. Sai da mesma lista que a tela renderiza:
 * structured data que diverge do visível é motivo de penalidade do Google, e a
 * divergência começaria por existirem dois lugares para o mesmo texto.
 */
export function journeyHowToJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: JOURNEY_HEADLINE,
    description: JOURNEY_LEAD,
    step: JOURNEY.flatMap((m) =>
      m.steps.map((s) => ({
        "@type": "HowToStep",
        position: s.n,
        name: `${m.label}: passo ${s.n}`,
        text: s.text,
      })),
    ),
  };
}
