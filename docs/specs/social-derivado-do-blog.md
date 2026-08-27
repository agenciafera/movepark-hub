# Posts de rede social derivados do blog

> **Status:** Fase 1 implementada em 27/08/2026. `src/features/blog/social.logic.ts`
> (recorte determinístico, 21 testes) e `SocialDraftsDialog` em `/manager/blog`, no botão
> **Redes** de cada linha. As fases 2 a 4 (imagem, texto polido por LLM, publicação agendada)
> estão desenhadas aqui e não foram entregues.
>
> **Atividade:** [86ak6q0xd](https://app.clickup.com/t/86ak6q0xd), "Automatizar geração de 4
> posts sociais a partir de 1 artigo de 3.000 palavras". Origem: reunião de pauta de 26/08/2026.
>
> **Premissa da atividade:** o Instagram passa a servir apenas como canal de distribuição do
> conteúdo do blog.
>
> Conecta com [blog.md](./blog.md) (acervo, contrato de URL, consolidação por intenção), a skill
> `blogpost-seo-geo` (anatomia do artigo) e o **ADR-009** (promessa de transação renderiza por
> capacidade).

## A decisão que muda o problema

A premissa é a parte que decide o desenho. Se o Instagram distribui o blog, o post social não é
conteúdo novo: é **recorte** de um artigo que já existe, já foi revisado e já passou pelo
analisador. Isso derruba a formulação óbvia da tarefa ("um modelo lê 3.000 palavras e escreve 4
posts") e coloca outra no lugar: **onde o artigo já guarda os quatro cortes**.

O artigo escrito pela skill `blogpost-seo-geo` tem anatomia rígida, e é ela que responde:

| O artigo obriga | Vira |
|---|---|
| Tabela de preço com data de referência | Âncora de preço |
| FAQ em `###` terminado em `?`, resposta de 40 a 60 palavras | Pergunta |
| Tabela comparativa sempre que houver dado comparável | Comparativo |
| Lista de checagem, ou os H2 em forma de pergunta | Checklist, ou "o que o post responde" |

Quatro formatos, quatro slots que o artigo já preenche. A automação recorta, não redige.

### Por que não pedir os 4 posts a um modelo

Não é preferência de arquitetura, é exposição legal e operacional:

- **Preço.** Modelo generativo erra número, e preço errado no Instagram é oferta que vincula o
  fornecedor (CDC art. 30). No recorte, todo `R$` que sai veio de uma célula de tabela do artigo,
  com a data que o artigo declara. Não existe caminho no código que calcule tarifa.
- **ADR-009.** "Vaga garantida", "cancelamento grátis" e "preço fixo" não podem sair da página da
  unidade. Um prompt pede que o modelo não escreva isso; o recorte **bloqueia o rascunho** e diz
  qual frase bloqueou.
- **Canibalização.** Post social que reescreve o artigo com outras palavras não ajuda o artigo. O
  recorte carrega a URL do post em toda legenda, que é literalmente a premissa da atividade.
- **Custo e latência.** Recorte é síncrono e de graça. Chamada de LLM em 93 posts é fila, chave e
  orçamento para um trabalho que a estrutura do texto já resolve.

O modelo tem lugar nisso, mas na **fase 3**, e num papel estreito: melhorar a redação de um card
cujo conteúdo já foi decidido pelo recorte. Nunca escolher o número.

### Onde a automação mora

No Hub, em `src/features/blog/`. As alternativas foram descartadas:

| Alternativa | Por que não |
|---|---|
| n8n | A instância está em desligamento (E4.1) e o `.mcp.json` já não aponta para ela. Fluxo em n8n também deixa a regra fora do repo, contra o ADR-008 |
| Ferramenta de agendamento (Buffer, mLabs) com IA própria | Ela lê a URL e reescreve por conta própria: volta o problema do preço inventado e da promessa de transação |
| Planilha com prompt colado | Não tem teste, não tem revisão em PR e ninguém descobre quando o formato do artigo muda |

## Fase 1: o recorte (implementado)

`src/features/blog/social.logic.ts`, função `derivarPostsSociais(source)`. Reusa o
`parseMarkdown` de `markdown.logic.ts`, que é o mesmo parser que renderiza a página do post, e o
`faqPairsFrom`, que é o mesmo extrator que emite o `FAQPage`. Então a pergunta que vira card é a
mesma que o Google já lê.

### Os quatro recortes

| Formato | De onde sai | Cards |
|---|---|---|
| **Âncora de preço** | Primeira tabela com `R$`. Nas âncoras do acervo é a "Resposta rápida" | Um por linha com valor, até 6 |
| **Pergunta** | Primeira FAQ cuja resposta cabe no card | 2: pergunta, e a primeira frase da resposta |
| **Comparativo** | Tabela mais larga com 3 colunas e 3 linhas | Capa mais uma linha por card |
| **Checklist** | Maior lista com 5 itens ou mais; sem ela, as seções em H2 | Capa mais até 5 pontos |

O piso de cinco itens na lista tem motivo medido: no artigo do Afonso Pena a maior lista de três
itens era a das áreas do **estacionamento oficial**, e ela virava um "checklist" que vendia o
concorrente. Abaixo desse piso, as seções em H2 descrevem melhor o que o post responde.

### O que o código garante

- **Nenhum número novo.** Todo valor vem de célula de tabela ou de item de lista do artigo.
- **`R$` sem data de referência bloqueia o rascunho.** A data é lida do artigo em duas formas
  (`27/08/2026` no cabeçalho da tabela, "27 de agosto de 2026" na prosa), e a legenda só assina
  "Valores consultados em" quando o recorte carrega preço de fato.
- **Promessa de transação bloqueia o rascunho**, com a frase encontrada e a citação do ADR-009.
  O botão de copiar fica desabilitado enquanto houver bloqueio.
- **Travessão vira hífen com espaços.** O acervo herdado do WordPress está cheio deles, e o
  recorte não reintroduz o que a marca proíbe.
- **Formato que o artigo não sustenta vira `gap` com o motivo**, nunca card preenchido com texto
  inventado. Um artigo sem tabela não ganha âncora de preço: ganha a frase "o artigo não tem
  tabela com valor em R$".

Esse último ponto é a parte que devolve trabalho para o lugar certo. Quando faltam recortes, o
que falta é anatomia no artigo, e a correção é no artigo, que é onde o texto ranqueia.

### A tela

`/manager/blog`, botão **Redes** na linha do post. Mostra os quatro recortes com os cards, a
legenda pronta, o texto alternativo e a origem de cada corte, mais os bloqueios e os avisos.

A tela é de **conferência, não de edição**, e isso é decisão, não pendência: editar o card ali
criaria uma segunda versão do mesmo número, publicada sem revisão e sem histórico, e ninguém
saberia depois qual das duas foi ao ar. Card errado se conserta no artigo.

## Fase 2: a imagem (proposta)

Hoje a saída é texto: cards descritos e legenda pronta para colar no editor de arte. O passo
seguinte é renderizar a imagem 1080x1350 a partir dos mesmos dados, no próprio Manager, com os
tokens do `DESIGN.md`, e baixar o PNG.

Caminho recomendado: renderizar o card em DOM e exportar com `canvas` no browser, sem serviço
novo. O `html-to-image` resolve o caso e não precisa de servidor. A alternativa (Satori numa Edge
Function) só se paga se um dia a geração precisar rodar sem alguém na tela, o que a fase 4
decide.

## Fase 3: o polimento por LLM (proposta)

Uma Edge `polish-social-copy`, com a `GEMINI_API_KEY` que as Edges `chat` e `knowledge-search` já
usam. Contrato estreito, e é o contrato que faz essa fase ser segura:

- **Entra** o card já recortado. **Sai** o mesmo card com a redação melhor.
- O modelo **não recebe permissão para mudar número, data ou URL**. A validação depois da
  resposta compara os `R$` e a data do card original com os do card devolvido, e recusa a
  diferença.
- O bloqueio do ADR-009 roda **de novo** sobre o texto que voltou.

Sem essas três, a fase 3 devolve exatamente os riscos que a fase 1 fechou.

## Fase 4: a publicação (proposta, com dependência fora do código)

Publicar direto no Instagram exige Graph API, conta Business ligada a uma Página do Facebook, app
na Meta com `instagram_content_publish` e revisão da Meta. Isso é prazo e decisão de negócio, não
código, e por isso está separado.

O intermediário honesto, enquanto a decisão não vem: exportar o pacote (imagens mais legenda) e
agendar na ferramenta que o time já usa. O ganho da atividade (parar de escrever quatro posts a
partir do zero) já vem da fase 1.

## O que precisa de decisão do time

| # | Pergunta | Por que trava |
|---|---|---|
| 1 | Quatro posts por artigo saem no mesmo dia ou distribuídos na semana? | Muda se a fase 4 precisa de agendamento ou só de exportação |
| 2 | Quem aprova antes de publicar? | Define se a tela de conferência basta ou se falta um estado "aprovado" no banco |
| 3 | Vale publicar recorte dos 69 posts do acervo herdado, ou só dos novos? | O acervo antigo tem menos tabela e menos FAQ, então rende menos recorte, e o volume de conferência é outro |
| 4 | A fase 4 vai por Graph API ou por ferramenta de agendamento? | A Graph API tem revisão da Meta no caminho crítico |

Nenhuma delas bloqueia a fase 1, que já está no ar no Manager.

## Efeito colateral que vale registrar

O recorte é um **medidor da qualidade do artigo**. Post que não rende os quatro cortes é post sem
tabela, sem FAQ ou sem lista, ou seja, exatamente o post que a skill `blogpost-seo-geo` diz que
não ranqueia e não é citado por IA. A lista de `gaps` na tela vira, de graça, uma fila de
melhoria do acervo.
