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

/**
 * Segurança e seguro do carro no estacionamento de aeroporto.
 *
 * Existe porque é a objeção número um depois do preço, e porque a auditoria de
 * 24/09/2026 mostrou que os dois concorrentes têm página própria para o tema
 * (`/estacionamento-de-aeroporto-e-seguro` num, `/seguranca` no outro) enquanto a
 * Movepark só respondia dentro de uma FAQ de destino.
 *
 * O ângulo é o que nenhum dos dois usa: **a base legal**. A Súmula 130 do STJ e o
 * CDC dizem quem responde pelo carro, e isso vale para qualquer pátio, com ou sem
 * seguro contratado. É fato verificável, cita fonte pública e responde a pergunta
 * de verdade ("e se acontecer alguma coisa?"), em vez de listar câmera e portaria.
 *
 * A seção "o que a Movepark não verifica" é deliberada. Página de confiança que só
 * afirma vantagem não sustenta citação; o que sustenta é declarar o limite.
 */
export const SEGURANCA: ContentPage = {
  slug: "estacionamento-de-aeroporto-e-seguro",
  label: "Segurança e seguro",
  title: "Estacionamento de aeroporto é seguro? Quem responde pelo seu carro",
  intro:
    "Deixar o carro dias parado levanta sempre a mesma dúvida: se acontecer alguma coisa, quem paga? A resposta curta é que o estacionamento responde, por lei, mesmo sem seguro contratado. O que muda de um pátio para outro é a estrutura que reduz o risco de acontecer, e o que você consegue provar depois.",
  updated: "2026-09-24",
  sections: [
    {
      id: "quem-responde",
      title: "Quem responde se o carro for furtado ou danificado",
      blocks: [
        {
          type: "p",
          text: "O estacionamento responde. A Súmula 130 do Superior Tribunal de Justiça diz que a empresa responde, perante o cliente, pela reparação de dano ou furto de veículo ocorridos em seu estacionamento. Não é preciso que o pátio tenha seguro contratado, nem que você prove culpa de alguém.",
        },
        {
          type: "p",
          text: "A relação é de depósito: você entrega o carro, o pátio assume o dever de guardá-lo e devolvê-lo no estado em que recebeu. Como a contratação é de consumo, vale também o Código de Defesa do Consumidor, e a responsabilidade do fornecedor independe de culpa.",
        },
        {
          type: "note",
          label: "Aviso que não vale",
          text: "Placa dizendo \"não nos responsabilizamos por objetos deixados no veículo\" não transfere responsabilidade sobre o carro. Sobre objetos soltos dentro dele a discussão é outra, e por isso a recomendação prática continua sendo não deixar nada à vista.",
        },
      ],
    },
    {
      id: "seguro-do-patio",
      title: "Seguro do pátio e seguro do seu carro: são coisas diferentes",
      blocks: [
        {
          type: "p",
          text: "Parte dos estacionamentos contrata uma apólice própria, às vezes chamada de seguro garagista. Ela existe para cobrir o pátio quando ele tem que indenizar você, e não substitui o seu seguro nem muda quem responde.",
        },
        {
          type: "list",
          items: [
            "Seguro garagista do pátio: protege o estacionamento do prejuízo de indenizar. Você não aciona diretamente.",
            "Seu seguro de automóvel: costuma cobrir furto e colisão onde quer que o carro esteja, inclusive em pátio de terceiro. Confira se a sua apólice tem carência ou restrição para veículo em guarda.",
            "Cobertura declarada pelo estacionamento: quando o pátio publica um valor de cobertura por veículo, esse número é dele, não nosso. Vale confirmar por escrito antes de deixar o carro.",
          ],
        },
        {
          type: "p",
          text: "Na prática, o seguro do pátio interessa mais para saber se ele tem lastro para pagar do que para definir se ele deve pagar. A obrigação existe de qualquer forma.",
        },
      ],
    },
    {
      id: "o-que-conferir",
      title: "O que conferir antes de deixar o carro",
      blocks: [
        {
          type: "steps",
          items: [
            {
              n: "1",
              title: "Peça o comprovante de entrada",
              text: "Ticket, voucher ou registro digital com placa, data e hora. É a prova de que o carro estava sob guarda do pátio, e é o documento que sustenta qualquer reclamação depois.",
            },
            {
              n: "2",
              title: "Fotografe o carro na chegada",
              text: "Quatro laterais, painel com o hodômetro e qualquer avaria que já exista. Leva um minuto e resolve a discussão sobre o que é anterior e o que é novo.",
            },
            {
              n: "3",
              title: "Veja como é o acesso",
              text: "Pátio fechado, com portaria e controle de entrada, é diferente de terreno aberto. Câmera só ajuda se cobrir a vaga, e não apenas o portão.",
            },
            {
              n: "4",
              title: "Não deixe nada à vista",
              text: "Documento, eletrônico e bagagem saem do carro. Sobre objetos deixados no veículo a responsabilidade do pátio é mais discutível que sobre o veículo em si.",
            },
          ],
        },
      ],
    },
    {
      id: "o-que-verificamos",
      title: "O que a Movepark verifica, e o que não verifica",
      blocks: [
        {
          type: "p",
          text: "Esta parte importa mais que a lista de comodidades, porque é o limite do que você pode concluir do que está publicado aqui.",
        },
        {
          type: "table",
          rows: [
            {
              k: "Verificamos",
              v: "Que o parceiro existe como empresa, com CNPJ, e que o endereço e a distância batem com a coordenada que medimos no banco.",
            },
            {
              k: "Verificamos",
              v: "As comodidades declaradas por cada unidade, que aparecem item a item na página dela.",
            },
            {
              k: "Não verificamos",
              v: "Apólice de seguro do pátio. O valor de cobertura que um estacionamento anuncia é declaração dele, e a Movepark não audita contrato de terceiro.",
            },
            {
              k: "Não verificamos",
              v: "Lote apenas mapeado, sem contrato conosco. Dele publicamos endereço, distância medida e preço pesquisado no canal do próprio estacionamento, e nada mais.",
            },
          ],
        },
        {
          type: "note",
          label: "Por que dizemos isso",
          text: "Porque afirmar que todo pátio listado é seguro seria uma promessa que não temos como sustentar, e promessa que não se sustenta é o que derruba a confiança na primeira vez que dá errado.",
        },
      ],
    },
    {
      id: "por-aeroporto",
      title: "Segurança em cada aeroporto",
      blocks: [
        {
          type: "p",
          text: "O que cada praça oferece varia, e a resposta específica fica na página do aeroporto, com as unidades daquela região.",
        },
        {
          type: "faq",
          items: [
            {
              q: "Os estacionamentos de Guarulhos são seguros? Têm monitoramento?",
              a: "Os parceiros Movepark em Guarulhos operam com pátio fechado, monitoramento por câmeras 24 horas e controle de acesso, e a página de cada unidade lista os itens um a um.",
              slug: "os-estacionamentos-de-guarulhos-sao-seguros-tem-monitoramento",
            },
            {
              q: "Os estacionamentos de Viracopos são seguros? Têm monitoramento?",
              a: "Os parceiros Movepark em Viracopos operam com pátio fechado, monitoramento por câmeras 24 horas e controle de acesso na portaria, e os dois têm rastreio da van em tempo real.",
              slug: "os-estacionamentos-de-viracopos-sao-seguros-tem-monitoramento",
            },
            {
              q: "Os estacionamentos de Congonhas são seguros? Têm monitoramento?",
              a: "Os parceiros Movepark em Congonhas operam com pátio coberto e fechado, monitoramento por câmeras 24 horas e controle de acesso, a menos de 900 m do terminal.",
              slug: "os-estacionamentos-de-congonhas-sao-seguros-tem-monitoramento",
            },
            {
              q: "Os estacionamentos perto do Aeroporto de Confins são seguros?",
              a: "O parceiro Movepark BePark opera com pátio coberto e fechado, câmeras 24 horas, controle de acesso e rastreio da van em tempo real.",
              slug: "os-estacionamentos-perto-do-aeroporto-de-confins-sao-seguros-tem-monitoramento",
            },
            {
              q: "Os estacionamentos perto do Aeroporto Afonso Pena são seguros?",
              a: "Os parceiros Movepark em Curitiba listam os itens de segurança na própria página: monitoramento por câmeras, controle de acesso e equipe no local.",
              slug: "os-estacionamentos-perto-do-aeroporto-afonso-pena-sao-seguros-tem-monitoramento",
            },
          ],
        },
      ],
    },
  ],
  related: ["metodologia", "como-funciona", "cancelamento"],
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
  "estacionamento-de-aeroporto-e-seguro": {
    to: "/estacionamento-de-aeroporto-e-seguro",
    title: "Estacionamento de aeroporto é seguro?",
    description: "Quem responde pelo seu carro, e o que conferir antes",
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
