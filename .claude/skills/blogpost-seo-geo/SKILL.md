---
name: blogpost-seo-geo
description: >-
  Escreve, revisa e publica blogpost do Movepark otimizado para liderar
  ranqueamento no Google (padrão de análise do Yoast) e para ser citado pelas
  IAs (GEO: ChatGPT, Gemini, Perplexity, Claude, AI Overviews). Cobre revisão
  ortográfica, tom jovem e moderno, sintaxe de markdown válida sem nenhum HTML
  cru na tela, densidade de palavra-chave, palavra-chave na primeira frase, no
  título, nos headings e no alt das imagens, imagens sempre geradas no
  Higgsfield em .webp com a palavra-chave no nome do arquivo e no alt
  (acessibilidade), link interno e link externo com
  contexto que nunca aponta para concorrente de estacionamento, mínimo de 3.000
  palavras, tabela de preços, Schema Markup e checagem de canibalização contra
  os 93 posts do acervo. Use SEMPRE que o pedido envolver post de blog do
  Movepark, mesmo que a palavra "SEO" não apareça: "escreve um post sobre
  estacionamento em Confins", "cria um artigo pro blog", "revisa esse post",
  "otimiza esse texto do blog", "por que esse post não ranqueia", "faz um
  conteúdo pra aparecer no ChatGPT", "preciso de um artigo de 3 mil palavras".
  Também use ao auditar post já publicado, ao planejar pauta e antes de
  qualquer escrita em blog_post. NÃO se aplica a copy de
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

## Passo 1: antes de escrever, quatro portões

Não abra o editor sem passar por eles. É mais barato descobrir aqui que a pauta
não vale do que depois de 3.000 palavras.

