# Operator Panel — Spec

> Painel para os estacionamentos parceiros gerenciarem suas próprias operações.  
> Design base: Airbnb design system (a ser recolorido com brand Movepark).

---

## 1. Visão Geral

O **Operator Panel** é o painel de cada empresa parceira (ex: Nationpark, Aerovalet). O operador enxerga **apenas os dados da sua própria empresa** — sem acesso a outras empresas ou configurações globais da plataforma.

**Acesso:** usuários com role `company_operator` vinculados a uma empresa.

---

## 2. Roles & Permissões

| Role | Descrição |
|---|---|
| `company_operator` | Acesso total à própria empresa — único role neste painel |

> Isolamento por empresa é garantido no backend — o token JWT carrega o `company_id`.

---

## 3. Navegação

### Sidebar (desktop)

```
Logo Movepark Hub
[Nome da Empresa]
────────────────
Dashboard
Reservas
Localizações
  └─ Tipos de Vaga
Ocupação
Serviços
Cupons
FAQ
Relatórios
Configurações
────────────────
[Avatar] Operador name
```

### Top Bar

- Logo + nome da empresa (breadcrumb leve)
- Seletor de localização (se a empresa tiver mais de uma) — dropdown pill
- Ícone de notificações
- Avatar + menu

---

## 4. Screens

---

### 4.1 Dashboard

**Rota:** `/operator`

**Objetivo:** visão do dia-a-dia operacional da empresa.

#### KPI Cards (topo, 4 colunas)

| Card | Valor | Período |
|---|---|---|
| Reservas Hoje | `int` | Hoje |
| Check-ins Hoje | `int` | Hoje |
| Check-outs Hoje | `int` | Hoje |
| Receita do Mês | `R$ xxx` | Mês atual |

> Se houver múltiplas localizações, os cards refletem a localização selecionada no seletor global (ou "Todas").

#### Timeline do Dia

- Lista cronológica de check-ins e check-outs previstos para hoje
- Cada linha: horário · nome do cliente · tipo de vaga · placa (se disponível) · status
- Atualização em tempo real (ou polling a cada 30s)

#### Gráfico de Ocupação

- Barras por período do dia (manhã/tarde/noite) ou por hora
- Comparativo com mesmo dia da semana anterior
- Filtro por localização

#### Reservas Pendentes de Confirmação

- Lista das reservas aguardando ação do operador (se o fluxo exigir confirmação manual)
- Botões inline: "Confirmar" / "Recusar"

---

### 4.2 Reservas

**Rota:** `/operator/bookings`

**Objetivo:** gestão completa das reservas da empresa.

#### Filtros

- Localização (se múltiplas)
- Status: `pending` · `confirmed` · `active` · `completed` · `cancelled`
- Tipo de vaga
- Período (date range picker)
- Busca por nome, e-mail ou ID

#### Tabela de Reservas

Colunas: `#ID` · `Cliente` · `Localização` · `Tipo de Vaga` · `Check-in` · `Check-out` · `Dias` · `Valor` · `Status` · `Ações`

- Sort por qualquer coluna
- Export CSV
- Click na linha → drawer lateral (ver 4.2.1)
- Ações inline: confirmar · cancelar (com permissão)

#### 4.2.1 Drawer — Detalhe da Reserva

Layout em 2 colunas:

**Esquerda — Dados do Cliente**
- Nome, e-mail, telefone
- Foto do veículo (se disponível)
- Placa
- Observações

**Direita — Dados da Reserva**
- Tipo de vaga, localização
- Datas e horários
- Valor total + breakdown de taxas
- Timeline de status (histórico de eventos)

**Ações no drawer:**
- Confirmar reserva
- Marcar como check-in realizado
- Marcar como check-out realizado
- Cancelar (com motivo) — abre modal de confirmação
- Adicionar nota interna

---

### 4.3 Localizações

**Rota:** `/operator/locations`

**Objetivo:** visualizar e editar dados das próprias localizações.

#### Lista de Localizações

