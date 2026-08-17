---
name: harmonizar-paginas
description: Contrato visual das páginas do consumer (ConsumerAppShell) do Movepark Hub. Use SEMPRE que for criar uma página nova, editar o cabeçalho/hierarquia de uma página existente, ou quando o usuário pedir para harmonizar, padronizar, alinhar ou "deixar igual" o visual entre páginas. Também use quando notar h1/h2 com tamanho ou peso divergente, container de largura diferente, botão fora do padrão, parágrafo em cinza errado ou classe de tipografia arbitrária (text-[Npx]). Define qual token vale para h1, h2, h3, corpo, eyebrow, container, espaçamento vertical e botão, e traz o procedimento de verificação. NÃO se aplica ao manager, ao operator nem ao account, que têm shell próprio.
user-invocable: true
---

# Harmonizar páginas do consumer

As páginas do `ConsumerAppShell` divergiam porque cada uma escrevia o próprio
cabeçalho à mão. O sistema de tokens sempre esteve certo; o que faltava era um
contrato de adoção. Este arquivo é esse contrato.

Origem: critique de 16/07/2026 (`.impeccable/critique/2026-07-16T19-37-52Z__src-routes-consumerappshell.md`),
que mediu 4 tratamentos de h1, 8 larguras de container, 2 linguagens de botão e
5 pesos de heading nas 14 páginas. Nota 26/40, com 1/4 em "Consistência e padrões".

## Escopo

Vale para as rotas do `ConsumerAppShell` (`src/routes.tsx`): `/`, `/search`,
`/p/...`, `/faq`, `/sobre`, `/termos`, `/privacidade`, `/contato`, `/ajuda`,
`/cancelamento`, `/como-funciona`, `/docs`, `/seja-parceiro`, `/destinos`,
`/bookings`, mais os componentes em `src/features/home/` e `src/features/legal/`.

Manager, operator e account têm shell próprio e ficam de fora.

## As duas faixas de página

Toda página do consumer é uma das duas. Decida isso antes de escrever qualquer
classe, porque tudo abaixo depende da faixa.

| Faixa | Quais | O que é |
|---|---|---|
| **Hero de marketing** | `/`, `/seja-parceiro`, `/sobre`, `/como-funciona` | Abre com imagem ou faixa de marca full-bleed, headline grande, sem padding no topo |
| **Página de conteúdo** | as outras 9 | Abre com `PageHeader`, coluna de leitura, padding no topo |
| **Conteúdo com hero** | `/contato` | Corpo de conteúdo, aberto pela faixa violeta do `PageHero` (ver abaixo) |

`/seja-parceiro` é o gabarito de hero. `bookings-list.tsx` é o gabarito de
conteúdo (é a única que já usa o `PageHeader`).

**`/sobre` mudou de faixa em 20/07/2026** (atividade `86ajepypm`, redesign com
apoio visual). Ela é página de marca, não de utilidade: conta a história, mostra
os destinos e os parceiros. Com `PageHeader` e coluna de leitura ela entregava
texto puro, que era exatamente o problema relatado.

**`/como-funciona` mudou de faixa em 17/08/2026**, implementando o desenho do
Claude Design (`Como funciona Movepark.dc.html`). Mesma justificativa: ela é a
página que vende o modelo antes de o cliente confiar nele, e a prova mora em
mostrar as telas (busca, voucher, volta), não em descrevê-las. Abre com a faixa
`bg-brand-gradient` sangrada, com o card de sinais montado sobre a borda de
baixo. É a primeira da faixa de hero sem foto: o gradiente da identidade faz o
papel do full-bleed. Os h3 dos três momentos usam `display-xl` (28px), o degrau
entre o `display-2xl` das seções e o `title-md` dos cards, para a escada de
títulos continuar descendo.

As outras 9 continuam de conteúdo; mover mais alguma exige a mesma justificativa
de marca e uma edição aqui, no mesmo PR.

### Terceira faixa: página de conteúdo com hero (desde 17/08/2026)

