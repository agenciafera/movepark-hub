# Sistema de ilustração (Recraft)

Como criar ilustrações da marca Movepark no **Recraft**, de forma consistente e
reproduzível, e como elas entram no design system. Este doc é a fonte da verdade da
linguagem de ilustração. Leia antes de gerar qualquer arte nova.

> **Três lanes de imagem, sem sobreposição.** Cada tipo de asset tem uma ferramenta:
> - **Foto (raster, realista)** → MCP `gemini-image` (ver `image-prompts.md` e a skill `gerar-imagens-gemini`).
> - **Ilustração (vetor, spot art)** → **Recraft** (este doc).
> - **Ícone de UI** → **Lucide** (nunca ilustração no lugar de ícone).
>
> Ilustração e foto não se misturam na mesma superfície. Foto carrega o clima do mundo
> real (heros de aeroporto); ilustração carrega estado, explicação e leveza (vazios,
> confirmação, onboarding, clube).

---

## 1. Para que serve

Ilustração no Movepark existe para dar rosto a momentos que a foto não cobre bem e que
o ícone é pequeno demais para carregar:

- **Estados vazios** (sem reservas, sem favoritos, histórico vazio).
- **Confirmação e sucesso** (reserva confirmada, voucher garantido, "boa viagem").
- **Onboarding e educação** (como funciona, seja parceiro, primeiros passos).
- **Erro e caminho errado** (404, vaga não encontrada, sem resultado).
- **Blocos de marca leves** (Movepark Clube, carteira, segurança, traslado).

Ilustração **não** decora sem função. Se o momento já é resolvido por ícone + texto, não
force uma ilustração.

---

## 2. A linguagem visual

Estilo: **vetor geométrico plano, moderno e limpo**, com a assinatura de movimento do
símbolo Movepark. A ideia-guia é a mesma do sistema: "A Rota Certa", calma e sem fricção.

Atributos concretos (valem para todas as peças):

- **Formas** simples e confiantes, com cantos generosos e arredondados. Sem detalhe
  desnecessário.
- **Sem contorno preto.** As formas se definem por campos de cor plana e espaço negativo.
  No máximo, uma aresta na própria cor mais escura da forma.
- **Profundidade por sobreposição** de formas planas + uma sombra chapada de um só tom
  (uma direção). Nada de gradiente pesado, brilho, vidro ou render 3D.
- **Motivo de movimento:** um ritmo de **lâminas diagonais paralelas a ~53°** (o mesmo
  ângulo do símbolo) aparece como linhas de movimento, estrutura de fundo ou moldura do
  foco. É a "rota" da marca. Use com parcimônia, como tempero, não como papel de parede.
- **Um único foco por peça.** Espaço negativo generoso (a peça costuma dividir espaço com
  texto de UI).
- **Pessoas (quando houver):** podem ser protagonistas, no estilo **geométrico editorial**
  (formas angulares e confiantes, blocos de cor plana que se sobrepõem, rosto com traços
  mínimos, gente diversa e real). É assim que a referência boa acerta (ver seção 10). O que
  **nunca** entra é o clichê "corporate memphis"/Alegria: bonecos de membros gigantes, mãos
  enormes, poses genéricas, sorriso vazio. Se a cena não pede gente, um carro/objeto/cena
  resolve igual.
- **Vocabulário de assunto:** carro em três-quartos (simplificado), estrutura de
  estacionamento, silhueta mínima de terminal e torre de controle, aviãozinho subindo,
  celular com o app, voucher com QR, van de traslado, mala, linha de rota e pin de local,
  escudo (confiança), moeda/carteira (clube).
- **Clima:** calmo, confiável, premium, humano, eficiente.

### O que a ilustração Movepark nunca é (bans)