**1.1 Frase-chave.** Uma por post, específica, do jeito que a pessoa digita.
"estacionamento no aeroporto de Confins" serve. "estacionamento" não serve
(genérica demais, o acervo inteiro disputa). Declare também 2 a 4 sinônimos e
variações reais ("estacionar em Confins", "estacionamento CNF", "deixar o carro
no aeroporto de BH"), porque texto que repete a mesma frase 30 vezes soa robótico
para o leitor e para o Google.

**A demanda não é chute.** [`docs/specs/dados/cauda-longa-aeroportos.json`](../../../docs/specs/dados/cauda-longa-aeroportos.json)
tem **1.282 termos únicos** colhidos do autocomplete do Google em 25/08/2026, de
13 raízes cruzadas com 20 modificadores. Consulte antes de inventar a frase-chave:

```bash
F=docs/specs/dados/cauda-longa-aeroportos.json
# tudo que menciona um aeroporto (as raízes não são separadas por praça)
jq -r '[.por_raiz[][]] | unique | .[]' $F | grep -Ei 'confins|\bcnf\b'
# só o que veio em forma de pergunta, já separado por praça
jq -r '.perguntas_por_aeroporto.CNF[]' $F
```

Três clusters concentram a disputa, e é por eles que o plano manda começar, nesta
ordem: **preço, valor e diária**; depois **proximidade**; depois **barato,
economia e desconto**. Juntos passam de 300 termos, com Guarulhos respondendo por
perto de 40% de cada um. Conte você mesmo antes de citar um número no post, porque
o total muda com a lista de sinônimos que você usar:

```bash
jq -r '[.por_raiz[][]] | unique | .[]' $F | grep -Ei 'guarulhos|\bgru\b' \
  | grep -Eci 'preço|preco|valor|diária|diaria|quanto custa'
```

Cauda só compensa depois que a cabeça tem dono. A estratégia inteira, com as fases
e a divisão de praças, está em
[`docs/specs/plano-conteudo-aeroportos.md`](../../../docs/specs/plano-conteudo-aeroportos.md).

**1.2 Canibalização.** Rode a busca no acervo antes de escrever, **e rode no
banco**, que é a fonte da verdade:

```sql
-- o que já está publicado naquele aeroporto, com o título que ele disputa hoje
select p.slug, p.title, p.meta_title, c.slug as categoria,
       p.published_at::date as publicado, length(p.body_md) as tamanho
from public.blog_post p
left join public.blog_category c on c.id = p.category_id
join public.destination d on d.id = p.destination_id
where d.slug = 'aeroporto-de-confins' and p.is_published and p.deleted_at is null
order by p.published_at desc;
```

**Não use `grep` em arquivo do repo para esta checagem.** O `public/blog/` deixou
de existir em 01/09/2026 (commit `da054b82`), e mesmo antes disso o arquivo
divergia do que a página renderiza, porque a página sempre leu `body_md`. Em
05/09/2026 essa armadilha custou caro: a checagem por `grep` num checkout 209
commits atrasado disse que o guia de Confins ainda era o texto de 1.060 palavras
de 2025, quando o banco já tinha a versão reescrita em 29/08 com o título
"Estacionamento aeroporto Confins: preços e comparativo 2026". Três posts foram
escritos contra um retrato velho, e um deles nasceu disputando a mesma intenção
do pilar.

Se o seu checkout estiver atrasado, `git fetch origin main` antes de qualquer
conclusão sobre o acervo. Título e `meta_title` do banco são o que diz qual
intenção cada post já reivindica.

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

**1.4 De onde vêm os números.** Descubra, antes de escrever, se o aeroporto tem
parceiro. Isso muda a origem de cada R$ do post e o trabalho de manutenção que
ele cria. Em 27/08/2026 eram **26 destinos publicados, 8 com parceiro e 18 sem**,
então a pauta sem parceiro é a maioria, não a exceção. Confirme na hora, porque
esse retrato muda a cada contrato assinado:

```sql
-- o retrato do dia: quantos publicados, quantos com parceiro listado
with pub as (select id, slug from destination where is_published = true)
select (select count(*) from pub) as publicados,
       (select count(*) from pub p where exists (
          select 1 from location l
          where l.destination_id = p.id and l.is_listed = true and l.deleted_at is null
       )) as com_parceiro;

-- do aeroporto da pauta: parceiro precificado (vazio = sem parceiro)
select jsonb_pretty(public.destination_price_index(array[1,7,30], 'aeroporto-de-confins'));
-- e os lotes mapeados, sem contrato
select * from public.destination_prospect_cards('aeroporto-de-confins');
```

| Origem | Como o preço entra no post | Envelhece? |
|---|---|---|
| **Parceiro** | Do motor de reservas, pelo `destination_price_index`. É o mesmo valor cobrado no checkout | Não. O link para `/estacionamentos/<slug>` leva ao preço vivo |
| **Não-parceiro** | Conferido na fonte por você, um a um, com nome da fonte e data da consulta no próprio post | **Sim, e ninguém avisa.** Ver abaixo |

**Tabela de aeroporto sem parceiro é permitida, e é o que ganha essas praças.**
Sem ela o post perde para quem publica número. Mas ela vem com três obrigações
que não são negociáveis:

1. **Confira na fonte, uma por uma.** Site do próprio estacionamento, perfil do
   Google Business, ou ligação com a data anotada. Nunca copie de agregador nem
   de post concorrente: você herdaria o erro e a desatualização deles.
2. **Cada linha carrega fonte e data.** "Site do Park Confins, consultado em
   27/08/2026". Sem isso a tabela vira invenção com cara de dado.
3. **Cite a fonte pelo nome, sem link.** A regra do Passo 2 vale aqui: link
   externo nunca vai para quem vende vaga, e a ficha do lote mapeado também
   proíbe apontar para o site dele ([`docs/specs/lote-mapeado-vitrine.md`](../../../docs/specs/lote-mapeado-vitrine.md)).
   Nomear a fonte dá verificabilidade; linkar entrega o clique.

**Não existe hoje nenhum mecanismo que monitore preço de não-parceiro.** O motor
cobre só o parceiro. Preço de não-parceiro que entra no post é retrato manual, e
sai da validade sem que nada quebre: nenhum teste falha, nenhum alerta dispara. É
por isso que ele **entra na revisão mensal** junto com as páginas de cabeça, e é
por isso que a data ao lado do número não é enfeite, é o que permite ao leitor e
ao modelo saberem o quanto confiar.

**O post é a única superfície onde esse preço aparece.** `/precos`,
`/estacionamentos/<slug>` e a ficha do lote seguem sem tarifa de não-parceiro, por
ADR-010 e por [`docs/specs/indice-precos.md`](../../../docs/specs/indice-precos.md):
lá o valor publicado é o valor cobrado, e essa é a vantagem estrutural sobre o
índice do concorrente. No post o número é editorial, datado e sem botão de
reserva, então não é promessa de transação e não conflita com ADR-009. Não leve
essa tabela para o produto.

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
| Todo valor em R$ carrega **data de referência**. De parceiro, mais o link para `/estacionamentos/<slug>`; de não-parceiro, mais o **nome da fonte** | Tarifa sem data vira promessa que o código não consegue retirar. O do parceiro tem o preço vivo a um clique; o do não-parceiro não tem para onde apontar, então a fonte nomeada é o que o substitui (portão 1.4) |
| Link externo **nunca** para quem vende vaga | Inclui agregador, comparador, site próprio de parceiro, site de lote mapeado e a página de estacionamento do próprio aeroporto. Vale **mesmo quando ele é a fonte do preço**: cite pelo nome, não linke. Lista em [`scripts/fontes.json`](scripts/fontes.json), regra em [`references/links-e-fontes.md`](references/links-e-fontes.md) |
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
cover_image_url: https://.../assets-public/blog/<slug>/estacionamento-aeroporto-confins.webp
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
   consegue ler inteiro e que o Google usa em rich result. Em aeroporto sem
   parceiro a tabela também vai, montada com o preço que você conferiu na fonte,
   e ganha uma coluna de **Fonte e data** (portão 1.4). Coluna vazia é pior que
   coluna ausente: se não conseguiu o número de um lote, tire a linha e diga no
   texto que aquele pátio não publica tarifa.
4. **Números com unidade e fonte.** "12 minutos de traslado", "capacidade de 400
   vagas", "R$ 89,90 a diária em agosto de 2026". Adjetivo não é citável, número é.
5. **FAQ no fim**, 5 a 8 perguntas reais, em `###` terminado em `?`, resposta de
   40 a 60 palavras cada no parágrafo logo abaixo. É esse formato que emite o
   `FAQPage` da página, e cada pergunta precisa ser própria do post.
6. **CTA para `/estacionamentos/<slug>`**, sem prometer nada que a unidade não declare.

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

## Passo 5: imagens (Higgsfield, .webp, palavra-chave no nome e no alt)

Toda imagem do post nasce no **Higgsfield** e chega ao leitor em **`.webp`**. Sem
exceção: para post de blog, esta regra **sobrepõe a skill `gerar-imagens-gemini`**
(que segue valendo para o resto do projeto).

1. **Gerar no Higgsfield.** Use o conector MCP do Higgsfield: `generate_image`
   para uma imagem, `generate_image_batch` + `jobs_wait` para várias independentes.
   Se as tools não estiverem carregadas, busque com `ToolSearch` por
   "higgsfield generate image". Prompt descritivo em inglês (assunto,
   enquadramento, luz, estilo fotográfico realista, sem texto sobreposto);
   aspect ratio 16:9 para capa e imagens de corpo.
2. **O nome do arquivo carrega a palavra-chave**, em kebab-case, sem acento e sem
   stopwords: a capa é `<palavra-chave>.webp` (ex.:
   `estacionamento-aeroporto-guarulhos.webp`) e as demais acrescentam um sufixo
   do que mostram (`estacionamento-aeroporto-guarulhos-traslado.webp`). Nome
   genérico (`capa.webp`, `imagem1.webp`, `hero.webp`, hash) é proibido: o nome
   do arquivo é sinal de SEO de imagem e o analisador cobra.
3. **Formato sempre `.webp`**, largura máxima 1600px. O Higgsfield devolve
   PNG/JPEG; baixe e converta antes de subir:

```bash
cwebp -q 82 -resize 1600 0 entrada.png -o estacionamento-aeroporto-guarulhos.webp
```

4. **Alt em toda imagem, sem exceção** (é acessibilidade, não enfeite): descreva
   em pt-BR o que a imagem mostra, sem começar com "imagem de" ou "foto de". A
   capa (e pelo menos uma imagem do corpo, quando houver várias) leva a
   palavra-chave no alt de forma natural; as demais variam a descrição, porque
   alt idêntico repetido é penalizado (regra em
   [`references/yoast-criterios.md`](references/yoast-criterios.md)).

## Passo 6: medir com o analisador

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

## Passo 7: Schema Markup

A página do post emite `BlogPosting`, `BreadcrumbList` e `FAQPage` sozinha
(`src/routes/blog-post.tsx` com os helpers de `src/lib/jsonld.ts`), e o `.md` para
agentes carrega título, data e canônica no cabeçalho.

O `FAQPage` sai do que **você escreveu no corpo**: `faqPairsFrom` varre o post
atrás de `###` terminado em `?` e leva o parágrafo (ou a lista) logo abaixo como
resposta. Ou seja, escrever a FAQ no formato certo é o que liga o schema. Três
detalhes que decidem se a pergunta entra:

- Pergunta em `###`. O `##` é seção do corpo e fica de fora.
- O título tem que terminar em `?`. É o filtro que impede o acervo herdado, que usa
  `###` para numerar passo, de emitir FAQ inventada.
- A resposta começa em parágrafo ou lista. Abrindo com tabela, a pergunta é
  descartada.

Abaixo de duas perguntas o bloco não é emitido, porque `FAQPage` descreve uma lista.

**A regra de conteúdo que sustenta isso: a FAQ do post pergunta o que só aquele
post responde.** As perguntas genéricas do aeroporto já respondem em `/faq/<slug>`,
em `/estacionamentos/<slug>` e na single (ADR-002); repetir uma delas aqui coloca a mesma
pergunta com a mesma resposta numa quarta URL. Se a pergunta caberia igual em
qualquer post daquele aeroporto, linke para `/faq/<slug>` em vez de repetir.

As receitas e o que ainda exigiria código estão em
[`references/schema-markup.md`](references/schema-markup.md).

## Passo 8: publicar

**Publicação é ação externa. Nunca marque `is_published: true` sem o usuário
mandar.** Entregue como rascunho, mostre o relatório do analisador e pergunte.

Ao publicar, três coisas acontecem juntas, e faltar uma deixa o post capenga:

1. **Registro no banco.** Preferencialmente pela rota interna
   `POST /v1/blog/posts` ou pela tool de MCP de Manager (escopo de plataforma
   `blog:write`). Sem a chave à mão, `execute_sql` com upsert por `slug` no
   Supabase MCP. Campos e validação em `supabase/functions/_shared/blog-write.ts`.
2. **Gêmeo markdown: nada a fazer, ele nasce do banco.** O `/blog/<slug>.md` é o
   que faz o post existir para as IAs, porque crawler de IA não roda JavaScript.
   Desde 01/09/2026 (commit `da054b82`) o `scripts/generate-geo-artifacts.mjs`
   lê `blog_post` e escreve `dist/blog/<slug>.md` no build, para todo post
   publicado. **Não escreva nem commite `public/blog/<slug>.md`**: essa pasta foi
   removida justamente porque o arquivo versionado divergia do `body_md` e o
   teste de contrato lia o arquivo, ficando verde sobre a versão errada. O que
   você escreve no `body_md` é o que sai no gêmeo.
3. **Imagens no Storage**, em `assets-public/blog/<slug>/`, geradas no
   Higgsfield, em `.webp` com a palavra-chave no nome do arquivo e alt em todas
   (Passo 5), largura máxima 1600px. Nunca hotlink de terceiro (os 10 hotlinks
   do Bing herdados já vinham quebrando e carregavam risco autoral).

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
   description, em pelo menos um alt e no nome dos arquivos de imagem.
5. Pelo menos um link para `/estacionamentos/<slug>`, dois ou três para outros posts, e
   um externo de fonte reconhecida com rótulo que diz o que é.
6. 3.000 palavras ou mais, com tabela onde houver dado comparável.
7. Todo R$ com data de referência. De parceiro, com link para o preço vivo; de
   não-parceiro, conferido na fonte com o nome dela no post e sem link para ela.
8. FAQ escrita no formato que liga o `FAQPage` (pergunta em `###` terminada em
   `?`, resposta em parágrafo logo abaixo, no mínimo duas), com pergunta própria do
   post e não cópia de `/faq/<slug>`. Abertura autossuficiente, números com unidade.
9. Front matter completo, `category`, `tags` e `destination` dentro dos catálogos.
10. Imagens geradas no Higgsfield, em `.webp` com a palavra-chave no nome e alt
    em todas, commitadas (o gêmeo markdown sai do banco, não é arquivo seu).
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

Specs do projeto que mandam no conteúdo, quando a pauta encostar nelas:

- [`docs/specs/plano-conteudo-aeroportos.md`](../../../docs/specs/plano-conteudo-aeroportos.md) -
  a estratégia por fases, os clusters de cabeça e a divisão de praças.
- [`docs/specs/indice-precos.md`](../../../docs/specs/indice-precos.md) - como o
  preço de parceiro é publicado no produto, e por que ali não entra não-parceiro.
- [`docs/specs/lote-mapeado-vitrine.md`](../../../docs/specs/lote-mapeado-vitrine.md) -
  ADR-010, o que a ficha do lote sem contrato mostra e o que ela proíbe.
- [`docs/specs/blog.md`](../../../docs/specs/blog.md) - slug, URL, taxonomia,
  consolidação e o `FAQPage` do post.
