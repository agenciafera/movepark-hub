import type { ContentPage } from "./types";

/**
 * Conteúdo das páginas institucionais que não vêm do banco.
 *
 * Fica fora do componente de propósito: página nova é um objeto aqui, não uma tela.
 * Os documentos legais (`/termos`, `/privacidade`) NÃO moram neste arquivo, porque
 * precisam ser versionados no banco para o aceite apontar pra versão lida.
 *
 * O texto abaixo é o que já estava no ar, remontado em seções e blocos.
 */

export const CANCELAMENTO: ContentPage = {
  slug: "cancelamento",
  label: "Política de cancelamento",
  title: "Política de cancelamento",
  intro:
    "Dentro do prazo da sua Tarifa, o cancelamento é grátis e o reembolso é integral. Veja os prazos abaixo.",
  updated: "2026-08-10",
  related: ["termos", "faq"],
  sections: [
    {
      id: "prazos",
      title: "O prazo depende da sua Tarifa",
      blocks: [
        {
          type: "table",
          rows: [
            { k: "Básica", v: "Cancele até 24 horas antes do check-in" },
            { k: "Flex", v: "Cancele até 24 horas antes do check-in" },
            { k: "Superflex", v: "Cancele até 1 minuto antes do check-in" },
          ],
        },
        {
          // Verificado no código: `fare_cancel_until` é gravado na criação da
          // reserva e recalculado quando o cliente sobe a Tarifa depois
          // (migrations 20260720000000 e 20260829000000).
          type: "note",
          label: "Na prática",
          text: "O prazo aparece no resumo antes de você pagar e fica gravado na sua reserva. Se você subir a Tarifa depois, o prazo passa a ser o da nova.",
        },
      ],
    },
    {
      id: "reembolso-integral",
      title: "Reembolso integral",
      blocks: [
        {
          type: "p",
          text: "Cancele dentro da janela da sua Tarifa. Básica e Flex: até 24 horas antes do check-in. Superflex: até 1 minuto antes.",
        },
        {
          type: "p",
          text: "O valor total volta no mesmo método de pagamento, em até 10 dias úteis.",
        },
      ],
    },
    {
      id: "depois-do-prazo",
      title: "Depois do prazo",
      blocks: [
        {
          type: "p",
          text: "Passado o prazo da sua Tarifa, o cancelamento passa pelo suporte.",
        },
        {
          type: "p",
          text: "Não há reembolso parcial automático. O suporte avalia o seu caso pelo atendimento.",
        },
      ],
    },
    {
      id: "duvidas",
      title: "Perguntas frequentes",
      blocks: [
        {
          type: "faq",
          items: [
            {
              q: "Como cancelo minha reserva?",
              a: 'Em Minhas Reservas, abra a reserva e clique em "Cancelar reserva". Dentro do prazo da sua Tarifa, o reembolso integral aparece antes de você confirmar. Passado o prazo, fale com o suporte.',
            },
            {
              q: "O reembolso vai para onde?",
              a: "Para o mesmo método usado no pagamento: no PIX, o valor volta para a chave usada; no cartão de crédito, aparece como estorno na fatura em até 2 ciclos de faturamento.",
            },
            {
              q: "Posso cancelar porque meu voo atrasou?",
              a: "A Tarifa Superflex estende a estadia sozinha quando o voo atrasa, sem custo extra. Nas outras Tarifas, envie o comprovante de atraso pelo suporte que a gente avalia.",
            },
            {
              q: "E se o estacionamento não honrar a reserva?",
              a: "Se o parceiro não tiver vaga no dia mesmo com reserva confirmada, você tem direito a reembolso integral independente do prazo. Fale imediatamente com o suporte.",
            },
          ],
        },
      ],
    },
  ],
};