Cards com: nome · endereço · status · capacidade total · ocupação atual

> Criar/deletar localização não está disponível para o operador — apenas a Movepark gerencia isso.

#### Editar Localização

Campos editáveis pelo operador:
- `name` (nome de exibição)
- `address`
- Horários de funcionamento (abertura/fechamento por dia da semana)
- Instruções de acesso (texto livre — exibido ao cliente após reserva)
- Fotos (upload, ordenável)

---

### 4.4 Tipos de Vaga

**Rota:** `/operator/locations/:id/parking-types`

**Objetivo:** visualizar e ajustar preços dos próprios tipos de vaga.

#### Lista de Tipos de Vaga

Tabela com: `Nome` · `Code` · `Estratégia` · `Preço` · `Status`

> Operador pode **editar preços** e **ativar/desativar** tipos de vaga, mas não pode criar novos codes — apenas a Movepark cria codes novos.

#### Editar Tipo de Vaga

Campos editáveis:
- `name` (nome de exibição para o cliente)
- `status` — toggle
- **Capacidade** (`capacity`) — edição inline.
- **Regras de reserva** (diálogo "Regras de reserva", ✅ implementado): `near_capacity_threshold` +
  `near_capacity_message` (aviso de quase-lotação), `has_minimum_stay`/`minimum_stay_value`/
  `minimum_stay_unit` (estadia mínima) e `has_minimum_date`/`minimum_date` (data mínima de entrada).
  Persistem via UPDATE direto (RLS `lpt_operator_update`); são aplicados no `create_booking_atomic`
  e exibidos ao cliente via `check_availability`. Ver [capacity-rules.md](./capacity-rules.md).
- **Precificação** (dependendo da estratégia configurada pela Movepark):
  - `fixed_daily`: edita `price_per_day`
  - `fixed_bracket`: edita tabela de faixas

---

### 4.4b Ocupação

**Rota:** `/operator/occupancy` (nav "Ocupação"). ✅ implementado — ver [capacity-rules.md](./capacity-rules.md).

Seletor de unidade + intervalo de datas → tabela/heatmap de **vagas reservadas por data**
(`booked/capacity`, % cheio) por tipo de vaga, via RPC `operator_location_occupancy(location_id,
from, to)` (`SECURITY DEFINER`, gateada por `profile_company`/`hub_admin`). Reservas `pending`
seguram a vaga até pagar ou expirar (o cron `expire-pending-bookings` libera abandonadas).

---

### 4.5 Serviços Adicionais

**Rota:** `/operator/addons`

**Objetivo:** o operador gerencia o catálogo de serviços extras da empresa (ex: lava-jato) e habilita/precifica cada um por unidade — fora do onboarding.

#### Catálogo (tabela)

Colunas: `Serviço` (nome + descrição) · `Preço base` · `Unidades ativas` · `Status` · `Ações`.

- **Novo serviço / Editar** → dialog com `name` (obrigatório), `description`, `base_price`, `is_active` (toggle) e `sort_order`. Persiste via RPC `operator_upsert_addon` (o `code` é slugificado do nome na criação).
- **Disponibilidade** → dialog que lista todas as unidades da empresa, cada uma com toggle de ativação e preço opcional por unidade (em branco = usa o `base_price`). Persiste via RPC `operator_set_location_addon` (`price_override`).
- **Excluir** → RPC `operator_delete_addon`. Bloqueado se o serviço já foi usado em alguma reserva (`booking_item`) — nesse caso, oriente a desativar em vez de excluir.

> **Escopo & escrita:** as tabelas `add_on_service` / `location_add_on_service` não têm RLS de escrita direta. Toda escrita passa pelas RPCs `SECURITY DEFINER` acima, que validam o vínculo `profile_company` (ou `hub_admin`) via `addon_assert_company_access`. Leitura: o operador vê os próprios serviços (inclusive inativos); o catálogo público (`anon`) só vê `is_active = true`.