- Verde neon, laranja saturado ou qualquer estética de app de mobilidade urbana (Uber/99).
- "Corporate memphis" / bonecos Alegria de membros desproporcionais.
- Gradiente pesado, brilho glossy, vidro, render 3D, skeuomorfismo com sombra dura.
- Fotorrealismo (isso é lane da foto).
- Clip-art genérico, banco de imagem, fundo poluído.
- Texto dentro da arte, marca d'água, assinatura.

---

## 3. Paleta travada

A ilustração usa **só** a paleta da marca. Trave essas cores no Recraft (campo de cores)
para o gerador não inventar tom fora do sistema. Hex e RGB (o Recraft pede RGB):

| Papel | Cor | Hex | RGB |
|---|---|---|---|
| Estrutura / tinta | Navy | `#29263F` | 41, 38, 63 |
| Acento focal | Indigo | `#4041A3` | 64, 65, 163 |
| Acento focal (ação/destaque) | Violet | `#5D5FEF` | 93, 95, 239 |
| Preenchimento calmo | Teal | `#A6DBDF` | 166, 219, 223 |
| Superfície suave | Pale blue | `#E4F2FF` | 228, 242, 255 |
| Alerta / atenção | Red | `#DA455E` | 218, 69, 94 |
| Sombra do símbolo | Red deep | `#AE374B` | 174, 55, 75 |
| Fundo / respiro | White | `#FFFFFF` | 255, 255, 255 |

Regras de cor (herdam o contrato do `DESIGN.md`):

- **Navy** é a espinha: contornos implícitos, silhuetas, tinta. É a cor que estrutura a cena.
- **Violet e indigo** são o **foco**: o objeto que importa (o carro reservado, o voucher, o
  botão da cena). Raros e intencionais, nunca preenchendo a peça inteira. Violeta é ação e
  destaque, não papel de parede (mesma regra do resto do sistema).
- **Teal e pale blue** são o ar: céu, superfícies calmas, sombras suaves, "sucesso suave".
- **Red** só entra em **alerta/atenção** (erro, prazo, cancelamento). Nunca como cor
  decorativa alegre.
- **Fundo** é branco ou pale blue. Nunca morno, nunca bege.

---

## 4. Montar o estilo "Movepark" no Recraft (o motor reproduzível)

A consistência não vem de caprichar em cada prompt, vem de **fixar um Style** e reusar. Faça
uma vez:

1. **Base:** crie as primeiras peças com **Vector Illustration** (exporta SVG, escala
   infinita, arquivo pequeno, editável). Substyle: comece sem substyle ou no mais "flat"
   disponível; evite substyles texturizados (grain, hand-drawn) que quebram o clean.
2. **Trave a paleta:** no controle de cores, adicione os 8 RGB da tabela acima. Isso empurra
   toda geração para dentro da marca.
3. **Gere um lote-semente** com o descritor completo (seção 5), 6 a 10 imagens de assuntos
   variados (carro, aeroporto, voucher, clube).
4. **Escolha as 3 a 5 melhores** que estão de fato on-brand (paleta certa, motivo diagonal
   presente, clean, um foco).
5. **"Create style" a partir dessas** (o Recraft aprende o estilo das referências e devolve
   um **Style**/`style_id`). Nomeie **`movepark-rota-v1`**.
6. **Daqui pra frente**, gere sempre com esse Style aplicado. O prompt encurta para
   só o assunto + composição (seção 5).
7. **Versionamento:** se um dia o estilo evoluir, crie `movepark-rota-v2` e registre a troca
   aqui. Nunca sobrescreva o v1 em silêncio (peças antigas dependem dele).

> Guarde o `style_id` gerado no registro (seção 8). É ele que garante que a arte de daqui a
> seis meses combine com a de hoje.

---

## 5. Estrutura do prompt

### 5.1. Descritor-mestre (para o lote-semente, sem Style ainda)

Cole este bloco no fim de qualquer prompt enquanto o Style `movepark-rota-v1` ainda não
existe. É ele que carrega a linguagem inteira:

