---
name: instagram
description: >-
  Cria, revisa e publica conteúdo do Instagram da Movepark
  (@moveparkestacionamento): carrossel, post único, reel e story. Cobre o corte
  de um blogpost em 3 a 4 conteúdos, a legenda com gancho nos primeiros 125
  caracteres, palavra-chave para a busca do Instagram e para o Google (que
  indexa legenda e alt de conta profissional desde 10/07/2025), hashtags em
  camadas com o banco por aeroporto, CTA de link na bio com UTM, alt de
  acessibilidade, imagens sempre geradas no Higgsfield em 4:5 e entregues em
  JPEG, e as regras duras da API de publicação. Use SEMPRE que o pedido
  envolver Instagram da Movepark, mesmo sem a palavra "Instagram": "corta esse
  post pro insta", "faz um carrossel sobre Confins", "escreve a legenda",
  "monta os stories dessa promoção", "que hashtag usar", "cria o post de
  divulgação do blog", "transforma esse artigo em conteúdo social". Também use
  ao revisar legenda já escrita, ao planejar o calendário e antes de qualquer
  escrita em social_post. NÃO se aplica a copy de landing page (use
  copy-lp-queiroz), a texto de UI (use revisar-texto) nem ao corpo do blogpost
  (use blogpost-seo-geo).
---

# Instagram da Movepark: corte, legenda e publicação

O blog responde por **22,6% dos cliques orgânicos** do site, com 4.598 cliques em
16 meses sobre 93 posts, e **nenhum deles tem backlink**. O post ganha busca e
não ganha distribuição: ninguém o compartilha, ninguém o cita, ele vive de
Google e mais nada.

O Instagram é a superfície que falta, e desde **10/07/2025** ele deixou de ser só
social: conteúdo público de conta profissional é **indexado por Google e Bing**,
legenda e **alt** inclusive. Um carrossel bem escrito passou a somar sinal para a
mesma busca que o post disputa, em vez de só entreter.

Isso manda em tudo que vem abaixo. Post de Instagram da Movepark não é recado
solto: ele **sai de um conteúdo que já existe**, carrega a mesma frase-chave, e
devolve a pessoa para a página que converte.

Contexto de conteúdo em [`docs/specs/blog.md`](../../../docs/specs/blog.md) e
[`plano-conteudo-aeroportos.md`](../../../docs/specs/plano-conteudo-aeroportos.md).
A automação de publicação é a **E3.6**.

## Passo 1: de onde sai o conteúdo

**Nunca invente a pauta.** Um post do Instagram nasce de uma destas três fontes,
nesta ordem de preferência:

| Fonte | Quando | O que herda |
|---|---|---|
| **Blogpost publicado** | Padrão. Todo post vira 3 a 4 conteúdos | Frase-chave, números, FAQ, tabela de preço, CTA |
| **Página de destino** (`/destinos/<slug>`) | Aeroporto sem post recente | Distância, terminais, lotes listados |
| **Fato do dia** | Feriado, greve, obra no aeroporto, alta de demanda | Nada. É o único caso que escreve do zero |

### Os quatro cortes de um blogpost

Saem da estrutura do post, não da imaginação. Um post da skill
`blogpost-seo-geo` já nasce com H2 em pergunta, tabela de preço, FAQ e CTA, e é
exatamente isso que vira slide.

| # | Corte | Fonte no post | Formato | Cadência |
|---|---|---|---|---|
| 1 | **O gancho da frase-chave** | H1 + abertura de 90 palavras | carrossel de 5 a 7 slides | D+0 |
| 2 | **Quanto custa** | tabela de preços | carrossel, 1 slide por faixa de diária | D+2 |
| 3 | **A pergunta que todo mundo faz** | 1 item da FAQ | post único, resposta primeiro | D+4 |
| 4 | **O erro que custa caro** | H2 de objeção | carrossel curto de 4 slides, ou reel | D+7 |

