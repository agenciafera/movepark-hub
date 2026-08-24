---
name: blogpost-seo-geo
description: >-
  Escreve, revisa e publica blogpost do Movepark otimizado para liderar
  ranqueamento no Google (padrão de análise do Yoast) e para ser citado pelas
  IAs (GEO: ChatGPT, Gemini, Perplexity, Claude, AI Overviews). Cobre revisão
  ortográfica, tom jovem e moderno, sintaxe de markdown válida sem nenhum HTML
  cru na tela, densidade de palavra-chave, palavra-chave na primeira frase, no
  título, nos headings e no alt das imagens, link interno e link externo com
  contexto que nunca aponta para concorrente de estacionamento, mínimo de 3.000
  palavras, tabela de preços, Schema Markup e checagem de canibalização contra
  os 93 posts do acervo. Use SEMPRE que o pedido envolver post de blog do
  Movepark, mesmo que a palavra "SEO" não apareça: "escreve um post sobre
  estacionamento em Confins", "cria um artigo pro blog", "revisa esse post",
  "otimiza esse texto do blog", "por que esse post não ranqueia", "faz um
  conteúdo pra aparecer no ChatGPT", "preciso de um artigo de 3 mil palavras".
  Também use ao auditar post já publicado, ao planejar pauta e antes de
  qualquer escrita em blog_post ou public/blog/. NÃO se aplica a copy de
  landing page (use copy-lp-queiroz) nem a texto de UI (use revisar-texto).
---

# Blogpost que lidera no Google e é citado pelas IAs

O blog do Movepark responde por **22,6% dos cliques orgânicos do site**, com 4.598
cliques em 16 meses sobre 93 posts herdados do WordPress. Post novo entra num
acervo que já tem 35 artigos sobre Guarulhos e 26 sobre Viracopos, muitos quase
idênticos, e **94 URLs presas em "rastreada, mas não indexada"** no Search Console.

Esse número manda em tudo que vem abaixo. Publicar mais um texto genérico sobre o
mesmo aeroporto não soma tráfego, subtrai: divide sinal entre páginas que disputam
a mesma busca. Um post só se paga quando ganha uma intenção que o acervo ainda não
cobre, e quando é bom o bastante para ser a resposta que o Google mostra e a IA cita.

Contexto técnico completo em [`docs/specs/blog.md`](../../../docs/specs/blog.md).
Ler antes de mexer em slug, URL ou taxonomia.

## Passo 1: antes de escrever, três portões

Não abra o editor sem passar por eles. É mais barato descobrir aqui que a pauta
não vale do que depois de 3.000 palavras.