Nasceu na `/contato`, de um desenho do Diego, e vale para as páginas de conteúdo
que forem redesenhadas a partir dele. A página continua sendo de conteúdo
(container de 1080, h2 em `display-sm`, `PageHeader` fora), mas abre com a faixa
navy do **`PageHero`** (`src/components/shared/PageHero.tsx`) no lugar do
cabeçalho branco.

| Elemento | Classe |
|---|---|
| Faixa | `bg-mp-navy`, fora do container (sangra) |
| h1 | `text-display-3xl text-white` |
| lead | `text-body-md text-white` |
| Respiro | `py-16 desktop:py-24` |

**A faixa é navy, e não violeta.** O desenho de origem trazia violeta, e a versão
violeta chegou a rodar; ela competia com os botões e com a chamada do rodapé, que
são os pontos onde a marca reserva a cor de ação. Em navy a faixa também casa com
o texto da página, porque `ink` é o mesmo `mp-navy`. Pela mesma razão, ícone
dentro do corpo é navy: violeta ali só em link ou botão.

Duas coisas não são negociáveis:

1. **O lead é branco puro.** Sobre o navy sobra contraste (14.5:1), mas a regra
   vale para qualquer fundo que a faixa venha a ter: sobre violeta o branco dá
   4.86:1, e qualquer translucidez cai para ~3.9:1, reprovando o AA em 16px.
2. **A faixa fica fora do container.** Quem usa põe o `PageHero` antes do
   `mx-auto max-w-[...]`, senão a cor para no meio da tela.

A trilha de navegação dentro da faixa é o **`Breadcrumb`**
(`src/components/shared/Breadcrumb.tsx`), com `tom="escuro"`. O desenho é o da
página de destino, eleito padrão em 17/08/2026: `nav` rotulada, lista `ol`,
separador `›` em `aria-hidden` e `aria-current="page"` no último item. As páginas
de conteúdo tinham uma trilha própria, sem lista e separada por `/`, e leitor de
tela anunciava as duas de formas diferentes. Não escreva trilha à mão: sobre o
navy, `text-muted` dá 2.7:1 e reprova, e é isso que o `tom` resolve.

Ainda fora do padrão: o **post do blog**, que abre com "Voltar para o blog"
(`PageHeader back`) em vez de trilha. É uma decisão de navegação em aberto, não
um esquecimento.

**A única exceção viva à regra "violeta só em acionável"** é a chamada do FAQ no
`ConsumerFooter` (`bg-mp-primary`, em todas as páginas do consumer): ela é um CTA
de página inteira, com botão branco de 48px e texto branco puro, medido em
4.83:1 contra o mínimo de 4.5. A folga é curta de propósito, então texto menor ou
cinza claro ali está fora. O rodapé perdeu a `border-t` quando ganhou essa faixa:
a hairline virava um risco claro sobre a cor.

## Contrato de tipografia

Os tokens já trazem tamanho, peso, line-height e tracking. **Nunca** acrescente
`font-bold`, `font-semibold` ou `tracking-*` em cima de um token de heading: o
peso vem do token, e sobrescrever é como a divergência começou.

### Hero de marketing

| Elemento | Classe | Computa |
|---|---|---|
| h1 | `text-display-3xl` | 34px no mobile → 56px no desktop |
| h2 de seção | `text-display-2xl` | 26px no mobile → 44px no desktop |
| h3 de card | `text-title-md` | 16/600 |
| lead do h1 | `text-body-md` | 16/400 |

`display-3xl` e `display-2xl` são fluidos (`clamp`) e escalam sozinhos até travar em
1128px. Escreva o token puro: **nada de `tablet:`**. E nunca combine px arbitrário com
o token (`text-[36px] tablet:text-display-2xl`), que encolhe de 36 para 34.8px ao
cruzar o breakpoint.

### Página de conteúdo

| Elemento | Classe | Computa |
|---|---|---|
| h1 | `PageHeader` (já aplica `text-display-xl text-ink`) | 28/700/-0.2 |
| h1 de página de índice | `PageHeader size="lg"` (`text-display-2xl`) | 26 → 44, fluido |
| h2 de seção | `text-display-sm` | 20/600/-0.15 |
| h3 | `text-title-md` | 16/600 |
| parágrafo | `text-body-md text-body` | 16/400 #424242 |

