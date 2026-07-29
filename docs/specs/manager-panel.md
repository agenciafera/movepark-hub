# Manager Panel — Spec

> Painel interno da Movepark Hub para controle total da plataforma.  
> Design base: Airbnb design system (a ser recolorido com brand Movepark).

---

## 1. Visão Geral

O **Manager Panel** é o backoffice da equipe Movepark. Ele permite gerenciar empresas parceiras, visualizar receita consolidada, controlar configurações globais e auditar qualquer operação da plataforma.

**Acesso:** somente usuários internos da Movepark (role `hub_admin`).

---

## 2. Roles & Permissões

| Role | Descrição |
|---|---|
| `hub_admin` | Acesso total — único role neste painel |

---

## 3. Navegação

### Sidebar (desktop)

```
Logo Movepark Hub
────────────────
Dashboard
Empresas
  └─ Localizações
  └─ Tipos de Vaga
Reservas
Financeiro
  └─ Faturamento
  └─ Comissões
  └─ Tarifas
Usuários
Configurações
────────────────
[Avatar] Admin name
```

### Top Bar

- Logo (collapsed em mobile → hamburger)
- Barra de busca global (reservas, empresas, usuários) — pill-shaped, estilo `{component.search-bar-pill}`
- Ícone de notificações
- Avatar + menu do usuário

---

## 4. Screens

---

### 4.0 Filtros do painel (período e unidade)

O painel abre no consolidado da rede, e por muito tempo era só isso que dava para ver. Duas
peças compartilhadas resolvem: **unidade** e **período**, iguais em toda tela de dado.

**Onde mora.** O estado (`ManagerFilterProvider`, montado no `ManagerLayout`) vale para todo o
painel, então trocar de página não zera o recorte: quem olhou julho no Dashboard continua em
julho ao abrir Reservas. Fica em `sessionStorage`, que dura a aba. Uma preferência de análise
não deve sobreviver a semanas e fazer o painel abrir num recorte antigo sem ninguém lembrar
por quê. A barra é `<ManagerFilterBar />`, colocada no `actions` do `PageHeader`.

**Unidade.** Multi-seleção com busca, agrupada por empresa. Nenhuma marcada quer dizer
**todas** (o consolidado), que é o estado inicial. Unidade apagada sai da seleção salva
sozinha, senão um id morto filtraria a tela para zero sem nada marcado explicando o vazio.

**Período.** Atalhos por horizonte, mais intervalo escolhido no calendário:

| Grupo | Opções |
|---|---|
| Dia | Hoje · Ontem |
| Semana | Esta semana · Semana passada · Últimos 7 dias |
| Mês | Este mês · Mês passado · Últimos 30 dias |
| Ano | Últimos 90 dias · Este ano · Ano passado · Personalizado |

A semana começa na **segunda**: o painel lê operação, e a semana de trabalho fecha de segunda
a domingo. O intervalo é `from` inclusivo e `to` **exclusivo** (`>= from` e `< to`), a mesma
leitura das RPCs; a UI mostra a ponta final como o dia inclusivo que a pessoa escolheu.

**Comparação.** Período anterior (mesmo tamanho, colado no início) · mesmo período do ano
passado · datas à mão · sem comparação. Sem comparação escolhida o card não mostra variação:
um "+12%" sem base declarada é pior que nenhum número. O card diz contra o quê está comparando
("vs. período anterior", "vs. ano passado").

**Onde está aplicado:**

| Tela | Unidade | Período | Comparação |
|---|---|---|---|
| Dashboard (§4.1) | sim | sim | sim |
| Reservas (§4.5) | sim | sim (o filtro de busca por código passa por cima) | não |
| Faturamento (§4.6) | sim | sim | não |
| Atribuição (§4.11) | sim | sim | não |
| Avaliações (§4.9) | sim | não (moderação é fila, não recorte de tempo) | não |

No servidor, o recorte viaja como `p_location_ids uuid[]` nas RPCs (`null` ou `{}` = toda a
rede) e como `.in("location_id", ids)` nas leituras diretas.

---

### 4.1 Dashboard

**Rota:** `/manager` · ✅ implementado

**Objetivo:** a operação da rede num painel só: o movimento de hoje, o resultado do período
e onde o volume está.