Quatro posts no mesmo dia queimam o alcance de todos. Uma semana de cadência dá
ao algoritmo quatro chances de achar público diferente para o mesmo artigo.

**Um corte só existe se ele se sustenta sozinho.** Se o slide 1 depende de ler o
blog para fazer sentido, o corte está errado: refaça. O post é o aprofundamento,
não o pré-requisito.

## Passo 2: as regras duras

Estas não são preferências. As de cima quebram a publicação, as de baixo quebram
a marca. Números conferidos na documentação da Meta, detalhe em
[`references/api-instagram.md`](references/api-instagram.md).

| Regra | Por quê |
|---|---|
| Imagem em **JPEG**, nunca `.webp` nem PNG | A API rejeita qualquer outro formato. O blog gera `.webp`, então o corte **sempre** converte |
| Largura máxima **1440px**, arquivo até **8 MB** | Acima disso a criação do container falha. O padrão da casa é **1080 x 1350** (4:5) |
| Proporção entre **4:5 e 1.91:1** | Fora da faixa o Instagram corta sozinho, e corta errado |
| Carrossel de no máximo **10 slides** | Limite da API, mesmo que o app aceite mais |
| Legenda até **2.200 caracteres**, **30 hashtags** e **20 @** | Limite duro. Passar disso recusa a publicação inteira |
| Alt em **toda** imagem, até 1.000 caracteres | É acessibilidade **e** é indexado pelo Google. Não vale para reel e story, que não aceitam o campo |
| Zero travessão `—` e traço `–` | Regra do `CLAUDE.md` para o projeto inteiro. Use ponto, vírgula, dois-pontos ou " - " |
| Nenhuma promessa de transação | **ADR-009**. Nada de "vaga garantida", "cancelamento grátis", "preço fixo". A promessa mora na unidade, onde `getLocationCapabilities` manda |
| Todo R$ carrega **data de referência** | Tarifa sem data vira promessa que ninguém consegue retirar depois |
| **Movepark** é uma palavra, M maiúsculo | Nunca "MovePark", "Move Park" ou "MOVEPARK" |
| Nunca cite concorrente pelo @ | Marcar arroba de quem vende vaga entrega audiência de graça |

## Passo 3: a legenda

Seis blocos, nesta ordem. A estrutura vale para carrossel e para post único.

```
1. GANCHO          até 125 caracteres, é tudo que aparece antes do "mais"
2. PROMESSA        uma frase dizendo o que a pessoa leva daqui
3. CORPO           3 a 6 blocos curtos, um por linha, com quebra entre eles
4. PROVA           número com unidade e data
5. CTA             uma ação só, link na bio
6. HASHTAGS        3 a 5, na última linha, depois de uma linha em branco
```

**O gancho é o trabalho inteiro.** Os primeiros 125 caracteres são o que decide
se alguém abre o resto, e são também o trecho que o Google mostra. Ele precisa
conter a frase-chave e uma tensão real. Quatro formatos que funcionam:

| Formato | Exemplo |
|---|---|
| Número que surpreende | "Estacionar em Guarulhos por 7 dias custa de R$ 89 a R$ 340. A diferença é o traslado." |
| Erro comum | "Quem deixa o carro no aeroporto de Confins costuma errar na hora de escolher o traslado." |
| Pergunta que a pessoa digita | "Quanto custa deixar o carro em Viracopos por uma semana?" |
| Contexto que muda a decisão | "Voo às 6h em Congonhas muda tudo na escolha do estacionamento." |

**O corpo é escaneável, não é prosa.** Linha curta, uma ideia por linha, quebra
entre blocos. Legenda em bloco único de 8 linhas não é lida no celular. Sem
emoji na prosa; no máximo um por bloco de lista, e só quando substitui um
marcador.

