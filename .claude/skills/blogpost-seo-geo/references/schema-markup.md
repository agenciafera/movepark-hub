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

Mais as metas: `title`, `description`, `canonical` com barra final, `og:type
article`, `og:title`, `og:description`, `og:url`, `og:image` com dimensões e alt,
`article:published_time`. Os helpers estão em `src/lib/jsonld.ts`.

**Nada disso precisa ser escrito no corpo.** Vem do front matter e do banco: o
`title`, o `meta_description`, a capa e a data. Escrever bem esses campos é o que
alimenta o schema.

## O que existe no projeto e ainda não é usado no post

`src/lib/jsonld.ts` já exporta helpers prontos que a rota do post não chama:

- `faqSchema(faqs)` produz `FAQPage`. Usado nas páginas de destino.
- `itemListSchema(items)` produz `ItemList`. Serve para post do tipo "as 5
  melhores opções", que é o formato mais comum do acervo.
- `breadcrumbSchema` já está em uso.

Ligar `FAQPage` ou `ItemList` no post é **mudança de código na rota**, não de
conteúdo: exige derivar os pares pergunta e resposta do markdown (ou guardá-los
num campo), passar pelo helper e emitir no `Helmet`. Se o usuário pedir, trate
como tarefa de código, com teste, e não improvise JSON dentro do texto.

Duas cautelas antes de propor:

- **O ADR-002 manda um único `FAQPage` por página.** Se um dia o post passar a
  exibir a FAQ do destino, as duas fontes não podem virar dois blocos.
- **A resposta do schema tem que ser idêntica à visível.** Schema que promete o
  que a página não mostra é penalizado, e a regra vale desde a FAQ em camadas.

## O que dá para conseguir só escrevendo

O Google entende estrutura sem JSON-LD, e os motores generativos leem o texto,
não a marcação. Isso significa que boa parte do ganho de "schema" vem de formato:

**FAQ.** Pergunta como `###`, resposta no parágrafo imediatamente abaixo, 40 a 60
palavras, sem depender do resto do texto. É o formato que vira citação e que o
Google reconhece como par de pergunta e resposta mesmo sem `FAQPage`.

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