**1.1 Frase-chave.** Uma por post, específica, do jeito que a pessoa digita.
"estacionamento no aeroporto de Confins" serve. "estacionamento" não serve
(genérica demais, o acervo inteiro disputa). Declare também 2 a 4 sinônimos e
variações reais ("estacionar em Confins", "estacionamento CNF", "deixar o carro
no aeroporto de BH"), porque texto que repete a mesma frase 30 vezes soa robótico
para o leitor e para o Google.

**1.2 Canibalização.** Rode a busca no acervo antes de escrever, separando post
vivo de post morto:

```bash
grep -ril "confins" public/blog/ | sed 's|.*/||;s|\.md$||' | while read s; do
  grep -q "\"$s\"" public/blog-slugs.json && echo "VIVO  $s" || echo "MORTO $s"
done
```

`public/blog/` guarda os 95 posts importados do WordPress, mas **26 deles saíram
do ar na consolidação por intenção de 15/08/2026** e hoje respondem 301. O
comando acima distingue os dois porque `public/blog-slugs.json` é regerado no
build a partir do banco e lista só o que está publicado. Atualizar um post MORTO
é trabalho perdido: a URL nunca abre.

O acervo herdado tinha até oito posts disputando a MESMA consulta ("melhor
estacionamento Viracopos"), e o Google não elege vencedor entre páginas irmãs. A
correção elegeu **um vencedor por intenção e por aeroporto**, pelos cliques de 16
meses do Search Console, e mandou os 26 perdedores para 301 direto no vencedor.
O mapa `BLOG_CONSOLIDATED_SLUGS` em [`src/worker.ts`](../../../src/worker.ts) é
a lista canônica de quem ganhou o quê:

```bash
grep -n "<slug-que-voltou-morto>" -A 1 src/worker.ts
```

Com isso na mão, decida:

| O que a busca achou | O que fazer |
|---|---|
| Post VIVO na mesma intenção | **Atualizar esse post.** Ele tem histórico, e post novo sobre o mesmo tema rouba dele |
| Post MORTO na mesma intenção | Atualizar o **vencedor** que o mapa aponta, nunca o morto |
| Nada na mesma intenção | Aqui, e só aqui, cabe post novo |

Intenção é preço, como reservar, comparativo ou guia do aeroporto. Mesmo
aeroporto com intenção diferente é post novo legítimo; mesma intenção é
canibalização, e foi ela que custou 26 páginas em agosto. Diga ao usuário em qual
dos três casos a pauta caiu antes de escrever uma linha.

**1.3 Intenção e ângulo.** Escreva em uma frase o que a pessoa quer resolver e o
que ela precisa saber para decidir. Se a resposta couber num parágrafo, o assunto
não sustenta 3.000 palavras: escolha um recorte maior ou junte com uma pauta
vizinha. Post longo e vazio é pior que post curto e útil, e o Google mede
satisfação, não contagem.

## Passo 2: as regras duras

Estas não são preferências. Quebrar qualquer uma quebra o site, o contrato de URL
ou uma regra de arquitetura do projeto.

| Regra | Por quê |
|---|---|
| Corpo em **markdown puro**, zero HTML | O render (`markdown.logic.ts`) não interpreta HTML: ele **imprime a tag na tela**. Não existe caminho de `dangerouslySetInnerHTML`, e é de propósito (sem XSS) |
| Só estes blocos: `##` `###` `####`, parágrafo, lista (um nível de sublista), citação `>`, imagem, `---`, tabela | É o escopo fechado do parser. **Bloco de código, crase inline, `~~riscado~~`, HTML e `#` de nível 1 saem literais na tela** |
| O `#` do título nunca vai no corpo | O H1 é o `title` do post, renderizado pela página |
| Zero travessão `—` e traço `–` | Regra do `CLAUDE.md` para o projeto inteiro. Use ponto, vírgula, dois-pontos ou " - " |
| Nenhuma promessa de transação | **ADR-009**: post não declara capacidade. Nada de "vaga garantida", "cancelamento grátis", "preço fixo". A promessa mora na unidade, onde `getLocationCapabilities` manda |
| Todo valor em R$ carrega **data de referência** e link para `/destinos/<slug>` | Tarifa sem data vira promessa que o código não consegue retirar. Com data e link, é retrato datado mais o preço vivo a um clique |
| Link externo **nunca** para quem vende vaga | Inclui agregador, comparador, site próprio de parceiro e a página de estacionamento do próprio aeroporto. Lista em [`scripts/fontes.json`](scripts/fontes.json), regra em [`references/links-e-fontes.md`](references/links-e-fontes.md) |
| Slug publicado **nunca** muda | Os 93 slugs herdados são o contrato de URL que guarda o tráfego, congelados em `legacy-slugs.json`. Renomear é apagar uma URL que o Google conhece |
| Slug novo **nunca** pode estar em `BLOG_CONSOLIDATED_SLUGS` | O worker responde 301 antes de servir a página. O post existiria no banco e apareceria no Manager, mas a URL nunca abriria, e a falha é silenciosa |
| Republicar post despublicado = republicar **e** tirar do mapa | Mexer só no `is_published` não basta: enquanto a entrada viver em `BLOG_CONSOLIDATED_SLUGS`, a URL segue em 301 e a página fica inalcançável |

## Passo 3: o arquivo de trabalho

Escreva o rascunho como um `.md` com front matter. Um arquivo só alimenta a
análise, o payload do banco e o `.md` que os agentes leem, então nada se perde na
passagem. Guarde o rascunho no scratchpad da sessão até publicar.

```markdown
---
slug: estacionamento-no-aeroporto-de-confins-guia-completo
title: Estacionamento no aeroporto de Confins: o guia que resolve
meta_title: Estacionamento no aeroporto de Confins: preços e como escolher
meta_description: Como escolher o estacionamento no aeroporto de Confins sem pagar caro: traslado, cobertura, distância e o que muda no preço em 2026.
keyphrase: estacionamento no aeroporto de Confins
sinonimos: [estacionar em Confins, estacionamento CNF, deixar o carro em Confins]
category: guias
tags: [traslado, economia, estadia-longa]
author: <slug do autor>
destination: aeroporto-de-confins
cover_image_url: https://.../assets-public/blog/<slug>/capa.webp
cover_alt: estacionamento no aeroporto de Confins com vagas cobertas
---
```

`category` sai de: `precos`, `comparativos`, `como-reservar`, `dicas-de-viagem`,
`guias`. `tags` saem de: `vaga-coberta`, `valet`, `traslado`, `seguranca`,
`economia`, `estadia-longa`, `reserva-online`, `estrutura`, `cancelamento`. Os
dois catálogos vivem em [`scripts/blog-taxonomy.mjs`](../../../scripts/blog-taxonomy.mjs);
slug fora deles é recusado na escrita. `destination` é o slug do aeroporto em
`destination`, e é ele que liga o post ao CTA que converte.

## Passo 4: escrever

**Estrutura que ranqueia e é citável** (o detalhe de cada bloco está em
[`references/geo-ia.md`](references/geo-ia.md)):

1. **Abertura que responde na hora**, até 90 palavras, com a frase-chave na
   primeira frase. É o trecho que vira AI Overview e resposta de chatbot.
2. **H2 em forma de pergunta**, do jeito que a pessoa pergunta. Logo abaixo de
   cada um, um parágrafo autossuficiente que responde sozinho, sem depender do
   resto do texto. Motor generativo extrai trecho, não página.
3. **Tabela sempre que houver dado comparável.** Preço por diária, comparativo
   entre opções, distância e tempo de traslado. Tabela é o formato que o modelo
   consegue ler inteiro e que o Google usa em rich result.
4. **Números com unidade e fonte.** "12 minutos de traslado", "capacidade de 400
   vagas", "R$ 89,90 a diária em agosto de 2026". Adjetivo não é citável, número é.
5. **FAQ no fim**, 5 a 8 perguntas reais, resposta de 40 a 60 palavras cada.
6. **CTA para `/destinos/<slug>`**, sem prometer nada que a unidade não declare.

**Tom: jovem e moderno, sem virar caricatura.** Segunda pessoa ("você chega no
aeroporto e..."), frases curtas, verbo no presente, zero jargão corporativo. Sem
gíria datada, sem emoji na prosa, sem exclamação em série. O humor entra seco e
pontual, não como piada. A voz é a do amigo que já fez essa viagem e conta como
é, não a do folheto. Referência de marca em `PRODUCT.md` e `DESIGN.md`.

**Ortografia e gramática.** Passe o texto inteiro procurando os erros que a
revisão automática não pega: crase ("vou à Guarulhos" está errado, cidade que não
pede artigo não leva crase), "mas" x "mais", "a" x "há" em tempo decorrido,
"onde" x "aonde", "por que / porque / por quê / porquê", concordância em frase
longa, hífen pós-acordo ("micro-ondas", "autoatendimento"). Nomes próprios
conferidos um a um: **Movepark** (uma palavra, M maiúsculo), Viracopos, Confins,
Afonso Pena, Guarulhos, Humberto Delgado. Lista completa em
[`references/revisao-ortografica.md`](references/revisao-ortografica.md).

**Depois de escrever, passe pela skill `revisar-texto`.** Ela é o portão anti-IA
do projeto (travessão, "não é X, é Y", regra de três, superlativo vazio,
prolixidade) e vale para o post inteiro, não só para os títulos.

## Passo 5: medir com o analisador

Não declare o post otimizado sem rodar isto. O script implementa os critérios do
Yoast adaptados ao projeto, e falha alto no que quebra o site.

```bash
node .claude/skills/blogpost-seo-geo/scripts/analisar-post.mjs <rascunho.md>
```

Saída em semáforo por grupo: Entrada, SEO, Sintaxe e render, Preço e ADR-009,
Legibilidade, GEO. `ok` passou, `!!` merece atenção, `XX` bloqueia. O script sai
com código 1 se houver qualquer bloqueio, então serve de gate.

**Itere até zerar os `XX` e sobrar no máximo três `!!`.** Cada laranja que ficar
precisa de justificativa explícita para o usuário, não de silêncio. Os limites de
cada critério e o motivo de cada um estão em
[`references/yoast-criterios.md`](references/yoast-criterios.md); leia esse arquivo
quando um resultado parecer injusto, antes de mexer no texto para agradar a métrica.

Cuidado com o vício clássico: o objetivo é o texto bom que passa na medida, não a
medida verde num texto pior. Se para chegar em 1% de densidade a frase-chave
precisar entrar torta em oito lugares, o problema é a frase-chave, não o texto.

## Passo 6: Schema Markup

A página do post já emite `BlogPosting` e `BreadcrumbList` automaticamente
(`src/routes/blog-post.tsx` com os helpers de `src/lib/jsonld.ts`), e o `.md`
para agentes carrega título, data e canônica no cabeçalho. O que **não** existe
hoje é `FAQPage` no post, mesmo com o bloco de FAQ escrito.

Escreva a FAQ do jeito certo mesmo assim (pergunta como `###`, resposta no
parágrafo seguinte): é o formato que o Google entende sem JSON-LD e que a IA cita.
Se o usuário quiser o `FAQPage` de verdade, isso é mudança de código na rota, não
de conteúdo. As receitas, o que já é automático e o que exigiria código estão em
[`references/schema-markup.md`](references/schema-markup.md).

## Passo 7: publicar

**Publicação é ação externa. Nunca marque `is_published: true` sem o usuário
mandar.** Entregue como rascunho, mostre o relatório do analisador e pergunte.

Ao publicar, três coisas acontecem juntas, e faltar uma deixa o post capenga:

1. **Registro no banco.** Preferencialmente pela rota interna
   `POST /v1/blog/posts` ou pela tool de MCP de Manager (escopo de plataforma
   `blog:write`). Sem a chave à mão, `execute_sql` com upsert por `slug` no
   Supabase MCP. Campos e validação em `supabase/functions/_shared/blog-write.ts`.
2. **`public/blog/<slug>.md` commitado.** Este arquivo é o que faz o post existir
   para as IAs: crawler de IA não roda JavaScript, e o `src/worker.ts` serve este
   `.md` na content negotiation em `text/markdown`. **O gerador
   (`scripts/import-wp-blog.mjs --markdown`) só lê do WordPress**, então post novo
   escrito no Hub não ganha o arquivo sozinho: escreva você, no mesmo formato de
   cabeçalho dos 93 existentes (título, resumo em citação, data, URL canônica,
   link do destino, `---`, corpo).
3. **Imagens no Storage**, em `assets-public/blog/<slug>/`, em WebP, largura
   máxima 1600px. Nunca hotlink de terceiro (os 10 hotlinks do Bing herdados já
   vinham quebrando e carregavam risco autoral).

Depois: `bun run test` e `bun run typecheck` verdes, `git status` sem untracked
que o código referencia, commit e push na `main`. O deploy sai sozinho em ~2
minutos. A URL abre na hora mesmo antes do build, porque o worker confirma o slug
no banco; o HTML pré-renderizado e a entrada no sitemap chegam no build seguinte.

## Checklist final

Antes de dizer que o post está pronto:

1. Analisador sem nenhum `XX` e com os `!!` justificados.
2. Passou pela skill `revisar-texto` (portão anti-IA) e por uma leitura de
   ortografia feita com atenção, não em diagonal.
3. Zero HTML, zero travessão, zero bloco de código, títulos entre `##` e `####`.
4. Frase-chave no título, na primeira frase, em parte dos H2/H3, no slug, na meta
   description e em pelo menos um alt.
5. Pelo menos um link para `/destinos/<slug>`, dois ou três para outros posts, e
   um externo de fonte reconhecida com rótulo que diz o que é.
6. 3.000 palavras ou mais, com tabela onde houver dado comparável.
7. Todo R$ com data de referência e link para o preço vivo.
8. FAQ escrita, abertura autossuficiente, números com unidade.
9. Front matter completo, `category`, `tags` e `destination` dentro dos catálogos.
10. `public/blog/<slug>.md` escrito, imagens no Storage, tudo commitado.
11. Publicação só depois do "pode publicar" do usuário.

## Referências

Leia sob demanda, não tudo de uma vez:

- [`references/yoast-criterios.md`](references/yoast-criterios.md) - cada critério
  do analisador, o limite, a origem no Yoast e o que fazer quando falha.
- [`references/geo-ia.md`](references/geo-ia.md) - como o post é encontrado e
  citado por ChatGPT, Gemini, Perplexity, Claude e AI Overviews.
- [`references/schema-markup.md`](references/schema-markup.md) - o que já é
  emitido, as receitas de schema e o que exigiria mudança de código.
- [`references/links-e-fontes.md`](references/links-e-fontes.md) - a regra do link
  externo, quem é concorrente e quais fontes são seguras.
- [`references/revisao-ortografica.md`](references/revisao-ortografica.md) - os
  erros de pt-BR que passam batido e os nomes próprios do projeto.