**Tom:** segunda pessoa, verbo no presente, frase curta. A voz é a do amigo que
já fez essa viagem, não a do folheto. Sem superlativo vazio, sem "imperdível",
sem exclamação em série. Referência em `PRODUCT.md` e `DESIGN.md`.

**Depois de escrever, passe pela skill `revisar-texto`.** É o portão anti-IA do
projeto e a legenda não é exceção: modelo produz travessão, "não é X, é Y" e
regra de três sem perceber.

Fórmulas prontas por tipo de corte em
[`references/legendas.md`](references/legendas.md).

## Passo 4: palavras-chave

A busca do Instagram lê a legenda, e desde julho de 2025 o Google também. Então
a legenda tem trabalho de SEO, não só de copy.

**A frase-chave é a mesma do post que originou o corte.** Ela aparece:

1. Nos primeiros 125 caracteres da legenda, de forma natural.
2. No alt de pelo menos uma imagem.
3. No texto do primeiro slide (o que vira capa na grade do perfil).

Duas ou três vezes na legenda inteira basta. Repetir dez vezes derruba a leitura
e não sobe nada.

**A demanda não é chute.** O arquivo
[`docs/specs/dados/cauda-longa-aeroportos.json`](../../../docs/specs/dados/cauda-longa-aeroportos.json)
tem 1.282 termos colhidos do autocomplete do Google. As perguntas de lá são
gancho pronto:

```bash
F=docs/specs/dados/cauda-longa-aeroportos.json
jq -r '.perguntas_por_aeroporto.GRU[]' $F | head -20
```

## Passo 5: hashtags

**De 3 a 5, nunca 30.** O limite duro é 30, mas o próprio Instagram recomenda de
3 a 5 desde que a busca passou a valer mais que a etiqueta. Bloco de 30 hashtags
hoje sinaliza spam e derruba entrega.

Monte em três camadas, uma de cada:

| Camada | O que é | Alcance | Exemplos |
|---|---|---|---|
| **Praça** | O aeroporto ou a cidade | Alto, disputado | `#aeroportodeguarulhos` `#viracopos` `#confins` |
| **Intenção** | O que a pessoa quer resolver | Médio, qualificado | `#estacionamentoaeroporto` `#viagemdecarro` `#dicasdeviagem` |
| **Marca** | Nossa, sempre a última | Baixo, é acervo | `#movepark` |

Banco por aeroporto e por tema em
[`references/hashtags.md`](references/hashtags.md), com a lista das que estão
proibidas e o motivo.

**Hashtag vai na legenda, não no primeiro comentário.** O comentário some da
indexação, e o esconderijo não engana mais o algoritmo desde que a busca por
texto passou a valer.

## Passo 6: CTA

**Uma ação por post, nunca duas.** "Salva esse post e comenta e clica no link"
não converte nada, porque a pessoa não escolhe.

Legenda do Instagram **não tem link clicável**. Então o CTA fecha sempre no link
da bio, e o link da bio carrega UTM para a atribuição funcionar:

```
https://movepark.co/destinos/<slug>?utm_source=instagram&utm_medium=social&utm_campaign=<slug-do-post>
```

| Objetivo do corte | CTA |
|---|---|
| Corte 1 (gancho) | "O guia completo está no link da bio." |
| Corte 2 (preço) | "A tabela atualizada fica no link da bio." |
| Corte 3 (FAQ) | "Tem mais dúvida? Manda aqui nos comentários." |
| Corte 4 (erro) | "Compara os lotes no link da bio antes de reservar." |

**O CTA não promete o que a unidade não declara (ADR-009).** "Reserve com
cancelamento grátis" é promessa de transação e está proibido na legenda, porque
a capacidade vive na unidade e varia por lote.

## Passo 7: imagens no Higgsfield

Toda imagem de post do Instagram nasce no **Higgsfield**, mesma regra do blog.
Não use `gerar-imagens-gemini` aqui.

### Escolha do modelo

Conferido no catálogo em 03/09/2026. **O modelo importa por causa da proporção:**