**Origem dos indicadores.** O backoffice legado (`movepark-backoffice-v4`) tinha três abas
(Marketing, Visão Geral, Visão Diária) com indicadores que o Hub não cobria. A revisão de
jul/2026 trouxe os que mudam decisão (diárias vendidas, destino, permanência, fluxo horário,
novos x recorrentes) e deixou de fora o que não é indicador: o **simulador de preços** do
legado é ferramenta de precificação e mora em [`fares.md`](./fares.md) / `/manager/tarifas`,
não no dashboard.

**Filtros:** unidade e período vêm da barra compartilhada (§4.0). Todo bloco de período
respeita a escolha e compara com a janela que o usuário escolheu.

**Eixo de data:** o dashboard lê pelo **check-in** (quando o carro ocupa a vaga), a leitura de
operação. Aquisição (canal, UTM) roda por `created_at` e vive em `/manager/attribution`,
que o rodapé do dashboard referencia em vez de duplicar.

#### Linha 1: hoje

| Card | Valor | Nota |
|---|---|---|
| Chegadas de hoje | `int` | vs. ontem; janela do dia **fechada nos dois lados** |
| Check-ins de hoje | `int` | carros que já entraram (`checked_in_at`) |
| Check-outs de hoje | `int` | carros que já saíram (`checked_out_at`) |
| Rede ativa | `int` | unidades ativas, com as empresas na sublinha |

#### Linha 2: o período

| Card | Valor | Variação |
|---|---|---|
| Receita | `R$ xxx` | vs. a base de comparação escolhida |
| Diárias vendidas | `int` | vs. a base escolhida; sublinha com a contagem de reservas |
| Ticket médio | `R$ xxx` | vs. a base escolhida |
| Receita por diária | `R$ xxx` | sublinha com a permanência média |

> **Diária (vaga-dia)** é dia-calendário ocupado, de `check_in_at::date` a
> `(check_out_at - 1µs)::date`, a mesma convenção da capacidade
> ([capacity-rules.md](./capacity-rules.md)). Estadia no mesmo dia conta 1. É o indicador de
> volume real: 600 reservas de 2 dias e 600 de 10 dias ocupam o pátio de formas diferentes, e
> só a contagem de reservas não mostra isso.

#### Blocos

- **Receita por dia de check-in**: área, no período escolhido.
- **Por destino**: receita, reservas e diárias por aeroporto, com barra de participação. A
  média da rede escondia a diferença entre GRU, CGH e Tietê.
- **Permanência**: distribuição por faixa de diárias (1 · 2-3 · 4-6 · 7-14 · 15-29 · 30+).
  Faixa sem reserva aparece zerada, não some do gráfico.