```
Flat geometric vector illustration, modern and clean, in the Movepark brand style.
Confident simple shapes with generous rounded corners, no black outlines, defined by
flat color fields and negative space. Subtle single-tone flat shadows for depth, no
gradients, no glossy, no 3D. A rhythm of diagonal parallel blades at about 53 degrees
(echoing the Movepark symbol) used as motion lines or background structure, suggesting
travel and "the right route". Calm, trustworthy, premium, human mood. Strict brand
palette only: deep navy #29263F for structure and ink; indigo #4041A3 and violet
#5D5FEF as focal accents used sparingly; soft teal #A6DBDF and pale blue #E4F2FF as
calm fills and sky; brand red #DA455E only for alerts. White or pale-blue background,
generous negative space, one clear focal point. World of airport parking and travel.
NOT corporate-memphis people with oversized limbs, NOT neon green or orange ride-hailing
aesthetic, NOT heavy gradients, NOT photorealistic, NOT 3D render, no text, no watermark.
```

### 5.2. Template (com o Style já aplicado)

Com `movepark-rota-v1` ligado, o Style já carrega o visual. O prompt vira só:

```
[ASSUNTO + a ação única em foco]. [COMPOSIÇÃO: enquadramento + onde deixar espaço
negativo pro texto de UI]. [MOTIVO: onde as lâminas diagonais entram, se entrarem].
Brand palette, flat vector, one focal point, generous negative space. No text.
```

Prompts em **inglês** (o Recraft, como o Gemini, responde melhor). A prosa do doc fica em
pt-BR; a arte não leva texto.

---

## 6. Biblioteca de prompts (por contexto do app)

Prontos para usar com o Style `movepark-rota-v1` ligado. Sem o Style, some o descritor-mestre
(5.1) no fim de cada um.

**Estado vazio - sem reservas futuras** (`/account/reservas`, aba Próximas)
```
A single simple car parked calmly under a minimal open carport, seen in three-quarter
view, lots of empty sky above. A faint rhythm of diagonal blades in the background
suggests a route waiting to start. Composition centered-low, wide empty space on top for
UI text. Brand palette, flat vector, one focal point, generous negative space. No text.
```

**Sucesso - reserva confirmada / voucher garantido** (checkout, voucher)
```
A phone held upright showing a boarding-style ticket with a QR code, a small teal check
badge floating at the corner. Sense of "spot secured, safe trip". Diagonal blades sweep
softly behind the phone as motion. Focal object in violet/indigo, calm teal and pale-blue
around. Centered, balanced negative space. Brand palette, flat vector. No text.
```

**Estado vazio - sem favoritos** (`/account/saved`)
```
An empty outline of a heart resting over a simple parking-lot shape, calm and inviting,
not sad. Pale-blue background, teal accents. Plenty of negative space to the side for UI
text. Brand palette, flat vector, one focal point. No text.
```

**Erro - vaga/página não encontrada** (404, busca sem resultado)
```
A location pin at the end of a route line that took a small wrong turn, friendly and
low-drama. The wrong turn marked with a single small brand-red accent. Navy route on
pale-blue, generous empty space. Brand palette, flat vector, one focal point. No text.
```

**Busca - destino aeroporto** (`/destinos`, hero de destino leve)
```
A minimal airport scene: simplified terminal building and a control tower silhouette in
navy, a small airplane climbing on a diagonal, route lines leading to a parking structure
in the foreground. Teal sky, pale-blue base, one violet accent on the parking. Wide
composition, calm. Brand palette, flat vector. No text.
```

**Movepark Clube - dinheiro de volta / níveis** (`/account/clube`)
```
A small stack of stylized coins turning into an upward step ladder of four levels, a
simple car badge at the top. Indigo and violet as the focal accents, teal and pale-blue
fills, diagonal blades hinting momentum upward. Centered, balanced. Brand palette, flat
vector, one focal point. No text.
```