**`size="lg"` é só para página de índice** (adicionado em 12/08/2026, para `/blog`). O critério é
o que o título nomeia: numa página de índice ele é o nome de uma seção do site, então abre a
página; numa página de documento (`/termos`, `/cancelamento`) ele é o assunto do texto, e 28px
basta. Índice também costuma ter ação no header (busca), e o título pequeno ao lado de um input
de 48px fica menor que o próprio campo.

Ao usar `size="lg"`, confira que nenhum h2 da página passou a pesar mais que o h1: em `/blog` o
destaque foi de 20 para 28px justamente porque o h1 subiu para 44.

### Tokens com uso restrito

| Token | Regra |
|---|---|
| `display-lg` (22/500) | **Nunca em h1.** É subtítulo/lead. Era ele que deixava o h1 de 6 páginas mais leve (500) que os h2 abaixo (600) |
| `display-md` (21/700) | Legado, sem tracking negativo. Não use em página nova; prefira `display-sm` |
| `rating-display` (64/900) | Só o rating da listing. É o único momento tipográfico alto da marca |
| `uppercase-tag` (8/900) | Só onde o design pedir a tag de 8px. Não é o eyebrow (ver abaixo) |

## Quebra de linha: nunca deixe uma palavra sozinha

Palavra sozinha na última linha é erro de diagramação, e neste projeto ela não
foi culpa do texto: foi de teto arbitrário. Um `max-w-[26ch]` no h1 largou
"minutos" sozinho na `/como-funciona` e quebrou "Política de cancelamento" em
duas linhas, enquanto cada página tinha o seu número (16ch, 26ch, 42ch, 54ch,
56ch, 64ch, 68ch), então a mesma frase quebrava em lugar diferente conforme a
rota.

**Quem decide a quebra é o navegador.**

| Onde | Classe | Por quê |
|---|---|---|
| Título (h1, h2, qualquer `text-display-*`) | `text-balance` | Distribui as linhas em vez de encher a primeira e sobrar o resto |
| Texto corrido, lead, descrição de card | `text-pretty` | Impede que a última linha fique com uma palavra só |
| Lead de abertura | `max-w-[56ch]` | Medida de leitura, um valor só no projeto |
| Corpo longo | `max-w-[68ch]` | Medida de leitura de texto contínuo |

**Teto em `ch` é proibido em heading.** Em parágrafo ele é medida de leitura e
continua valendo; em título ele é um corte a olho, e é ele que fabrica a viúva.
Para o título, o limite é o container da página.

A única quebra aceitável com palavra curta sozinha é a que sobra quando o texto
enche a largura real disponível. Se você está escolhendo um número para forçar a
quebra "ficar bonita", pare: use `text-balance`.

Guard: `src/components/shared/quebra-de-linha.contract.test.ts` roda no CI, varre
os fontes do consumer e reprova heading com teto em `ch` ou abertura de página
sem `text-balance`.

## Contrato de cor