| Uso | Modelo | Proporção | Por quê |
|---|---|---|---|
| Feed, carrossel, post único | `nano_banana_pro` | **4:5** | É o único da casa que aceita 4:5 nativo, e ainda entrega 2k/4k |
| Story e reel | `soul_2` ou `nano_banana_pro` | 9:16 | Ambos aceitam |
| Gente realista, UGC, editorial | `soul_2` | 3:4 e recorta para 4:5 | **`soul_2` não aceita 4:5.** Gerar em 3:4 e cortar, ou trocar de modelo |
| Fundo chapado, ícone, vetor de marca | `recraft_v4_1` | 4:5 | Aceita paleta fixa por `colors` |

Se as tools não estiverem carregadas, busque com `ToolSearch` por
"higgsfield generate image". Uma imagem: `generate_image`. Várias independentes:
`generate_image_batch` + `jobs_wait` + um `show_generation_by_ids` no fim.

```
generate_image({ params: {
  model: "nano_banana_pro",
  aspect_ratio: "4:5",
  resolution: "2k",
  prompt: "<prompt em inglês>"
}})
```

### O prompt

Em inglês, descritivo, fotográfico e **sem texto na imagem**. Diga assunto,
enquadramento, luz e clima. O que funciona para a marca: luz natural de fim de
tarde, cor dessaturada, ponto de vista de quem está ali, nada de stock sorridente.

> `wide shot of a covered airport parking lot at golden hour, rows of cars, a
> traveler pulling a suitcase toward a shuttle van, warm natural light, muted
> colors, realistic photography, no text, no logos`

**Nunca peça texto dentro da imagem.** Modelo de difusão erra número e erra
acento, e a tipografia da marca é Inter, que ele não reproduz. O texto entra por
cima, no template.

### O texto por cima da imagem

Slide com título grande é composto, não gerado. Use
[`assets/slide-template.html`](assets/slide-template.html), que já carrega os
tokens da marca (navy `#29263F`, violet `#5D5FEF`, Inter) em 1080 x 1350:

1. Edite o `<h1>` e o `<p>` do template, e aponte o `--foto` para o arquivo do
   Higgsfield.
2. Abra com as ferramentas de browser, `resize_window` para 1080 x 1350 e tire
   o screenshot.
3. Converta para JPEG (passo seguinte).

Regras de composição: no máximo **12 palavras** por slide, tipo grande o
bastante para ler no feed sem abrir, contraste de texto sobre foto garantido por
uma camada escura, e o violeta reservado para o número ou o destaque, nunca para
o fundo inteiro.

### Conversão e nome do arquivo

O Higgsfield devolve PNG ou JPEG grande. Padronize antes de publicar:

```bash
# 1080x1350, JPEG, qualidade 82, sRGB, dentro dos 8 MB
magick entrada.png -resize 1080x1350^ -gravity center -extent 1080x1350 \
  -colorspace sRGB -quality 82 estacionamento-aeroporto-guarulhos-01.jpg
```

Nome em kebab-case com a palavra-chave e o número do slide, sem acento:
`estacionamento-aeroporto-guarulhos-01.jpg`. Nome genérico (`slide1.jpg`, hash)
é proibido: o arquivo vai para o `assets-public` e o nome é sinal de busca.

Path no bucket: `assets-public/social/<slug-do-post>/<arquivo>.jpg`.

## Passo 8: alt

**Toda imagem leva alt**, e aqui ele rende duas vezes: acessibilidade e
indexação no Google. Até 1.000 caracteres, mas 2 linhas resolvem.

- Descreva o que a imagem mostra, em pt-BR, sem começar com "imagem de".
- A capa leva a frase-chave de forma natural; as demais variam a descrição,
  porque alt repetido é sinal ruim.
- Reel e story **não aceitam** o campo. Não perca tempo escrevendo.