- **Clientes**: primeira reserva x já tinham reservado (o "primeira compra" e "clientes
  fiéis" do legado). Um cliente é o `profile_id` ou, sem conta, o e-mail do pedido.
- **Cancelamento**: canceladas + no-show sobre as reservas que chegaram a um desfecho pago;
  `expired` (abandono) fica fora do denominador e aparece na sublinha.
- **Receita de tarifas**: o que a Movepark ganha por tier (Básica/Flex/Superflex). Visão de
  Super Admin: não vai pro `/operator`.
- **Fluxo de veículos por hora**: entradas e saídas hora a hora num dia, com seletor de data,
  totais de veículos e passageiros, hora de pico e PCDs. A hora sai no **fuso da unidade**. É
  o indicador de escala de equipe: 9 carros às 8h e nenhum às 15h muda a escala do dia.
- **Top unidades**: ranking por receita, com reservas e diárias.
- **Reservas recentes**: as 20 últimas; clique abre o detalhe.

#### Implementação

Duas RPCs `SECURITY DEFINER` gateadas por `is_hub_admin()`
(`20260916000000_manager_dashboard_rpcs.sql`, ampliadas em
`20260917000000_manager_filters_location_and_compare.sql`):

| RPC | Devolve |
|---|---|
| `manager_dashboard_overview(p_from, p_to, p_compare_from, p_compare_to, p_location_ids)` | `current`/`previous`, `statuses`, `customers`, `by_destination`, `length_of_stay`, `by_fare`, `top_locations` |
| `manager_daily_flow(p_date, p_location_ids)` | `entries` e `exits`, 24 horas cada, com `vehicles`/`passengers`/`pcd` |

A agregação mora no banco; o front (`src/features/dashboard/`) só exibe. `anon` não tem
EXECUTE nas duas. Testes: pgTAP `manager_dashboard.test.sql` (gate, grants, diária
dia-calendário, cancelada fora da receita, recorrente, hora no fuso da unidade) e Vitest
`ManagerDashboard.test.tsx` + `dashboardMetrics.logic.test.ts`.

---

### 4.2 Empresas

**Rota:** `/manager/companies`

**Objetivo:** CRUD de empresas parceiras.

#### Lista de Empresas

- Grid de cards (4 colunas desktop, 2 tablet, 1 mobile) — estilo `{component.property-card}` adaptado
- Cada card: logo da empresa · nome · slug · nº de localizações · receita mês · badge de status
- Filtros: status (active/inactive) · busca por nome/slug
- Botão "+ Nova Empresa" (primary CTA, top-right)

#### Formulário — Criar / Editar Empresa

Campos:
- `name` — texto
- `slug` — texto (auto-gerado, editável)
- `logo` — upload de imagem
- `status` — toggle (active/inactive)
- `whitelabel_key` — texto (chave única de integração)
- `contact_email` — e-mail
- `contact_phone` — telefone
- `billing_config` — seção colapsável:
  - `commission_rate` — % (número)
  - `billing_cycle` — select (monthly/weekly)

---

### 4.3 Localizações

**Rota:** `/manager/companies/:id/locations`

**Objetivo:** gerenciar unidades de uma empresa.

#### Lista de Localizações

Tabela com: `Nome` · `Slug` · `Endereço` · `Fuso Horário` · `Status` · `Ações`

#### Formulário — Criar / Editar Localização

Campos:
- `name`
- `slug`
- `address`
- `timezone` — select (lista de fusos)
- `status` — toggle

---

### 4.4 Tipos de Vaga

**Rota:** `/manager/companies/:companyId/locations/:locationId/parking-types`

**Objetivo:** gerenciar tipos de vaga e estratégia de precificação por localização.

#### Lista de Tipos de Vaga

Tabela com: `Nome` · `Code` · `Estratégia` · `Preço Base` · `Status` · `Ações`

#### Formulário — Criar / Editar Tipo de Vaga

Campos:
- `name` — texto
- `code` — select (`covered`, `uncovered`, `valet`, `premium`)
- `status` — toggle
- **Seção: Precificação**
  - `strategy` — select:
    - `fixed_daily` — preço fixo por dia
    - `fixed_bracket` — faixas por número de dias (ex: 1-3d R$30, 4-7d R$25)
    - `dynamic` — preço dinâmico (flag para futura implementação)
  - Se `fixed_daily`: campo `price_per_day`
  - Se `fixed_bracket`: tabela de faixas editável (`dias_de` · `dias_ate` · `preco_total`)

---

### 4.5 Reservas

**Rota:** `/manager/bookings`

**Objetivo:** visão centralizada de todas as reservas da plataforma.

#### Filtros

- Empresa (multi-select)
- Localização (multi-select)
- Status
- Período (date range picker — estilo `{component.date-picker-day}`)
- Busca por ID ou nome do cliente

#### Tabela de Reservas

Colunas: `#ID` · `Cliente` · `Empresa` · `Localização` · `Tipo de Vaga` · `Check-in` · `Check-out` · `Dias` · `Valor` · `Status`

- Sort em todas as colunas
- Export CSV
- Click na linha → modal de detalhe (ver 4.5.1)

#### 4.5.1 Modal — Detalhe da Reserva

- Dados completos do booking
- Timeline de status (criado → confirmado → em uso → concluído)
- Ações: cancelar reserva, reembolsar (com confirmação)

---

### 4.6 Financeiro — Faturamento

**Rota:** `/manager/finance/billing`

**Objetivo:** controle de cobranças às empresas parceiras.

#### Visão Mensal

- Selector de mês/ano
- Tabela por empresa: `Empresa` · `Reservas` · `Receita Bruta` · `Comissão (%)` · `Comissão (R$)` · `Repasse` · `Status Cobrança`

Badge de cobrança: `pending` · `invoiced` · `paid` · `overdue`

#### Ação: Gerar Fatura

- Botão "Gerar Fatura" por empresa ou em lote
- Confirmar com modal

---

### 4.7 Financeiro — Comissões

**Rota:** `/manager/finance/commissions`

**Objetivo:** configurar e auditar taxas de comissão.

- Tabela de rates por empresa com histórico de alterações
- Inline edit da taxa atual

---

### 4.8 Usuários

**Rota:** `/manager/users`

**Objetivo:** gerenciar usuários da plataforma (hub_admin e operadores das empresas).

#### Tabela de Usuários

Colunas: `Nome` · `E-mail` · `Role` · `Empresa` · `Último Acesso` · `Status`

Roles visíveis: `hub_admin` · `company_operator`

#### Formulário — Criar / Editar Usuário

Campos:
- `name`
- `email`
- `role` — select
- `company_id` — select (se role = company_operator)
- `status` — toggle (active/inactive)
- Botão "Reenviar convite"

---

### 4.9 Avaliações (moderação)

**Rota:** `/manager/reviews` (nav "Avaliações"). ✅ implementado — ver [reviews.md](./reviews.md) §5.

Lista **todas** as avaliações (o hub_admin vê até as despublicadas via RLS) com Nota · Autor ·
Unidade/Empresa · Comentário · Status. Toggle **Publicar/Despublicar** (UPDATE gateado por
`review_admin_moderate`; o trigger recomputa a nota da unidade) + filtro "só despublicadas".
Moderação **pós-publicação**: a review já entra publicada; o Manager remove abusos.

---

### 4.10 Configurações

**Rota:** `/manager/settings`

- **Geral:** nome da plataforma, logo, e-mail de suporte
- **Notificações:** configurar templates de e-mail por evento (booking created, cancelled, etc.)
- **Integrações:** tokens de API, webhooks
- **Segurança:** logs de acesso, 2FA obrigatório

---

### 4.11 Tarifas

**Rota:** `/manager/tarifas` (só `hub_admin`)

Editor da tabela global `public.fare` (Básica/Flex/Superflex), a fonte única de tarifa da
plataforma. Um card por tier, com preço, janela de cancelamento grátis, ativo, selo "popular",
rótulo e benefícios. A Básica é sempre grátis (preço não editável). A escrita passa pela RPC
`admin_set_fare` (gate `is_hub_admin()`); a mudança vale para todos os estacionamentos e reflete na
busca e no checkout (que leem `get_unit_fares`). O parceiro não edita tarifa (ver
[operator-panel.md](./operator-panel.md)). Decisão de 23/07 (ClickUp `86ajnxeym` + `86ajnxf04`).

---

## 5. Componentes Adaptados do Design System

| Airbnb Token | Uso no Manager Panel |
|---|---|
| `{colors.primary}` (#ff385c) | substituir por `{colors.mp-primary}` (Movepark brand) |
| `{colors.canvas}` (#ffffff) | mantém white |
| `{colors.ink}` (#222222) | mantém |
| `{colors.surface-soft}` (#f7f7f7) | sidebar background, table rows alternados |
| `{rounded.md}` (14px) | cards de empresa, modais |
| `{rounded.sm}` (8px) | botões, inputs |
| `{component.reservation-card}` | KPI cards do dashboard |
| `{component.date-picker-day}` | filtro de período nas reservas |
| `{typography.display-md}` | títulos de seção |
| `{typography.body-sm}` | meta de tabelas |

---

## 6. Estados de UI

- **Loading:** skeleton screens nas tabelas e KPI cards (retângulos com shimmer em `{colors.surface-soft}`)
- **Empty state:** ilustração + texto encorajador ("Nenhuma reserva encontrada para esse período") + CTA secundário
- **Error state:** inline com `{colors.error}` e ícone de alerta
- **Success toast:** bottom-right, auto-dismiss 4s

---

## 7. Responsividade

| Breakpoint | Comportamento |
|---|---|
| Mobile < 744px | Sidebar colapsa para bottom navigation (ícones) |
| Tablet 744–1128px | Sidebar colapsa para ícones + tooltip on hover |
| Desktop > 1128px | Sidebar completa (240px) |

---

## 8. Open Points

- [ ] Definir paleta de cores Movepark (primary, secondary)
- [ ] Definir fonte (Inter como substituto do Cereal até ter fonte própria)
- [ ] Estratégia de `dynamic` pricing — escopo futuro ou MVP?
- [ ] Integração com gateway de pagamento para faturamento automático
- [ ] Nível de detalhe do log de auditoria
