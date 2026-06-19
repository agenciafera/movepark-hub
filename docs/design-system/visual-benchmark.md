# Visual Benchmark — Movepark Hub

> Análise das referências de design fornecidas pelo Diego para definir a direção visual do Hub e
> afastar o produto do clone visual do Airbnb. Este documento consolida os padrões adotados,
> os padrões evitados e as decisões de paleta que resolvem os `{PENDING}` em `design-tokens.md`.

---

## Referências analisadas

### 1. Airbnb — Host / Experiences (BR)

**O que funciona**

- Layout com muito respiro e whitespace — percepção de produto premium sem poluição visual.
- Títulos de seção grandes e centralizados criam hierarquia clara em scroll longo.
- Blocos alternados (texto + mockup de celular) mantêm o ritmo sem cansar o leitor.
- FAQ em accordion ("Respostas para suas perguntas") — padrão familiar e confiável.
- Tipografia limpa, sem serifa, peso variado para hierarquia clara.

**O que não adotar**

- Paleta coral/rosa (#ff385c) — é a assinatura visual do Airbnb. Qualquer CTA nessa cor é lido
  como "clone".
- Terminologia de hospedagem ("host", "guest", "experience") — não faz sentido no contexto de
  estacionamento e confunde.
- Grid de cards quadrados com foto imersiva para listagem — funciona bem para aluguéis de curto
  prazo, mas não para listagem de vagas de estacionamento (volume, não aspiração).

**Papel no Hub:** referência primária de **espaçamento, hierarquia tipográfica e limpeza visual**.

---

### 2. Landing de Tour (Mount Bromo Sunrise Experience)

**O que funciona**

- Hero full-bleed com fotografia imersiva e navegação translúcida sobre a imagem — cria
  identidade de destino, ótimo para páginas de aeroporto/destino.
- Seções "Discover the Best…" com grids de fotos — justificam a visita e contextualizam o entorno.
- "How to Book Your Tour" com card passo-a-passo — desmistifica o processo, reduz abandono.
- Banner CTA escuro com foto de fundo — visual de fechamento de seção sem ser agressivo.

**O que não adotar**

- Estética excessivamente "turística" (palmas, pôr-do-sol, tons quentes tropicais) — o contexto
  do Hub é urban mobility, não turismo de aventura.
- Copy genérico de experiência ("best sunrise you'll ever see") — nosso usuário é prático, quer
  confirmar a logística.

**Papel no Hub:** referência de **hero imersivo e card de reserva passo-a-passo** nas páginas
de destino (`/destinos/[slug]`) e listagem de unidades (`/p/[slug]`).

---

### 3. Parkos (parkos.pt)

**O que funciona**

- Paleta azul (#206BF6) + amarelo de destaque (#FFBD00) — contraste forte, leitura clara, sem
  vermelho/coral, ausente dos concorrentes diretos no Brasil.
- "Como funciona em 3 passos" — padrão de conversão comprovado para serviços não-óbvios.
- Cards de USP (rápido / conveniente / seguro / econômico) com ícone + texto curto.
- Carrossel de avaliações com **nota + data + tipo de serviço** — contexto que torna o review
  crível (não apenas estrelinhas genéricas).
- Seção "Tipos de estacionamento" — educa o usuário e reduz dúvidas no checkout.
- Selos de pagamento aceitos + Trustpilot no footer — reduz fricção de confiança.

**O que não adotar**

- Azul #206BF6 como primária — é a cor do Parkos, e também remete a internet banking/financeiro,
  perdendo o calor da marca Movepark.
- Separadores de seção pesados — torna a página fragmentada e com menos fluidez.

**Papel no Hub:** referência principal de **conversão, confiança e estrutura de página pública**.

---

### 4. Parclick (parclick.pt)

**O que funciona**

- Métricas de prova social em destaque ("X reservas", "Y clientes satisfeitos") — dado concreto
  é mais persuasivo do que copy genérico.
- Slider de categorias — filtragem visual antes de entrar na listagem, reduz o paradoxo da escolha.
- Cards "Por que estacionar com a gente" (conveniente / rápido / econômico / seguro) — paralelo
  ao Parkos, confirma que esse padrão de USP funciona no segmento.
- Seção de presença na imprensa (logos de veículos) — prova social de credibilidade institucional.

**O que não adotar**

- Cor primária coral (#FF574D) — quase idêntica ao Airbnb e ao sistema legado Movepark atual.
  Essa paleta está saturada no segmento e prejudica diferenciação.
- Layout muito denso com pouco whitespace — leitura cansativa em mobile.

**Papel no Hub:** referência de **prova social, categorização e credibilidade institucional**.

---

## Padrões a adotar

| # | Padrão | Referência | Onde aplicar no Hub |
|---|---|---|---|
| 1 | Whitespace generoso entre seções (≥ 64px) | Airbnb | Todas as páginas públicas |
| 2 | Títulos de seção grandes e centralizados | Airbnb | Home, `/destinos/`, `/p/` |
| 3 | FAQ em accordion | Airbnb | Home, `/p/[slug]`, `/destinos/[slug]` |
| 4 | Hero full-bleed com foto de aeroporto/destino | Tour LP | `/destinos/[slug]` |
| 5 | Nav translúcida sobre hero (scroll → opaca) | Tour LP | `/destinos/[slug]` |
| 6 | Card de reserva flutuante com etapas numeradas | Tour LP | `/p/[slug]` checkout lateral |
| 7 | "Como funciona em 3 passos" | Parkos | Home (acima do fold) |
| 8 | Cards de USP com ícone + título curto | Parkos | Home, `/destinos/[slug]` |
| 9 | Avaliações com nota + data + tipo de serviço | Parkos | `/p/[slug]`, Home |
| 10 | Selos de pagamento aceitos (PIX, cartão) | Parkos | Footer, checkout |
| 11 | Métricas de prova social ("X reservas feitas") | Parclick | Home, `/destinos/` |
| 12 | Categorias com filtro visual antes da listagem | Parclick | `/search` |

---

## Padrões a evitar

| # | Padrão | Motivo |
|---|---|---|
| 1 | CTA em coral/vermelho (qualquer tom de #ff385c a #FF574D) | Assinatura do Airbnb + Parclick; queima diferenciação |
| 2 | Azul saturado #206BF6 como primária | Cor do Parkos; remete a banco/financeiro |
| 3 | Terminologia Airbnb (host, guest, experience, stay) | Contexto errado, confunde o usuário |
| 4 | Grid de cards aspiracionais estilo Airbnb para listagem de vagas | Espaços de estacionamento não são aspiracionais como imóveis |
| 5 | Páginas densas com pouco whitespace | Leitura cansativa, especialmente mobile |
| 6 | Reviews sem contexto (só estrelinhas) | Pouco crível; usuario precisa saber quando e para que tipo de uso |

---

## Decisão de direção visual

### Paleta primária → Violet Movepark

A marca Movepark já tem um conjunto violet/indigo/navy estabelecido que fica subaproveitado:

| Cor | Hex | Papel |
|---|---|---|
| Violet (brand) | `#5D5FEF` | **`mp-primary`** — CTAs, links ativos, highlights |
| Indigo (brand) | `#4041A3` | **`mp-primary-active`** — estado pressed/hover |
| Navy (brand) | `#29263F` | Cor âncora — headings principais, sidebar, logotipo dark |

**Por que violet e não azul ou outra cor:**

- Diferencia 100% do Airbnb (coral), do Parclick (coral) e do Parkos (azul banco).
- O violet `#5D5FEF` tem boa legibilidade sobre branco (contraste ~4.8:1, passa AA para texto
  grande e UI components) e combina com o whitespace estilo Airbnb.
- A paleta navy/indigo/violet tem coerência entre si — o sistema de estados (default → hover →
  active) fica todo dentro da mesma família de cor, sem quebrar harmonia.
- No segmento de estacionamento, nenhum concorrente relevante usa violet — é uma lacuna de
  posicionamento visual.

**Estado desabilitado** do CTA: `#C5C4F6` — tint 40% do violet sobre branco, mantém a
identidade sem competir visualmente com o estado ativo.

### Tipografia → Inter (definitiva)

Inter permanece como fonte definitiva (não apenas placeholder):

- Sem custo de licenciamento, disponível via `fontsource` bundlado no build.
- Legibilidade excelente em interfaces densas (painel manager/operator) — melhor que fontes
  com personalidade forte que cansam em uso prolongado.
- Diferencia do Airbnb Cereal apenas ajustando `line-height display` em -2% (já documentado
  nos tokens).

### Estética base → Airbnb com fotografia

- Whitespace e hierarquia tipográfica do Airbnb.
- Hero fotográfico imersivo do Tour LP nas páginas de destino.
- Cards de conversão e estrutura de trust do Parkos.
- CTA violet Movepark em vez do coral Airbnb.

---

## Tokens resolvidos por este benchmark

| Token | Valor | Decisão |
|---|---|---|
| `mp-primary` | `#5D5FEF` | Violet Movepark — diferencia de coral e azul banco |
| `mp-primary-active` | `#4041A3` | Indigo Movepark — estado pressed, mesma família |
| `mp-primary-disabled` | `#C5C4F6` | Tint 40% do violet — identidade sem competir |
| Fonte | **Inter (definitiva)** | Sem licença, legível, diferente do Cereal |

> Esses valores já foram aplicados em `docs/specs/design-tokens.md`.

---

## Referências visuais citadas

- Airbnb: `https://www.airbnb.com.br/host/experiences`
- Parkos: `https://www.parkos.pt`
- Parclick: `https://parclick.pt`