Bom: `pátio coberto de estacionamento no aeroporto de Guarulhos com van de
traslado parada na saída`
Ruim: `imagem de estacionamento` ou `foto 1`

## Passo 9: cadência e horário

- **Um corte por dia no máximo**, e a semana do post fica assim: D+0, D+2, D+4, D+7.
- **Nunca dois posts no mesmo dia.** O segundo canibaliza o alcance do primeiro.
- Story pode acompanhar o post do dia, com a mesma arte em 9:16 e o sticker de
  link para a página do destino.
- O limite da API é de 100 posts por 24h, e carrossel conta como 1. Não é
  restrição para esta operação.

## Passo 10: medir antes de publicar

Não declare o conteúdo pronto sem rodar isto. O script mede o que dá para medir
e falha alto no que quebra a publicação ou a marca.

```bash
node .claude/skills/instagram/scripts/analisar-carrossel.mjs <rascunho.md>
```

Saída em semáforo por grupo: Entrada, Legenda, Palavra-chave, Hashtags, CTA,
Imagens, Marca. `ok` passou, `!!` merece atenção, `XX` bloqueia, e o script sai
com código 1 se houver bloqueio.

**Itere até zerar os `XX` e sobrar no máximo dois `!!`.** Cada laranja que ficar
precisa de justificativa explícita, não de silêncio.

## Passo 11: publicar

**Hoje é manual**, pelo app ou pelo Meta Business Suite, usando os arquivos e a
legenda que a skill produziu.

**Quando a E3.6 entrar**, o rascunho vira linha em `social_post` com status
`draft`, aparece em `/manager/social` para aprovação e o `pg_cron` publica na
data agendada. O que muda para quem escreve: nada. O formato de saída desta
skill já é o payload daquela tabela.

Detalhe do fluxo de API, incluindo o container que expira em 24h e o motivo de
não existir agendamento nativo, em
[`references/api-instagram.md`](references/api-instagram.md).

## O arquivo de trabalho

Um `.md` com front matter alimenta a análise, a composição dos slides e o
payload do banco, então nada se perde na passagem. Guarde no scratchpad até
publicar.

```markdown
---
tipo: carrossel
corte: 1
origem_post: estacionamento-no-aeroporto-de-confins-guia-completo
destination: aeroporto-de-confins
keyphrase: estacionamento no aeroporto de Confins
publicar_em: 2026-09-10
cta_url: https://movepark.co/destinos/aeroporto-de-confins?utm_source=instagram&utm_medium=social&utm_campaign=confins-guia
slides:
  - texto: Estacionar em Confins custa de R$ 45 a R$ 120 a diária
    arquivo: estacionamento-aeroporto-confins-01.jpg
    alt: pátio de estacionamento no aeroporto de Confins ao entardecer
  - texto: O traslado é o que separa o barato do caro
    arquivo: estacionamento-aeroporto-confins-02.jpg
    alt: van de traslado parada na saída do estacionamento
hashtags: [confins, estacionamentoaeroporto, movepark]
---

Quanto custa deixar o carro no aeroporto de Confins por uma semana?

De R$ 315 a R$ 840, e a conta muda menos pelo pátio do que pelo traslado.

...

O guia completo está no link da bio.

#confins #estacionamentoaeroporto #movepark
```

## Checklist final

Antes de dizer que está pronto:

1. Analisador sem nenhum `XX` e com os `!!` justificados.
2. Passou pela skill `revisar-texto`.
3. Zero travessão, zero promessa de transação, zero @ de concorrente.
4. Gancho com a frase-chave nos primeiros 125 caracteres.
5. De 3 a 5 hashtags, nas três camadas, marca por último.
6. Um CTA só, com UTM na URL da bio.
7. Alt em toda imagem, e nenhum repetido.
8. Imagens em JPEG, 1080 x 1350, abaixo de 8 MB, nome com a palavra-chave.
9. Todo R$ com data de referência.
10. Carrossel com no máximo 10 slides.
