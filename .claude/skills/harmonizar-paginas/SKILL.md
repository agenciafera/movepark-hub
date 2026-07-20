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
| **Hero de marketing** | `/`, `/seja-parceiro`, `/sobre` | Abre com imagem full-bleed, headline grande, sem padding no topo |
| **Página de conteúdo** | as outras 11 | Abre com `PageHeader`, coluna de leitura, padding no topo |

`/seja-parceiro` é o gabarito de hero. `bookings-list.tsx` é o gabarito de
conteúdo (é a única que já usa o `PageHeader`).

**`/sobre` mudou de faixa em 20/07/2026** (atividade `86ajepypm`, redesign com
apoio visual). Ela é página de marca, não de utilidade: conta a história, mostra
os destinos e os parceiros. Com `PageHeader` e coluna de leitura ela entregava
texto puro, que era exatamente o problema relatado. As outras 11 continuam de
conteúdo; mover mais alguma exige a mesma justificativa de marca e uma edição
aqui, no mesmo PR.

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
| h2 de seção | `text-display-sm` | 20/600/-0.15 |
| h3 | `text-title-md` | 16/600 |
| parágrafo | `text-body-md text-body` | 16/400 #424242 |

### Tokens com uso restrito

| Token | Regra |
|---|---|
| `display-lg` (22/500) | **Nunca em h1.** É subtítulo/lead. Era ele que deixava o h1 de 6 páginas mais leve (500) que os h2 abaixo (600) |
| `display-md` (21/700) | Legado, sem tracking negativo. Não use em página nova; prefira `display-sm` |
| `rating-display` (64/900) | Só o rating da listing. É o único momento tipográfico alto da marca |
| `uppercase-tag` (8/900) | Só onde o design pedir a tag de 8px. Não é o eyebrow (ver abaixo) |

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

- Nunca `text-mp-primary` (viola a regra do violeta reservado).
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

O de `sobre.tsx` saiu no redesign de 20/07/2026 (agora é `<Button asChild>`).
**Faltam 5.**

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