**Confiança / segurança** (blocos de trust)
```
A rounded shield gently protecting a simple parked car, calm and reassuring. Teal shield,
navy car, pale-blue background. No aggression, no lock cliche. Generous negative space.
Brand palette, flat vector, one focal point. No text.
```

**Traslado / shuttle** (aeroporto ↔ estacionamento)
```
A simple shuttle van moving along a route line between a parking structure and a minimal
terminal, diagonal motion blades trailing behind it. Navy van, teal and pale-blue scene,
one violet accent. Wide, calm composition. Brand palette, flat vector. No text.
```

**Seja parceiro - operação cheia** (`/seja-parceiro`, onboarding do parceiro)
```
A friendly parking structure seen in three-quarter view filling up with a few simple
cars, a subtle upward diagonal rhythm suggesting growth. Navy structure, teal and
pale-blue, one violet accent on a highlighted spot. Room on one side for UI text. Brand
palette, flat vector, one focal point. No text.
```

---

## 7. Export

- **Formato:** **SVG** sempre que a peça for vetor limpo (padrão do Recraft Vector
  Illustration). Vetor escala sem perda, pesa pouco e é editável. Se a peça precisar de
  raster (raro), exporte PNG e converta para **WebP** com `sharp`.
- **Limpeza do SVG:** rode um `svgo` antes de commitar (tira metadata, ids inúteis, casas
  decimais em excesso). Confira que sobraram só as cores da paleta.
- **Fundo:** transparente, para a peça assentar em qualquer superfície clara (canvas/pale).
- **Tema escuro:** a arte nasce para superfície clara. Se um dia precisar em dark, gere uma
  variante `-dark` (troca navy por um claro e o fundo por navy), não recolore no CSS.
- **Tamanho de arte:** desenhe a composição já pensando no slot (estado vazio ~ quadrado ou
  4:3; hero de destino ~ 16:9). O SVG escala, mas a composição não.

---

## 8. Entrar no design system

### 8.1. Onde mora o arquivo

- Assets: `public/illustrations/`.
- Nome: `il-<contexto>-<assunto>.svg`. Exemplos: `il-empty-reservas.svg`,
  `il-sucesso-voucher.svg`, `il-erro-404.svg`, `il-clube-niveis.svg`.

### 8.2. Uso no código

- Enquanto não houver um wrapper, use `<img src="/illustrations/..." alt="" />`.
- Decorativa (ao lado de um título que já explica) → `alt=""` (esconde do leitor de tela).
  Se a ilustração **é** a mensagem, dê um `alt` curto e concreto.
- O `EmptyState` (`src/components/shared/EmptyState.tsx`) já aceita um slot de ícone/arte;
  é o primeiro lugar a plugar as ilustrações de estado vazio.
- Se o uso crescer, vale um `Illustration.tsx` em `components/shared/` (padroniza tamanho,
  `loading="lazy"`, `alt`). Crie quando houver 3+ usos, não antes.

### 8.3. Registro (deixa a arte reproduzível)

Toda peça nova entra nesta tabela, com o prompt e o `style_id`, igual ao `image-prompts.md`
faz com as fotos. Assim dá pra regenerar depois sem adivinhar.

