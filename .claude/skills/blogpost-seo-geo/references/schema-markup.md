# Schema Markup no post

O que já é emitido sozinho, o que dá para conseguir escrevendo bem, e o que só
sai com mudança de código. Saber a diferença evita prometer rich result que não
existe e evita escrever JSON-LD à mão dentro do markdown, o que não funciona (o
render imprime a tag na tela).

## O que já é automático

A rota do post (`src/routes/blog-post.tsx`) emite, para todo post publicado:

| Schema | O que carrega |
|---|---|
| `BlogPosting` | `headline`, `description`, `image`, `datePublished`, `author` (Organization Movepark), `publisher`, `mainEntityOfPage` |
| `BreadcrumbList` | Início, Blog, título do post |
| `FAQPage` | As perguntas da FAQ que **o próprio post** escreveu, quando existem pelo menos duas |

Mais as metas: `title`, `description`, `canonical` com barra final, `og:type
article`, `og:title`, `og:description`, `og:url`, `og:image` com dimensões e alt,
`article:published_time`. Os helpers estão em `src/lib/jsonld.ts`.

**Nada disso precisa ser escrito no corpo.** Vem do front matter e do banco: o
`title`, o `meta_description`, a capa e a data. Escrever bem esses campos é o que
alimenta o schema.

## O `FAQPage` do post: como ele é montado

Desde 25/08/2026 a rota emite `FAQPage` sozinha, lendo o corpo do post com
`faqPairsFrom` (`src/features/blog/markdown.logic.ts`). Não existe campo novo no
banco nem JSON para escrever à mão: **escrever a FAQ no formato certo é o que liga
o schema.**

A leitura tem três recortes, e é bom conhecê-los para não escrever algo que fica
de fora sem você perceber:

| Regra da leitura | O que acontece se você fugir dela |
|---|---|
| Pergunta em `###`, nunca em `##` | `##` é seção do corpo, e a resposta dela se estende por parágrafos e tabelas. Pergunta em `##` não entra no schema |
| O título precisa terminar em `?` | `### 3 dicas para economizar` fica de fora, e é isso que impede o acervo herdado (que usa `###` para numerar passo) de emitir FAQ inventada |
| A resposta vai até o próximo bloco que não é prosa | Parágrafo e lista entram. Título, tabela, imagem, citação e linha param a leitura. Se você abrir a resposta com uma tabela, o schema sai vazio e a pergunta é descartada |

Mais duas coisas que o código faz e você não precisa gerenciar: pergunta repetida
fica na primeira ocorrência, e o bloco só é emitido a partir de **duas perguntas**,
porque `FAQPage` descreve uma lista. Com uma pergunta só, quem responde é a página
dela em `/faq/<slug>`.

### A regra de conteúdo que sustenta isso

**A FAQ do post pergunta o que só aquele post responde.** As perguntas de escopo
global e de destino já respondem em `/faq/<slug>`, em `/destinos/<slug>` e na
single da unidade (ADR-002). Copiar uma delas para o fim do post coloca a mesma
pergunta com a mesma resposta numa quarta URL, que é exatamente a canibalização que
o acervo já sofre.

Teste rápido antes de escrever cada pergunta: **ela caberia igual em qualquer post
deste aeroporto?** Se cabe, o lugar dela é `/faq/<slug>`, e o post deve linkar para
lá. Se ela só faz sentido depois de ler este post, é FAQ do post.

| Superfície | Pergunta que pertence a ela |
|---|---|
| `/faq/<slug>` | "Quanto custa estacionar no Aeroporto de Guarulhos?" |
| Post sobre pagar mais barato | "O desconto do Itaú Personnalité compensa a partir de quantas diárias?" |
| Post sobre o Terminal 3 | "Dá para ir a pé do estacionamento externo até o T3?" |

## O que existe no projeto e ainda não é usado no post

`itemListSchema(items)` produz `ItemList` e serve para post do tipo "as 5 melhores
opções", que é o formato mais comum do acervo. Ligá-lo é **mudança de código na
rota**, não de conteúdo. Se o usuário pedir, trate como tarefa de código, com teste,
e não improvise JSON dentro do texto.

Duas cautelas que continuam valendo:

- **O ADR-002 manda um único `FAQPage` por página.** Se um dia o post passar a
  exibir também a FAQ do destino, as duas fontes não podem virar dois blocos: o
  `faqPairsFrom` teria que receber a mescla, não ganhar um irmão.
- **A resposta do schema tem que ser idêntica à visível.** É o motivo de a leitura
  parar no primeiro bloco que não é prosa, e de nada vir do banco.

## O que dá para conseguir só escrevendo

O Google entende estrutura sem JSON-LD, e os motores generativos leem o texto,
não a marcação. Isso significa que boa parte do ganho de "schema" vem de formato:

**FAQ.** Pergunta como `###` terminada em `?`, resposta no parágrafo imediatamente
abaixo, 40 a 60 palavras, sem depender do resto do texto. É o formato que vira
citação, que o Google reconhece como par de pergunta e resposta, e que agora também
liga o `FAQPage` da rota.

**Tabela de comparação.** Cabeçalho nomeando a dimensão ("Opção", "Diária",
"Traslado", "Cobertura"). Tabela markdown vira `<table>` de verdade no render,
que é o que o Google lê para rich result de tabela.

**Lista ordenada para ranking.** "As 5 opções" numeradas, cada item começando com
o nome da opção. É o que aproxima o post de um `ItemList` mesmo sem o JSON.

**Entidade nomeada por extenso.** Nome oficial do aeroporto, cidade, estado e
código IATA pelo menos uma vez. É assim que o post entra no grafo da entidade,
que é o mecanismo por trás do schema, não o contrário.

## O que nunca fazer

- **JSON-LD dentro do `body_md`.** O parser não interpreta HTML nem script: a tag
  aparece na tela. O analisador barra isso como HTML cru.
- **Schema de `Product` ou `Offer` no post.** Preço em schema é promessa de
  transação, e post não declara capacidade (ADR-009). Oferta é da unidade.
- **`AggregateRating` inventado.** Avaliação vem de `review` de verdade, e a
  página que a exibe é a da unidade.

### `Product` e `Offer` no post não, nas páginas de preço sim

A proibição acima vale para **o post**, e é fácil ler errado quando o plano de
conteúdo pede `Product`/`Offer` nas páginas de preço. Não é contradição, são
superfícies diferentes:

| Superfície | Emite `Offer`? | Por quê |
|---|---|---|
| Post de blog | Não | Texto editorial. O preço citado é retrato datado, não oferta, e o post não sabe da capacidade da unidade |
| `/precos` e `/precos/<slug>` | Sim | Lê o motor de reservas, o valor publicado é o cobrado no checkout, e a unidade por trás declara capacidade |
| Single da unidade | Sim | É onde `getLocationCapabilities` manda e onde a reserva fecha |

O critério é sempre o mesmo: **quem emite `Offer` precisa poder honrar a oferta.**
O post não pode, então cita número com data e manda para quem pode.

Isso vale inclusive para a tabela de aeroporto sem parceiro (portão 1.4 da skill):
ela pode existir no texto, com fonte e data, e **não** vira `Offer` em schema.
