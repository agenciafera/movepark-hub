---
name: Movepark Hub
description: Marketplace de reserva de vagas em estacionamentos de aeroportos e destinos brasileiros.
colors:
  violet-cta: "#5D5FEF"
  indigo-active: "#4041A3"
  indigo-disabled: "#C5C4F6"
  navy-ink: "#29263F"
  red-signal: "#DA455E"
  red-signal-deep: "#AE374B"
  teal-soft: "#A6DBDF"
  pale-blue: "#E4F2FF"
  canvas: "#FFFFFF"
  surface-soft: "#F7F7F8"
  surface-strong: "#E0E5F2"
  hairline: "#E0E0E0"
  hairline-soft: "#EBEBEB"
  body-text: "#424242"
  muted-text: "#6A6A6A"
  muted-soft: "#929292"
  success: "#1F7A4D"
  warning: "#B96A00"
  error: "#C13515"
typography:
  display:
    fontFamily: "Inter var, Inter, -apple-system, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.8px"
  headline:
    fontFamily: "Inter var, Inter, -apple-system, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1.10
    letterSpacing: "-0.5px"
  title:
    fontFamily: "Inter var, Inter, -apple-system, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.32
    letterSpacing: "-0.2px"
  body:
    fontFamily: "Inter var, Inter, -apple-system, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.50
  label:
    fontFamily: "Inter var, Inter, -apple-system, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.29
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "32px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.violet-cta}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-active}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "48px"
  button-primary-disabled:
    backgroundColor: "{colors.indigo-disabled}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "48px"
  input-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sm}"
    height: "56px"
    padding: "0 16px"
  input-field-focus:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sm}"
    height: "56px"
    padding: "0 15px"
---

# Design System: Movepark Hub

## 1. Overview

**Creative North Star: "A Rota Certa"**

Um sistema de design que respeita o tempo do viajante. Cada elemento existe para remover fricção — não para chamar atenção. A beleza está na ausência de obstáculos: o usuário encontra a vaga, confirma o preço, reserva em dois toques e segue viagem. Quando o design funciona de verdade, ele some.