export const COMO_FUNCIONA: ContentPage = {
  slug: "como-funciona",
  label: "Como funciona",
  title: "Reserve sua vaga em menos de 2 minutos",
  intro:
    "Da busca ao check-in, tudo pelo celular. Sem ligar pro estacionamento e sem fila na chegada.",
  updated: "2026-08-10",
  related: ["cancelamento", "faq"],
  sections: [
    {
      id: "antes-da-viagem",
      title: "Antes da viagem",
      blocks: [
        {
          type: "steps",
          items: [
            {
              n: "1",
              title: "Busque sua vaga",
              text: "Informe seu destino (aeroporto ou terminal) e as datas de entrada e saída. Em segundos, você vê todos os estacionamentos parceiros disponíveis na região, com preços e distâncias.",
            },
            {
              n: "2",
              title: "Reserve em 2 minutos",
              text: "Escolha o estacionamento ideal e finalize o pagamento por PIX ou cartão de crédito. Preço fixo: o valor exibido é o que você paga. Sem surpresas na saída.",
            },
          ],
        },
      ],
    },
    {
      id: "na-chegada",
      title: "Na chegada",
      blocks: [
        {
          // A numeração segue de onde parou: é um fluxo só, não duas listas.
          type: "steps",
          items: [
            {
              n: "3",
              title: "Chegue e estacione",
              text: "No dia combinado, vá diretamente ao estacionamento. Não precisa ligar antes nem esperar fila: sua vaga já está reservada e confirmada.",
            },
            {
              n: "4",
              title: "Faça check-in pelo QR Code",
              text: "Apresente o voucher digital (QR Code) enviado por e-mail na entrada do estacionamento. O processo leva segundos. Pode partir tranquilo pro aeroporto.",
            },
          ],
        },
      ],
    },
    {
      id: "por-que-movepark",
      title: "Por que reservar pela Movepark",
      blocks: [
        {
          type: "table",
          rows: [
            {
              k: "Parceiros certificados",
              v: "Todo estacionamento na plataforma passou pela avaliação da Movepark.",
            },
            {
              k: "Preço fixo garantido",
              v: "O valor da reserva não muda. Sem cobrança extra na saída.",
            },
            {
              k: "Próximos ao seu destino",
              v: "Filtramos por proximidade ao aeroporto ou terminal que você precisa.",
            },
          ],
        },
      ],
    },
    {
      id: "duvidas",
      title: "Perguntas frequentes",
      blocks: [
        {
          type: "faq",
          items: [
            {
              q: "Preciso imprimir o voucher?",
              a: "Não. O QR Code no celular é suficiente. Mas você pode imprimir se preferir.",
            },
            {
              q: "E se eu precisar ficar mais tempo do que o reservado?",
              a: "Fale com o estacionamento no local. A Movepark vai ajustar o pagamento da diferença, se aplicável.",
            },
            {
              q: "Posso cancelar se mudar de planos?",
              a: "Sim. Dentro do prazo da sua Tarifa o reembolso é integral: 24 horas antes do check-in na Básica e na Flex, ou até 1 minuto antes na Superflex. Em unidades que fecham a reserva no site do parceiro, valem as condições dele. Veja a Política de Cancelamento.",
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Metodologia: de onde vem cada número do site. É a página de confiança que
 * buscador e LLM usam para decidir quem citar (E-E-A-T), e a resposta curta é
 * a nossa vantagem real: preço vivo do motor, não coleta manual.
 */
export const METODOLOGIA: ContentPage = {
  slug: "metodologia",
  label: "Metodologia",
  title: "De onde vêm os preços e as notas da Movepark",
  intro:
    "O que aparece no site sai do motor de reservas e de regra publicada. Esta página explica de onde vem cada número.",
  updated: "2026-08-14",
  sections: [
    {
      id: "precos",
      title: "De onde vêm os preços",
      blocks: [
        {
          type: "p",
          text: "O preço exibido no índice de preços, na calculadora e nas páginas de perguntas é o mesmo que o motor de reservas cobra no checkout. Não há coleta manual: quando o parceiro atualiza a tabela dele, o site atualiza junto. O valor de balcão, quando aparece, é a tarifa de quem chega sem reserva, informada pelo próprio parceiro.",
        },
        {
          type: "note",
          label: "Preço fechado",
          text: "O valor que está escrito é o valor da reserva. Sem taxa na chegada.",
        },
      ],
    },
    {
      id: "ordenacao",
      title: "Como ordenamos os resultados",
      blocks: [
        {
          type: "p",
          text: "A ordem da busca segue o critério que você escolhe no filtro: preço, distância do terminal ou avaliação. O padrão é preço. Nas vitrines de mais reservados, o critério é o número real de reservas.",
        },
      ],
    },
    {
      id: "parceiros",
      title: "Parceiros e estacionamentos mapeados",
      blocks: [
        {
          type: "p",
          text: "Estacionamento parceiro tem reserva online pela Movepark, e a Movepark recebe comissão por reserva concluída. Estacionamento mapeado é uma ficha informativa de um lote que ainda não é parceiro: sem preço e sem reserva, publicada para o mapa da região ficar completo. A comissão não muda a ordenação e não esconde ficha mapeada.",
        },
      ],
    },
    {
      id: "avaliacoes",
      title: "De onde vêm as avaliações",
      blocks: [
        {
          type: "p",
          text: "Avaliação publicada pela Movepark vem de reserva concluída na plataforma. Nas fichas de estacionamento mapeado, a nota exibida é a do Google, com a fonte identificada ao lado.",
        },
      ],
    },
    {
      id: "correcoes",
      title: "Achou um dado errado?",
      blocks: [
        {
          type: "p",
          text: "Administra um estacionamento listado ou encontrou uma informação desatualizada? Fale com a gente pela página de contato. A gente confere na fonte e corrige.",
        },
      ],
    },
  ],
  related: ["como-funciona", "faq"],
};

/** Cards de "Veja também", curados por página. */
export const RELACIONADOS: Record<string, { to: string; title: string; description: string }> = {
  termos: {
    to: "/termos",
    title: "Termos de Uso",
    description: "As regras de uso da plataforma",
  },
  privacidade: {
    to: "/privacidade",
    title: "Política de Privacidade",
    description: "Como tratamos os seus dados",
  },
  cancelamento: {
    to: "/cancelamento",
    title: "Política de cancelamento",
    description: "Prazos e reembolso por Tarifa",
  },
  faq: {
    to: "/faq",
    title: "Perguntas frequentes",
    description: "As dúvidas mais comuns de quem reserva",
  },
  "como-funciona": {
    to: "/como-funciona",
    title: "Como funciona",
    description: "Da busca ao check-in em quatro passos",
  },
  metodologia: {
    to: "/metodologia",
    title: "Metodologia",
    description: "De onde vêm os preços e as notas do site",
  },
};