| Asset | Onde aparece | Origem | Prompt | Data |
|---|---|---|---|---|
| `il-empty-reservas.webp` | Estado vazio "sem reservas futuras" (`/account/reservas`) · **em uso** | Recraft (rasterizado) | seção 6 · sem reservas | 2026-07 |
| `il-empty-favoritos.webp` | Estado vazio "sem favoritos" (`/account/saved`) | Gemini (sem versão Recraft ainda) | seção 6 · sem favoritos | 2026-07 |
| `il-sucesso-voucher.webp` | Sucesso / voucher confirmado (checkout, voucher) | Recraft (rasterizado) | seção 6 · voucher | 2026-07 |
| `il-destino-aeroporto.webp` | Destino aeroporto (`/destinos`) | Recraft (rasterizado) | seção 6 · destino | 2026-07 |
| `il-traslado-shuttle.webp` | Traslado / shuttle (a ligar) | Recraft (rasterizado) | seção 6 · traslado | 2026-07 |
| `il-confianca-parceria.webp` | Confiança / parceria, aperto de mão (a ligar) | Recraft (rasterizado) | seção 6 · confiança | 2026-07 |
| `il-clube-cashback.webp` | Clube · carteira vazia (`/account/clube`, saldo R$ 0) · **em uso** | Recraft (rasterizado) | seção 6 · clube | 2026-07 |
| `il-people-viajante.webp` | Direção B (com gente) · viajante indo pro carro | Gemini | seção 5.1 (variante gente) | 2026-07 |
| `il-people-reserva-app.webp` | Direção B (com gente) · gate do Clube (`/account/clube`) · **em uso** | Gemini | seção 5.1 (variante gente) | 2026-07 |
| `il-people-parceiro.webp` | Direção B (com gente) · parceiro no estacionamento | Gemini | seção 5.1 (variante gente) | 2026-07 |