O sistema é construído sobre uma tese de contenção deliberada: o violeta (#5D5FEF) aparece exclusivamente em elementos acionáveis. Fora dos CTAs, recua. Isso cria um contrato não-verbal com o usuário — quando vê aquela cor, sabe que pode agir. O restante da interface é neutro e preciso: navy profundo para texto, brancos limpos para superfície, cinzas estruturais para hierarquia.

A influência do Nubank está na voz, não no visual: comunicação direta, sem juridiquês, com calor humano no micro-copy. "Vaga garantida. Boa viagem." não é uma frase corporativa — é a confirmação de que o sistema cumpriu sua parte do acordo.

**O que este sistema rejeita explicitamente:** verde neon ou laranja de aplicativos de mobilidade urbana; minimalismo excessivo sem opinião (brancura total, tipografia micro, ausência de marca); tom institucional corporativo de banco tradicional.

**Key Characteristics:**
- Violeta reservado para ação — raro o suficiente para ser inconfundível
- Tipografia Inter com tracking negativo em displays: precisa, não "projetada"
- Único tier de sombra com tinta navy: coerente, não decorativo
- Raio sm (8px) em interativos, md (14px) em containers: distinção por função
- Canvas branco puro — sem morno, sem bege, sem opinião térmica acidental

## 2. Colors: A Paleta da Rota Certa

Uma paleta de contenção estratégica: uma cor de ação, uma cor de profundidade, um sinal de alerta, e neutros que nunca ficam no caminho.

### Primary
- **Confiança Digital** (#5D5FEF — violet-cta): A cor de ação da Movepark. Usada exclusivamente em botões primários, links de call-to-action e indicadores de seleção ativa. Sua presença é um contrato: quando aparece, há algo para fazer. Quando não há ação disponível, some.
- **Índigo Profundo** (#4041A3 — indigo-active): O estado hover/active do violet-cta. Mais escuro, mais firme — transmite que o sistema respondeu ao toque. Também aparece como cor de informação (ícones e badges de status "active").

### Secondary
- **Sinal Vermelho** (#DA455E — red-signal): Cor de alerta, cancelamento e ação destrutiva. Não é um vermelho de erro genérico — tem personalidade (rosado, quente) que o separa do erro técnico (#C13515). Aparece em badges de cancelamento, CTAs de cancelar reserva, e alertas de prazo.

### Tertiary
- **Azul Teal Suave** (#A6DBDF — teal-soft): Acento secundário calmo. Aparece em ilustrações, ícones decorativos, e variações de surface em contextos de confirmação ou "sucesso suave". Não compete com o violet-cta.
- **Azul Pálido** (#E4F2FF — pale-blue): Surface de destaque leve. Usado em banners informativos, badges de status "ativo", e backgrounds de seções que precisam de distinção suave sem peso visual.

### Neutral
- **Tinta Navy** (#29263F — navy-ink): A tinta principal do sistema. Headings, body text forte, ícones. Navy — não preto puro — confere profundidade com personalidade. É a mesma cor usada na sombra `shadow-tier`, criando coerência cromática entre texto e elevação.
- **Corpo** (#424242 — body-text): Texto corrido. Gray escuro neutro, sem temperatura. Garante 7:1 de contraste sobre canvas.
- **Muted** (#6A6A6A — muted-text): Labels secundárias, metadata, placeholders. Ainda legível (5.3:1 sobre canvas), nunca invisível.
- **Canvas** (#FFFFFF — canvas): Background do corpo. Branco puro — zero temperatura — para não criar conflito visual com as cores de marca.
- **Surface Soft** (#F7F7F8 — surface-soft): Background de cards, seções alternadas, inputs desabilitados. O cinza mais suave do sistema.
- **Surface Strong** (#E0E5F2 — surface-strong): Separadores, backgrounds de hover em itens de lista, badges de superfície. Tem um toque de azul-steel que remete ao navy sem competir.

### Named Rules
**A Regra do Violeta Reservado.** O `violet-cta` aparece em ≤10% de qualquer tela. Sua raridade é o ponto — é a cor de ação, não de decoração. Nunca use-o em texto estático, bordas decorativas, ou backgrounds de seção.

**A Regra do Canvas Neutro.** O background do body é sempre branco puro (#FFFFFF). Nunca morno, nunca bege, nunca "papel". Calor de marca vem do violet-cta, do navy e do micro-copy — não da temperatura do fundo.

## 3. Typography

**Body Font:** Inter var (com fallback para Inter, -apple-system, system-ui, sans-serif)

Inter var é a única família do sistema — humanista, altamente legível, extremamente versátil por peso. Sem serif display, sem mono. A variação de peso (400 a 900) e o tracking negativo em títulos criam toda a hierarquia necessária.

**Character:** Uma voz única. Inter em peso 700 com tracking negativo (-0.5px a -0.8px) em display é preciso e confiante — lê-se como informação de sinalização aeroportuária, não como marketing. Inter em 400 no corpo tem calor suficiente para conversação. O contraste de peso faz o trabalho que outras famílias fazem com dois tipos distintos.

### Hierarchy
- **Display** (700, 56px, lh 1.06, ls -0.8px): Hero headlines exclusivamente. Uma ocorrência por página. Reservado para o claim principal da home ou da página de destino.
- **Headline** (700, 44px, lh 1.05, ls -0.5px): Títulos de seção de página, headings de destino. Até 2-3 por página.
- **Title** (700, 28px, lh 1.28, ls -0.2px): Cabeçalhos de cards de produto, nomes de estacionamentos em listagem, títulos de modal.
- **Display SM** (600, 20px, lh 1.18, ls -0.15px): Subheadings de seção, rótulos de categoria com peso.
- **Body MD** (400, 16px, lh 1.50): Texto corrido. Máximo 65ch por linha. O núcleo da comunicação.
- **Body SM** (400, 14px, lh 1.43): Texto de suporte, descrições secundárias, informações de contexto.
- **Label** (500, 14px, lh 1.29): Labels de form, captions de card, metadata de reserva.
- **Button** (500, 16px/14px, lh 1.25): Text de botões. Medium — nem heavy nem light.
- **Badge** (700, 11px, lh 1.18, ls 0.1px): Status badges. Peso máximo para compensar tamanho mínimo.

### Named Rules
**A Regra do Tracking Negativo.** Títulos em `display` e `headline` sempre carregam tracking negativo. O tracking padrão em grande escala parece desleixado — o tracking negativo transmite precision e intenção. Nunca use tracking positivo (`letter-spacing > 0`) em headings.

**A Regra do Uppercase Proibido.** Texto todo em uppercase está proibido em títulos e corpo. O único uso legítimo é `uppercase-tag` (8px, 900, ls 0.4px) — e apenas para classificadores muito específicos (ex: tipo de vaga, categoria de destino), nunca como decoração ou kicker de seção.

## 4. Elevation

O sistema usa **um único tier de sombra** com tinta navy (`shadow-tier`). Não é flat absoluto — mas a elevação não é uma escala decorativa; é um sinal funcional.

A sombra é construída em três camadas sobrepostas com a tinta navy (#29263F) em opacidade gradual: um anel de 1px quase invisível para definição de borda, uma camada difusa de 6px para separação do plano, e uma layer de 12px para profundidade de hover. O resultado é uma sombra que pertence cromaticamente ao sistema — não é um preto genérico.

**Filosofia:** plano por padrão. Elementos em repouso são planos. A sombra aparece em cards interativos no hover, em dropdowns/modals (contexto de elevação estrutural), e em componentes que precisam se separar do background em contextos de scroll. Nunca em cards estáticos de conteúdo.

### Shadow Vocabulary
- **Tier** (`0 0 0 1px rgba(41,38,63,0.04), 0 2px 6px 0 rgba(41,38,63,0.06), 0 4px 12px 0 rgba(41,38,63,0.10)`): A única sombra do sistema. Cards de produto no hover, dropdowns, modals, popovers.
- **Focus Ring** (`0 0 0 2px #29263F`): Anel de foco para acessibilidade. Navy puro, sem blur — preciso e visível.

### Named Rules
**A Regra do Tier Único.** Não existem `shadow-sm`, `shadow-md`, `shadow-lg`. Há uma sombra ou não há. Se um elemento precisa de "mais" elevação do que o tier oferece, o problema está na arquitetura visual, não na sombra.

## 5. Components

### Buttons
Forma precisa, não decorativa. Cantos de 8px (rounded-sm) — arredondado o suficiente para ser acessível, quadrado o suficiente para ser sério.

- **Shape:** Gently curved (8px radius). Sem pill, sem quadrado duro.
- **Primary:** Background violet-cta (#5D5FEF), texto branco, h 48px, px 24px. Hover: indigo-active (#4041A3). Focus: `focus-ring` navy 2px. Disabled: indigo-disabled (#C5C4F6) com opacity.
- **Secondary:** Canvas + borda 1px navy-ink. Transmite "alternativa válida" — não menos importante, só diferente. Hover: surface-soft background.
- **Ghost:** Transparente + texto navy-ink + sublinhado no hover. Para ações terciárias, navegação inline, links de contexto.
- **Danger:** Background error (#C13515). Reservado para ações destrutivas confirmadas (cancelar reserva, excluir vaga).
- **Pill:** Rounded-full, h 36px. Variante compacta para chips de filtro e ações em linha.

### Cards / Containers
- **Corner Style:** Gently rounded (14px — rounded-md). Mais arredondado que botões, criando distinção clara entre elemento interativo e container.
- **Background:** Canvas (#FFFFFF) com borda 1px hairline (#E0E0E0).
- **Shadow Strategy:** `shadow-tier` no hover para cards interativos. Cards puramente informativos: sem sombra, apenas borda.
- **Internal Padding:** 20-24px (5-6 Tailwind units).

### Inputs / Fields
- **Style:** Stroke fino (1px hairline), background canvas, 8px radius, h 56px (maior que botões — facilita toque no mobile).
- **Focus:** Borda dupla (2px) navy-ink — sem glow, sem cor, só solidez. O padding interno ajusta -1px para compensar a borda extra (sem layout shift).
- **Error:** Borda error (#C13515) com mensagem de erro abaixo.
- **Disabled:** Background surface-soft (#F7F7F8) com opacity 60%.

### Navigation
- **Consumer Topbar:** Logo + links de nav em nav-link (16px, 600) + CTA primário. Mobile: recolhe para BottomNav (5 ícones com label, peso 500 14px).
- **Admin Sidebar:** Links de sidebar com ícone Lucide + label em title-sm (16px, 500). Estado ativo: text violet-cta + background surface-pale.

### Status Badges
Componente de alta frequência no sistema — toda reserva, vaga e usuário tem um status. Forma: pill rounded-full, h 22px, texto badge (11px, 700, ls 0.1px).
- Confirmado: bg #E8F6EE (verde suave), fg success (#1F7A4D)
- Ativo: bg pale-blue (#E4F2FF), fg indigo (#4041A3)
- Pendente: bg #FFF0D6 (âmbar suave), fg warning (#B96A00)
- Concluído: bg surface-soft (#F7F7F8), fg muted (#6A6A6A)
- Cancelado: bg #FDE8E3 (vermelho suave), fg error (#C13515)

## 6. Do's and Don'ts

### Do:
- **Do** reservar o violet-cta (#5D5FEF) exclusivamente para elementos acionáveis. Botão primário, link de CTA, indicador de seleção ativa. Nunca em texto decorativo, bordas ou backgrounds de seção.
- **Do** usar tracking negativo em display e headline (—0.8px e —0.5px respectivamente). A precisão é intencional.
- **Do** usar `shadow-tier` em cards interativos no estado hover e em elementos elevados estruturalmente (dropdowns, modals). Repouso = plano.
- **Do** manter o canvas em branco puro (#FFFFFF). Não adicione temperatura — calor de marca vem dos tokens de cor e do micro-copy, não do background.
- **Do** usar o navy-ink (#29263F) como tinta principal. Não `#000000`. A diferença é sutil mas o resultado é mais coerente com a sombra `shadow-tier`.
- **Do** verificar contraste antes de usar `muted-text` (#6A6A6A) sobre qualquer superfície não-canvas. Ele passa 4.5:1 sobre canvas, mas pode falhar sobre surfaces coloridas.
- **Do** escrever micro-copy que confirma e humaniza: "Vaga garantida", "Boa viagem", "Sua reserva está segura". A voz da Movepark é a do navegador confiante — quem sabe o caminho e compartilha sem condescendência.

### Don't:
- **Don't** usar verde neon, laranja saturado ou qualquer cor de aplicativos de mobilidade urbana (Uber/99). A Movepark não compete por atenção com notificações piscando.
- **Don't** criar uma interface excessivamente minimalista sem opinião — brancura total, tipografia micro, ausência de personalidade. Silêncio total não é marca; é ausência de marca.
- **Don't** usar `border-left` maior que 1px como stripe colorida em cards ou callouts. Reescreva com background tintado, borda completa ou ícone.
- **Don't** usar `background-clip: text` com gradiente. Gradient text é decorativo, nunca significativo. Use cor sólida.
- **Don't** usar glassmorphism (backdrop-filter: blur + transparência) como padrão decorativo. Efeito de vidro é caro e raro — somente quando materialmente melhora a UX.
- **Don't** repetir o mesmo card-icon-heading-text em grid sem variação. Grids de cards idênticos comunicam commoditização — use hierarquia, tamanhos variados, ou destaque para quebrar a monotonia.
- **Do** usar o eyebrow uppercase acima da seção como sistema deliberado da marca (decisão de produto, 16/07/2026). Formato único: `text-[11px] font-bold uppercase tracking-[0.4px]`, no máximo um por seção. A cor é `mp-indigo` (8.4:1) ou `muted` (5.4:1). **Nunca** `mp-primary`, que quebraria a regra do violeta reservado, e **nunca** `muted-steel`, que dá 3.2:1 sobre canvas e reprova o AA. Ver a skill `harmonizar-paginas`.
- **Don't** usar tom institucional corporativo, juridiquês ou disclaimers no hero. A Movepark fala com o usuário como o Nubank fala — direto, humano, sem distância de pessoa jurídica.
- **Don't** colocar números sequenciais (01 / 02 / 03) como eyebrows de seção genérica. Números só aparecem quando a sequência carrega informação real (um processo de 3 passos, um fluxo ordenado).
