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

### 4.1 Dashboard

**Rota:** `/manager`

**Objetivo:** visão geral da saúde financeira e operacional da plataforma.

#### KPI Cards (topo, 4 colunas)

| Card | Valor | Variação |
|---|---|---|
| Reservas Hoje | `int` | vs. ontem |
| Receita do Mês | `R$ xxx` | vs. mês anterior |
| Ticket Médio | `R$ xxx` | vs. mês anterior |
| Empresas Ativas | `int` | — |

> Cards usam `{component.reservation-card}` style — white surface, `{rounded.md}`, 1px hairline border, shadow tier.

#### Gráfico de Receita

- Linha/área, últimos 30 dias
- Filtro por empresa (multi-select dropdown)
- Tooltip com valor diário ao hover

#### Tabela — Reservas Recentes

Colunas: `#ID` · `Cliente` · `Empresa` · `Localização` · `Vaga` · `Check-in` · `Check-out` · `Valor` · `Status`

- Paginação (20/página)
- Link rápido para detalhe da reserva
- Badge de status: `confirmed` (green) · `pending` (yellow) · `cancelled` (red) · `completed` (muted)

#### Top Empresas (ranking)

- Lista ranqueada por receita no mês
- Bar chart horizontal inline em cada linha

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
