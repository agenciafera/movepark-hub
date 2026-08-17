---
name: movepark-design
description: Use this skill to generate well-branded interfaces and assets for Movepark, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

> **Fonte da verdade.** Este bundle espelha o design system vivo do Movepark Hub. O canônico
> mora no repo: `DESIGN.md`, os tokens (`tailwind.config.ts` / `src/index.css`, refletidos aqui
> em `colors_and_type.css`) e o sistema de ilustração (`docs/design-system/illustrations.md`).
> Se algo aqui divergir do `DESIGN.md`, o `DESIGN.md` manda.

## Quick orientation

Movepark é um marketplace de reserva de vagas de estacionamento (foco em aeroportos do Brasil).
O sistema visual junta a identidade Movepark (navy `#29263F`, indigo `#4041A3`, violet `#5D5FEF`,
pale `#E4F2FF`, red `#DA455E`, com um teal `#A6DBDF` de acento e uma escala de cinza steel-blue)
sobre a linguagem estrutural de marketplaces de consumo: busca em pílula, cards foto-first,
formas suaves, elevação de um tier só e canvas branco generoso. Tipografia **Inter** em pesos
moderados. (A estrutura nasceu inspirada no Airbnb e evoluiu para linguagem própria.)

- **Foundations:** `colors_and_type.css` - todos os tokens como variáveis CSS (inclui o `@import` da Inter).
- **Brand assets:** `assets/logo-movepark.svg`, `assets/simbolo-movepark.svg`, `assets/identidade-visual-movepark.png`.
- **Type:** **Inter** (100-900), carregada pelo `@import` no topo do `colors_and_type.css` (não precisa de arquivo local).
- **UI kit:** `ui_kits/website/` - protótipo do site do consumidor (JSX + index.html). Veja o `README.md` do kit.
- **Preview cards:** `preview/` - os specimens da aba de design system (cor, tipo, espaçamento, componentes).
- **Ilustração:** ver `docs/design-system/illustrations.md` no repo (estilo `movepark-rota-v1`).

## Brand rules in one minute

- **Violeta é a cor de ação E destaque.** `violet #5D5FEF` (`--colors-primary`) marca botões
  primários, links de CTA, seleção ativa E os números/indicadores-chave que a marca quer destacar.
  Hover/active vai pra indigo `#4041A3`. Mantenha raro e intencional: nunca como fundo de seção,
  borda decorativa, texto corrido inteiro ou gradiente de texto (violeta em tudo = destaque em nada).
- **Vermelho `#DA455E` é acento e alerta**, não CTA: cancelamento, prazo, ação destrutiva, e o par
  do monograma. Não pinte o botão primário de vermelho.
- Headlines e tinta são **navy `#29263F`**, nunca preto puro.
- Tipografia **Inter** em pesos moderados (500-700 em display, 400 em corpo). O único momento de
  tipo alto é o rating display em 64px / 900.
- Forma **suave**: 8px em botões, 14px em cards, 32px em pílulas de categoria, totalmente arredondado
  na barra de busca / orb / coração / badges NEW.
- **Elevação de um tier só, tinta navy, e só em hover/elevado. Repouso = plano.** As áreas logadas
  (manager, operator, conta) usam **fundo de painel cinza** (`--panel`) com **cards flat** (branco +
  borda), sidebar navy e topbar branca, pra os cards subirem sem sombra.
- Canvas do consumidor é **branco puro**. Áreas logadas usam o **painel cinza**.
- O **gradiente** da marca (`#4041A3 → #5D5FEF → #4041A3`) é de fundo editorial (ex: faixa hero navy);
  nunca em CTA, nunca em texto.
- **Ilustração existe** (não é "photography-led sem ilustração"): sistema `movepark-rota-v1`, vetor
  geométrico plano, paleta da marca, motivo de lâminas diagonais. Híbrido: gente pra conectar
  (hero, onboarding), objeto pra resolver (vazios, confirmação). Ver o spec de ilustração.
- Ícones: **Phosphor** (`@phosphor-icons/react`), peso `regular`, 20px por padrão.
- **Eyebrow**: micro-label em caixa alta, no máximo um por seção, cor `indigo` ou `muted`, **nunca
  violeta**, e sem ícone decorativo quando é um rótulo que se repete.
- Voz: **pt-BR**, sentence case, verbos diretos. **Sem travessão (em dash)** e sem vícios de IA.
  "Reservar agora", não "Reserve Now!".
