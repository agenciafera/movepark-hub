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
    "Quando você reserva direto na Movepark, o cancelamento segue o prazo da sua Tarifa e o reembolso é integral dentro dele. Quando a reserva é concluída no site ou WhatsApp do estacionamento parceiro, vale a política que ele informou a você.",
  updated: "2026-08-19",
  related: ["termos", "faq"],
  sections: [
    {
      id: "prazos",
      title: "O prazo depende da sua Tarifa",
      blocks: [
        {
          type: "note",
          label: "Quando vale este prazo",
          text: "Os prazos abaixo valem para reservas fechadas dentro do checkout da Movepark. Se você reservou direto no site ou WhatsApp do estacionamento parceiro, a política de cancelamento é a que ele informou no momento da reserva.",
        },
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
          text: "Cancele dentro da janela da sua Tarifa, em reservas fechadas na Movepark. Básica e Flex: até 24 horas antes do check-in. Superflex: até 1 minuto antes.",
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
              a: 'Se você reservou direto na Movepark: em Minhas Reservas, abra a reserva e clique em "Cancelar reserva". Dentro do prazo da sua Tarifa, o reembolso integral aparece antes de você confirmar. Se você reservou no site ou WhatsApp do estacionamento parceiro, cancele direto com ele, pelo canal que ele indicou na confirmação.',
            },
            {
              q: "O reembolso vai para onde?",
              a: "Para reservas fechadas na Movepark, o reembolso vai para o mesmo método usado no pagamento: no PIX, o valor volta para a chave usada; no cartão de crédito, aparece como estorno na fatura em até 2 ciclos de faturamento.",
            },
            {
              q: "Posso cancelar porque meu voo atrasou?",
              a: "Com a Tarifa Superflex você estende a saída em até 24 horas com um clique na sua reserva, sem custo, informando o número do voo. Vale uma vez por reserva. Nas outras Tarifas, envie o comprovante de atraso pelo suporte que a gente avalia.",
            },
            {
              q: "E se o estacionamento não honrar a reserva?",
              a: "Se você reservou direto na Movepark e o parceiro não tiver vaga no dia mesmo com a reserva confirmada, você tem direito a reembolso integral independente do prazo: fale imediatamente com o suporte. Se a reserva foi concluída no site do parceiro, o problema deve ser resolvido direto com ele; nosso suporte também pode ajudar a intermediar.",
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
 *
 * Conteúdo 29 trocou a prosa genérica por proveniência campo a campo, porque
 * "os dados são confiáveis" não é verificável e "a distância sai de ST_Distance
 * no PostGIS" é. A seção `frescor` recebe a tabela de datas no loader da rota
 * (`comFrescorVivo`): data de tabela escrita à mão envelheceria dentro de uma
 * página que existe justamente para dizer quando cada número mudou.
 */
export const METODOLOGIA: ContentPage = {
  slug: "metodologia",
  label: "Metodologia",
  title: "De onde vem cada número da Movepark",
  intro:
    "Preço, distância e horário desta casa saem do sistema que opera as reservas, não de uma planilha que alguém preenche. Esta página diz, campo a campo, qual é a fonte de cada um e quando ele mudou pela última vez.",
  updated: "2026-09-17",
  sections: [
    {
      id: "de-onde-vem",
      title: "De onde vem cada número",
      blocks: [
        {
          type: "p",
          text: "Cada dado publicado tem uma origem única, e é sempre a mesma que o sistema usa para operar. Não existe uma versão do número para o site e outra para a reserva.",
        },
        {
          type: "table",
          rows: [
            {
              k: "Preço e balcão",
              v: "O motor de reservas, pela função destination_price_index. É o mesmo cálculo que fecha o valor na hora de reservar. O balcão é a tarifa de quem chega sem reserva, que vem da mesma tabela.",
            },
            {
              k: "Distância até o terminal",
              v: "Medida no banco de dados com PostGIS, por ST_Distance sobre a coordenada de cada pátio. Nenhuma distância desta casa foi estimada no olho ou copiada de mapa.",
            },
            {
              k: "Traslado, van e 24 horas",
              v: "Declarados pelo estacionamento na ficha da unidade. O que ele não declara aparece como não declarado, e nunca vira estimativa nossa.",
            },
            {
              k: "Piso de permanência",
              v: "A estadia mínima da vaga, quando o estacionamento exige uma. Sai do mesmo cadastro que o checkout consulta para recusar uma diária isolada.",
            },
            {
              k: "Data de cada tabela",
              v: "O dia em que a tabela daquele estacionamento mudou de verdade. Não é o dia em que a gente conferiu pela última vez, que é bem mais recente e diria pouco.",
            },
          ],
        },
      ],
    },
    {
      id: "precos",
      title: "O preço daqui é o preço cobrado",
      blocks: [
        {
          type: "p",
          text: "O valor que aparece no índice de preços, na calculadora e nas páginas de aeroporto não é uma cotação que alguém anotou em algum lugar. Ele é reconstruído a partir do motor de cálculo do próprio estacionamento, com a tabela inteira dele, e é o valor que você paga ao fechar.",
        },
        {
          type: "p",
          text: "Na prática: um robô nosso consulta o sistema do parceiro, refaz a tabela dele aqui dentro e depois compara os dois motores nas mesmas entradas. Ninguém da Movepark digita preço de parceiro à mão, e nenhum valor sai de agregador ou de print de concorrente.",
        },
        {
          type: "note",
          label: "Preço fechado",
          text: "O valor que está escrito é o valor da reserva. Sem taxa na chegada.",
        },
      ],
    },
    {
      id: "frescor",
      title: "Com que frequência cada tabela muda",
      blocks: [
        {
          type: "p",
          text: "A conferência é de 3 em 3 horas, oito vezes por dia. Isso não quer dizer que o preço mude nesse ritmo: quem mexe na tabela é o estacionamento, e a maioria passa semanas sem mexer. Por isso as duas datas andam separadas aqui.",
        },
        {
          type: "p",
          text: "Uma tabela parada há um mês não está desatualizada. Está confirmada: a gente olhou hoje e o valor continua o mesmo. O que seria desonesto é usar a hora dessa conferência como se fosse a data do preço.",
        },
        {
          type: "note",
          label: "Corrigido em 17 de setembro de 2026",
          text: "Até esta data o carimbo do site saía do registro de escrita da tabela, que o robô toca a cada passada mesmo quando nada muda. Ele mostrava a data de hoje todo dia, em todas as praças. Agora mostra a data da mudança, e a conferência aparece ao lado, com o nome certo.",
        },
      ],
    },
    {
      id: "nao-publicado",
      title: "O que não está publicado, e por quê",
      blocks: [
        {
          type: "p",
          text: "Estacionamento sem contrato com a Movepark não tem tarifa nesta casa. Ele aparece como ficha mapeada, com endereço, distância medida e o que dá para verificar, e sem preço nenhum.",
        },
        {
          type: "p",
          text: "O motivo é o mesmo que sustenta o resto da página: sem contrato a gente não tem acesso ao sistema do lote, então não consegue nem confirmar o número hoje nem mantê-lo amanhã. Publicar uma tarifa que envelhece sem ninguém perceber é pior do que não publicar tarifa.",
        },
        {
          type: "list",
          items: [
            "Ficha mapeada não tem preço, reserva, cancelamento nem vaga garantida.",
            "Quando o estacionamento vira parceiro, a ficha some e a unidade passa a ter tarifa do motor, com as mesmas regras de qualquer outra.",
            "Comissão não muda a ordenação da busca e não esconde ficha mapeada de ninguém.",
          ],
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
      id: "avaliacoes",
      title: "De onde vêm as avaliações",
      blocks: [
        {
          type: "p",
          text: "Avaliação publicada pela Movepark vem de reserva concluída na plataforma, de quem realmente deixou o carro lá. Nas fichas de estacionamento mapeado, a nota exibida é a do Google, com a fonte identificada ao lado para você não confundir uma coisa com a outra.",
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
    description: "Da busca à chave de volta na sua mão",
  },
  metodologia: {
    to: "/metodologia",
    title: "Metodologia",
    description: "A fonte de cada número, campo a campo",
  },
  sobre: {
    to: "/sobre",
    title: "Sobre nós",
    description: "Quem é a Movepark e onde ela já está",
  },
  grupo: {
    to: "/grupo",
    title: "O grupo Movepark",
    description: "As quatro marcas da casa e o estágio de cada uma",
  },
};