> **Fonte atual: Recraft nos objetos, Gemini na gente (jul/2026).** O lote de objeto veio do
> Recraft (`movepark-rota-v1` em construção) e substituiu os exemplos do Gemini nesses contextos.
> As de gente (Direção B) seguem do Gemini até virem versões do Recraft. Híbrido mantido (mapa na
> seção 10.1): objeto pra resolver, gente pra conectar.
>
> **Dois pontos pra próxima rodada no Recraft:** (1) a paleta esfriou (muito azul-cornflower,
> pouco violeta-foco #5D5FEF e teal #A6DBDF) — reforçar esses dois na paleta travada; (2) o export
> SVG do Recraft veio **traçado (raster), pesado** (21 a 95 KB, milhares de paths), então tudo foi
> **rasterizado pra WebP** (10 a 28 KB). Pra SVG limpo de verdade, usar o export vetorial nativo.
>
> **Estes são sementes de exemplo, não a versão final.** Foram gerados no
> `gemini-image` (raster, `.webp`) para (a) mostrar a linguagem no design system agora e
> (b) servir de **referência para criar o Style `movepark-rota-v1` no Recraft** (seção 4).
> A versão de produção de cada um deve virar **SVG do Recraft** e substituir o `.webp` no
> mesmo caminho. Enquanto isso, o `.webp` já pluga no `EmptyState` via a prop `illustration`.

### 8.4. Checklist antes de commitar uma ilustração

1. Paleta: só cores da tabela da seção 3 (confira no SVG).
2. Motivo diagonal presente (tempero, não papel de parede) quando fizer sentido.
3. Um foco só, espaço negativo pro texto de UI.
4. Nenhum ban da seção 2.4 (memphis, neon, gradiente pesado, 3D, texto na arte).
5. SVG limpo (`svgo`), fundo transparente.
6. Arquivo em `public/illustrations/` com o nome no padrão, commitado junto do código que
   o usa (regra de untracked do `CLAUDE.md`).
7. Registrado na tabela 8.3 com o prompt e o `style_id`.
8. `alt` decidido (vazio se decorativa, curto e concreto se for a mensagem).

---

## 9. Governança

- **Uma pessoa dona do Style.** Mudança no `movepark-rota-v1` afeta toda a biblioteca; trate
  como mudança de token. Evoluiu de verdade? Vira `v2`, registrado aqui.
- **Revisão é a mesma régua do design.** Ilustração fora da paleta ou no clichê banido é
  regressão, mesmo que "bonita".
- **Este doc é normativo.** Ao criar arte nova ou mudar a linguagem, atualize este arquivo no
  mesmo PR (padrão dos specs do projeto). O `DESIGN.md` aponta pra cá.

---

## 10. Referência e padrões de uso

Boa referência de produto que usa ilustração muito bem: o **Nav Dasa** (plataforma de saúde
da Dasa). Vale estudar. O que ele acerta e a gente adota (adaptando à paleta e ao tom calmo
da Movepark, sem a gritaria de azul/amarelo saturado deles):

- **Ilustração vive em superfície de cor, não só no branco.** Os spots deles moram em cards
  coloridos (azul, navy, um acento). Na Movepark: a ilustração pode assentar numa faixa/card
  **navy** (`bg-dashboard-hero`), **pale blue** (`bg-mp-pale`) ou branco. A paleta da arte
  combina com a superfície (arte clara sobre navy, arte com navy sobre pale/branco). Isso dá o
  ar "premium editorial" em vez de clip-art solto.
- **Pessoas com caráter, geométricas e confiantes.** As figuras deles são angulares, de cor
  chapada sobrescrita, rosto mínimo, gente diversa. Não são bonecos memphis. É o nível de
  acabamento que a gente busca quando a cena pede gente (ver a regra de pessoas na seção 2).
- **Ícone e ilustração em lanes separadas e óbvias.** No Nav Dasa, atalhos são **ícones de
  linha** (leves, monocromáticos); features e heros são **ilustração cheia**. Nunca misturam.
  Mesma regra nossa: Lucide para ação/atalho, ilustração para momento/feature.
- **Sistema, não peças avulsas.** Hero, cards de feature, promo do dashboard, rodapé: tudo na
  mesma família. É o que o Style travado (`movepark-rota-v1`) garante aqui.

### 10.1. Direção A vs B: qual usar onde (híbrido)

Decisão de direção de arte (jul/2026): **as duas famílias ficam**. É como a referência faz na
prática (gente no hero, arte mais simples nos utilitários). O critério é o momento:

| Momento | Direção | Por quê | Exemplo de asset |
|---|---|---|---|
| Gate / login / boas-vindas no app | **B (gente)** | momento de conectar e entrar | `il-people-reserva-app` (gate do Clube, **já em uso**) |
| Onboarding logado, promo com rosto | **B (gente)** | calor humano dá rosto à jornada | `il-people-viajante`, `il-people-reserva-app` |
| Partner onboarding no app | **B (gente)** | fala com o dono do estacionamento | `il-people-parceiro` |
| Promo do Clube / carteira | **B (gente)** ou objeto | depende do tom da promo | `il-people-*` ou objeto |
| Estado vazio | **A (objeto)** | clareza e calma, sem drama | `il-empty-reservas` (**já em uso**), `il-empty-favoritos` |
| Confirmação / sucesso | **A (objeto)** | foco no que foi feito, não em quem | `il-sucesso-voucher` |
| Erro / caminho errado | **A (objeto)** | low-drama, objetivo | (a gerar) |
| Hero leve de destino | **A (objeto)** | cena de lugar, não de pessoa | `il-destino-aeroporto` |

Regra de bolso: **gente onde a marca quer conectar; objeto onde o usuário quer resolver.** As
duas usam a mesma paleta, o mesmo motivo diagonal e o mesmo tom calmo, então nunca destoam
lado a lado.

> **Hero de marketing público continua na lane de FOTO.** As landings `seja-parceiro` e `sobre`
> já têm hero fotográfico forte (gemini) e ficam assim. A ilustração de gente entra nos momentos
> **dentro do app** (gate, onboarding logado, promo), não substitui o hero de foto da landing.

Onde a ilustração assenta (superfície):

| Padrão | Superfície | Exemplo |
|---|---|---|
| Estado vazio | card branco / `surface-soft` | sem reservas, sem favoritos |
| Card de feature / promo | navy (`bg-dashboard-hero`) ou pale | "Repetir reserva", Clube |
| Confirmação | branco ou pale | voucher garantido |
| Hero (gente) | faixa pale/navy | onboarding, seja parceiro |