| Papel | Classe | Contraste sobre canvas |
|---|---|---|
| Heading | `text-ink` (#29263F) | 14.5:1 |
| Parágrafo de leitura | `text-body` (#424242) | 10.0:1 |
| Metadata, label, legenda | `text-muted` (#6A6A6A) | 5.4:1 |
| Eyebrow | `text-mp-indigo` ou `text-muted` | 8.4:1 / 5.4:1 |

Três regras que não se negociam:

1. **Violeta (`mp-primary`, #5D5FEF) só em elemento acionável.** Botão, link de
   CTA, indicador de seleção ativa. Nunca em texto estático, eyebrow, borda
   decorativa ou background de seção. Se o usuário vê violeta em texto que não
   clica, ele desaprende que violeta significa ação, e a cor chega no checkout
   sem significado.
2. **Parágrafo é `text-body`, não `text-muted`.** `muted` é metadata. Se todo
   parágrafo for muted, nada é muted e a hierarquia de texto some.
3. **`text-muted-steel` (#818FAF) não vai sobre canvas em texto pequeno.** Dá
   **3.2:1** e reprova o AA (que pede 4.5:1 abaixo de 18px, ou abaixo de 14px em
   bold). É o bug que o `PageHeader` tem hoje no eyebrow.

## Eyebrow

O eyebrow uppercase acima da seção **fica** (decisão de produto de 16/07/2026,
tomada contra a recomendação do critique). O que a skill enforça é só a cor e o
formato:

```tsx
<span className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
```

- Nunca `text-mp-primary` no eyebrow: o violeta é pra ação e destaques pontuais, não pra um rótulo que se repete em toda seção (violeta em tudo = destaque em nada). Num número/indicador-chave o violeta é bem-vindo; no eyebrow, não.
- Nunca `text-muted-steel` (reprova o AA).
- Um por seção, no máximo. Nunca dois no mesmo bloco.

## Container e espaçamento

Três larguras, por função. Nada além delas.

| Nome | max-w | Onde |
|---|---|---|
| app | `max-w-[1280px]` | home, `/search`, `/destinos`, listagens |
| content | `max-w-[1080px]` | páginas de conteúdo (`/faq`, `/contato`, `/sobre`, `/como-funciona`, `/ajuda`, `/cancelamento`) |
| reading | `max-w-[720px]` | leitura longa (`/termos`, `/privacidade`) |

Vertical:

| Contexto | Classe |
|---|---|
| Topo de página de conteúdo | `py-12` (48px) |
| Topo de hero | sem padding (a imagem sangra) |
| Ritmo entre seções | `py-16 desktop:py-24` |

A home é a única página que já tem ritmo declarado (`py-16 desktop:py-24`). Ela é
a referência; as outras empilhavam `mb-8`/`mb-16`/`mb-20` ad-hoc.

## Botão

**Sempre** `<Button>` de `@/components/ui/button`. Ele já está no contrato:
`rounded-sm` (8px), `h-12` (48px), `px-6`, `bg-mp-primary`, hover
`mp-primary-active`, disabled `mp-primary-disabled`.

```tsx
// Certo, inclusive quando precisa ser link:
<Button asChild><Link to="/search">Buscar vagas</Link></Button>

// Errado (era o que a home fazia em 3 lugares):
<a className="rounded-full bg-mp-primary px-6 py-3">Buscar vagas</a>
```

Eram **6 CTAs escritos à mão** (`sobre.tsx:116`, `ajuda.tsx:139`,
`como-funciona.tsx:149`, `CtaBanner.tsx:57`, `HowItWorks.tsx:219`,
`DestinationsGallery.tsx:135`), produzindo 4 alturas: 42, 44 (`ajuda` usa `h-11`),
47 e 52px. Nenhuma é 48. Os 42px reprovam o alvo de toque de 44px, no contexto
declarado do produto: um polegar, 4G, luz de sol.

O de `sobre.tsx` saiu no redesign de 20/07/2026 e o de `como-funciona.tsx` no de
17/08/2026 (os dois agora são `<Button asChild>`). **Faltam 4.**

## Procedimento

### Ao criar uma página nova

1. Decida a faixa (hero ou conteúdo).
2. Conteúdo: comece pelo `PageHeader`. Não escreva `<h1>` à mão.
3. Puxe container e py da tabela acima.
4. Headings só com token, sem `font-*` por cima.
5. Parágrafo `text-body-md text-body`.
6. Botão só via `<Button>`.

### Ao harmonizar uma página existente

1. Meça antes de mexer (comandos abaixo). Sem medida você está adivinhando.
2. Troque o header à mão por `PageHeader`.
3. Substitua `text-[Npx]` pelo token do tier mais próximo.
4. Tire `font-bold`/`font-semibold` que estejam em cima de token de heading.
5. Parágrafo: `text-muted` → `text-body`. Deixe `text-muted` só onde for metadata.
6. Meça de novo e compare com o contrato.

## Verificação

Rode antes de concluir. Todos devem voltar vazios (ou só com exceções conscientes).

```bash
# 1. Tamanho arbitrário no consumer (o contrato tem ~9 tiers; havia 17 valores à mão)
grep -rnE 'text-\[[0-9]+px\]' src/routes src/features/home src/features/legal

# 1b. Degrau manual em cima do tier fluido: os dois erros que ele causa
grep -rnE 'tablet:text-display-(2xl|3xl)' src/routes src/features

# 2. Peso sobrescrevendo token de heading
grep -rnE 'text-(display|title)-[a-z0-9]+[^"]*font-(bold|semibold|medium)' src/routes src/features

# 2b. Entrelinha sobrescrevendo token de heading. O nome engana: `leading-tight` do
#     Tailwind é 1.25, MAIS SOLTO que o 1.06 do display-3xl. Em /seja-parceiro isso
#     deixava o h1 com 70px de entrelinha contra 59px do mesmo h1 na home e na /sobre.
grep -rnE 'text-(display|title)-[a-z0-9]+[^"]*leading-|leading-[a-z]+[^"]*text-(display|title)-' src/routes src/features src/components

# 3. Violeta em texto (só acionável pode)
grep -rn 'text-mp-primary' src/routes src/features/home

# 4. Header à mão em vez de PageHeader
grep -rn '<h1' src/routes

# 5. Classe fantasma: existe no código e não no config?
#    (text-body-lg passou por code review, typecheck, lint e CI sem existir)
grep -rn 'text-body-lg' src/

# 6. CTA à mão (não procure por "<a": os casos reais são <Link> com o className
#    na linha de baixo, e o grep ingênuo passa batido)
grep -rnE --include='*.tsx' 'inline-flex[^"]*bg-mp-primary[^"]*px-' src/routes src/features | grep -v design-system.tsx
```

O grep 6 também pega os badges (`span` com `rounded-full bg-mp-primary px-3 py-1`)
em `PopularParkingLots.tsx:85` e `GroupedResultCard.tsx:162`. Badge não é botão,
então esses dois são esperados e podem ficar.

Medição no browser (dev server na 5180), para comparar páginas de verdade:

```js
const g = el => { const s = getComputedStyle(el);
  return { t: el.textContent.trim().slice(0, 30), fs: s.fontSize, fw: s.fontWeight, ls: s.letterSpacing, c: s.color }; };
JSON.stringify({
  h1: [...document.querySelectorAll('h1')].map(g),
  h2: [...document.querySelectorAll('h2')].map(g),
  h3: [...document.querySelectorAll('h3')].map(g),
})
```

Compare o resultado entre duas páginas irmãs (ex: `/faq` e `/contato`). Se o h1
não bater em `fs`, `fw` e `ls`, a harmonização não terminou.

Atenção ao medir com screenshot: o Browser pane não pinta iframes quando a página
está rolada. Prefira `getComputedStyle` e screenshot no topo.

## Checklist

1. Toda página tem exatamente um h1, e ele é o elemento tipograficamente
   dominante. Nenhum h2 pesa mais que o h1.
2. h1 = `PageHeader` (conteúdo) ou `display-2xl tablet:display-3xl` (hero).
3. Nenhum `text-[Npx]` novo.
4. Nenhum `font-bold`/`font-semibold` em cima de token de heading.
5. Parágrafo em `text-body`; `text-muted` só em metadata.
6. Violeta só em acionável.
7. Container é um dos três nomeados; py do topo é 48px em conteúdo.
8. Botão via `<Button>`, 48px de altura.
9. Os greps de verificação voltam limpos.
10. `bun run typecheck`, `bun run lint` e `bun run test` verdes.

## Nota sobre o que a skill não cobre

O critique achou outras coisas que não são de harmonização e continuam abertas:
`prefers-reduced-motion` sem tratamento em `src/lib/gsap.ts`, `/search` sem h1, 6
botões de categoria transbordando em `/faq`, e `/faq` e `/ajuda` sendo a mesma
promessa com dois designs. Estão no snapshot do critique.