> Os serviços selecionados pelo cliente entram na reserva como `booking_item` (`item_type = 'add_on'`) — ver [booking-flow.md](./booking-flow.md) e [database-schema.md](./database-schema.md).

---

### 4.6 Promoções (Cupons & Descontos)

**Rota:** `/operator/coupons` — página "Promoções" com **abas Cupons | Descontos** (item de nav "Promoções"). ✅ implementado.

**Objetivo:** o operador gere as promoções da empresa em dois pilares — **cupons** (código que o cliente digita) e **descontos automáticos** (regra aplicada direto no preço, sem código). Motor: [coupon-rules.md](./coupon-rules.md) + [discount-rules.md](./discount-rules.md).

#### Aba Cupons — `/operator/coupons`

#### Catálogo (tabela)

Colunas: `Código` · `Desconto` (ex: `10%` ou `R$ 5,00`) · `Validade` (janela `valid_from`–`valid_until`) · `Usos` (`times_used / max_uses`) · `Status` · `Ações`.

- **Novo cupom / Editar** → dialog: `code` (UPPERCASE, único na empresa), `description`, `discount_type` (percent/fixed), `discount_value` (percent ≤ 100), `valid_from`/`valid_until` (opcionais), `max_uses` (opcional), `is_active`. Persiste via RPC `operator_upsert_coupon`.
- **Ativar/Desativar** → RPC `operator_set_coupon_active` (toggle rápido sem abrir o form).
- **Excluir** → RPC `operator_delete_coupon`. **Bloqueado** se o cupom já foi usado em reserva (`booking_coupon`, FK `RESTRICT`) — nesse caso, oriente a desativar.
- (Fase 2) campos de elegibilidade: `min_amount`, `min_days`, `per_user_limit` e restrição por tipo de vaga.

> **Escopo & escrita:** `coupon` não tem RLS de escrita direta. Toda escrita passa pelas RPCs `SECURITY DEFINER` acima, que validam o vínculo via `coupon_assert_company_access` (operator da empresa ou `hub_admin`). O cliente aplica o cupom no checkout (`validate_coupon` → desconto) e ele entra na reserva como `booking_coupon` com `discount_applied` (snapshot). O contador `times_used` incrementa quando o pagamento é confirmado.

#### Aba Descontos automáticos (✅)

Promoções aplicadas **direto no preço**, sem código — o cliente vê o valor já reduzido com o preço original **riscado** (`old_price`) e um selo "-20%". Ver [discount-rules.md](./discount-rules.md).

Colunas: `Nome` · `Desconto` (% ou R$) · `Unidade` (todas/uma) · `Janela` · `Acumula c/ cupom?` · `Status` · `Ações`.

- **Novo/Editar** → dialog: nome, unidade (todas ou uma), `discount_type`+valor, janela `valid_from`/`valid_until`, condições (`min_days`, `min_amount`, `advance_days`), `allow_coupon_stack`, prioridade, tipos de vaga, ativo. Persiste via `operator_upsert_discount`.
- **Ativar/Desativar** → `operator_set_discount_active`. **Excluir** → `operator_delete_discount` (bloqueado se já usado em reserva — `booking_discount`).
- A regra é avaliada no `simulate_price` (best-pick: uma só, a de maior valor) e o snapshot vai para `booking_discount`. Empilha com cupom quando `allow_coupon_stack = true`.

---

### 4.7 Avaliações

**Rota:** `/operator/reviews` (nav "Avaliações"). ✅ implementado — ver [reviews.md](./reviews.md).

Lista as avaliações publicadas das unidades da empresa (nota, autor, data, comentário) e permite **responder publicamente** via RPC `operator_respond_review`. A resposta aparece no bloco de avaliações da página da unidade. Moderação (despublicar) é da equipe Movepark (hub_admin).

---

### 4.8 Relatórios

**Rota:** `/operator/reports`

**Objetivo:** análise de desempenho da empresa.

#### Abas

**Receita**
- Gráfico de linha — receita diária no período
- Selector de período: últimos 7d · 30d · 90d · personalizado
- Breakdown por tipo de vaga (stacked bar)
- Total do período, média diária, crescimento vs. período anterior

**Ocupação**
- Taxa de ocupação por localização e tipo de vaga
- Heatmap por dia da semana × hora do dia

**Reservas**
- Total de reservas por status no período
- Funil: criadas → confirmadas → concluídas → canceladas
- Tempo médio de estadia

**Export**
- Download CSV / XLSX para qualquer relatório
- Período configurável

---

### 4.9 Configurações

**Rota:** `/operator/settings`

#### Aba — Perfil da Empresa

- Nome de exibição
- Logo
- E-mail de contato
- Telefone de suporte

#### Aba — Notificações

- Toggle por tipo de evento:
  - Nova reserva criada → notificar por e-mail
  - Cancelamento → notificar por e-mail / push
  - Check-in pendente (X min antes) → notificar

#### Aba — Usuários da Empresa

- Lista de operadores vinculados
- Convidar novo operador (por e-mail)
- Revogar acesso

> Operadores adicionados aqui recebem role `company_operator` com o mesmo `company_id`.

---

## 5. Componentes Adaptados do Design System

| Airbnb Token | Uso no Operator Panel |
|---|---|
| `{colors.primary}` | substituir por `{colors.mp-primary}` |
| `{colors.canvas}` (#ffffff) | mantém |
| `{colors.surface-soft}` (#f7f7f7) | sidebar, rows pares de tabela |
| `{rounded.md}` (14px) | cards de KPI, drawer, modais |
| `{rounded.sm}` (8px) | botões, inputs, badges |
| `{component.reservation-card}` | KPI cards do dashboard |
| `{component.date-picker-day}` | filtros de período |
| `{typography.display-xl}` | número destacado de KPI |
| `{typography.body-sm}` | meta de tabelas e timelines |
| `{component.button-primary}` | confirmar reserva, check-in/out |
| `{component.button-secondary}` | cancelar, exportar |

---

## 6. Estados de UI

- **Loading:** skeleton nas tabelas, KPI cards e timeline
- **Empty state:** por contexto
  - Sem reservas hoje: "Nenhuma reserva para hoje — aproveite para organizar sua localização" + ilustração
  - Sem dados no relatório: "Selecione um período com movimentação"
- **Error state:** toast de erro com mensagem clara
- **Success:** toast bottom-right, auto-dismiss 4s
- **Real-time:** badge de "atualizado agora" na timeline do dia

---

## 7. Responsividade

| Breakpoint | Comportamento |
|---|---|
| Mobile < 744px | Sidebar → bottom navigation (ícones); drawer vira full-screen sheet; tabelas viram lista de cards |
| Tablet 744–1128px | Sidebar colapsa para ícones; drawer ocupa 60% da tela |
| Desktop > 1128px | Sidebar completa (240px); drawer lateral (480px) |

---

## 8. Fluxos Críticos

### Fluxo — Confirmar Check-in

```
Timeline do dia
  → Clica na reserva
    → Drawer abre
      → Botão "Registrar Check-in"
        → Modal de confirmação (placa, observações)
          → Confirma
            → Status atualiza para `active`
              → Toast "Check-in registrado"
```

### Fluxo — Cancelar Reserva

```
Tabela de Reservas
  → Ação "Cancelar"
    → Modal: "Tem certeza? Essa ação não pode ser desfeita."
      → Campo obrigatório: motivo (select + texto livre)
        → Confirma
          → Status → `cancelled`
            → Cliente notificado automaticamente
```

---

## 9. Open Points

- [ ] Confirmação manual de reservas: fluxo obrigatório ou opcional por empresa?
- [ ] Política de cancelamento: quem define — Movepark ou operador?
- [ ] Integração de acesso (cancela/portão): escopo futuro ou MVP?
- [ ] Operador pode editar uma reserva já confirmada?
- [ ] App mobile para operadores ou apenas web responsivo?
