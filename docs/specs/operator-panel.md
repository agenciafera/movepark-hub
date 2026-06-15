# Operator Panel — Spec

> Painel para os estacionamentos parceiros gerenciarem suas próprias operações.  
> Design base: Airbnb design system (a ser recolorido com brand Movepark).

---

## 1. Visão Geral

O **Operator Panel** é o painel de cada empresa parceira (ex: Nationpark, Aerovalet). O operador enxerga **apenas os dados da sua própria empresa** — sem acesso a outras empresas ou configurações globais da plataforma.

**Acesso:** usuários com role `company_operator` vinculados a uma empresa.

---

## 2. Roles & Permissões

### Modelo de papéis da plataforma (decisão jun/2026 — Pedro/PO)

O Hub tem **três papéis** no enum `user_role`, que cobrem as três audiências do produto:

| Role | Audiência | Onde loga | Painel |
|---|---|---|---|
| `customer` | Cliente final (usuário comum) | `/entrar` (passwordless) | Conta do cliente (`/account`) |
| `company_operator` | **Dono do estacionamento** (parceiro) | `/login` (senha) | Operator Panel (`/operator`) |
| `hub_admin` | **Super admin Movepark** (equipe interna) | `/login` (senha) | Manager (`/manager`) |

> **Por quê só esses três:** as três figuras de negócio — usuário comum, dono do
> estacionamento e super admin da Movepark — **já estão resolvidas pelo login**: cada
> papel cai no seu painel via `RequireRole`/`effectiveRole`, com RLS isolando por
> empresa (`current_company_ids()`) e `is_hub_admin()` para o backoffice. Não há
> distinção formal **dono vs. operacional** *dentro* de uma mesma empresa hoje:
> todo usuário vinculado a uma `company` via `profile_company` é `company_operator`
> com acesso total à empresa.

**Sub-papéis dentro da empresa (dono vs. operacional) — adiado.** Quando o parceiro
precisar de usuários com permissões diferentes (ex.: operacional sem acesso a
financeiro/repasses), será preciso um modelo de staff: coluna de papel em
`profile_company` (ou enum estendido), reflexo em `effectiveRole`/escopo, RLS de
escrita por papel e UI de "Usuários da Empresa". Planejado em atividade dedicada
(ver Backlog) e na pendência do `CLAUDE.md` ("Decisão sobre modelo de staff/backoffice").

| Role | Descrição |
|---|---|
| `company_operator` | Acesso total à própria empresa — único role neste painel |

> Isolamento por empresa é garantido no backend — o token JWT carrega o `company_id`
> e o RLS resolve a empresa via `current_company_ids()`.

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

### 4.6b Check-in por QR (`/voucher/validate`)

✅ implementado — ver [voucher-qrcode.md](./voucher-qrcode.md). O operador escaneia o QR do voucher no
portão e cai em `/voucher/validate?code=<code>` (rota pública, conteúdo por papel). Logado como operador,
vê a validação (código, veículo, datas, status + janela prevista) e o botão **"Registrar entrada"**
(confirmed → `checked_in` + `checked_in_at`, via RLS `booking_operator_update`). A **saída** continua no
drawer de Reservas (§4.2.1). Cliente que abrir a URL vê um aviso e link para a própria reserva.

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

### 4.10 Usuários da empresa ✅ (E1.6)

Tela `/operator/users` (item "Usuários" na sidebar). Lista os membros vinculados à
empresa em escopo (`company_list_members`, RPC `SECURITY DEFINER` — qualquer membro vê
o roster com nome, e-mail e papel).

**Sub-papéis (E1.6):** cada vínculo em `profile_company` tem um `company_role`:
- **Dono (`owner`)** — acesso total: operação, financeiro e gestão de usuários.
- **Operacional (`operator`)** — operação do dia a dia, sem gestão de usuários.

Quem é dono (`useAuth().isCompanyOwner`) vê controles para **alterar o papel**
(`company_set_member_role`) e **remover** (`company_remove_member`) — ambos owner-only no
banco, com **guarda de "último dono"** (a empresa nunca fica sem dono; espelhada no client
por `team.logic.ts → canModifyMember`). Operacional vê só os papéis (badge), sem controles.
`hub_admin` (inclusive impersonando) conta como dono. Default da coluna é `owner`, então
todos os vínculos pré-existentes seguem com acesso total.

**Adiado (follow-ups):**
- **Convidar usuário novo por e-mail** — exige Edge `SECURITY DEFINER` criando o auth user
  (padrão `approve-partner`); hoje a tela gere apenas membros já existentes.
- **Gating de financeiro/repasses por papel** — depende do painel de extrato/repasses
  (E1.5), ainda não construído.

---

### 4.10 Chaves de API (Desenvolvedores)

**Rota:** `/operator/api-keys` (nav "API"). 📝 Especificado — ver [public-api.md](./public-api.md) §8.

**Objetivo:** o operador cria e gerencia **chaves de API** da empresa para integrar sistemas externos
(ex.: WPS — E2.6) com a Public API do Hub. Cada chave carrega **escopos** (permissões por módulo:
`bookings:read`, `bookings:write`, `locations:read`, …) — princípio do menor privilégio.

#### Catálogo (tabela)

Colunas: `Nome` · `Prefixo` (ex.: `mp_live_8Kf2c1…`) · `Ambiente` (live/test) · `Escopos` (chips) ·
`Último uso` · `Status` · `Ações`.

- **Criar chave** → dialog: `name`, `environment`, seleção de **escopos** (catálogo §7 da spec),
  `expires_at` opcional. O **segredo é exibido uma única vez** (copiar + aviso). Persiste via RPC
  `operator_create_api_key`.
- **Rotacionar** → `operator_rotate_api_key`. **Revogar** → `operator_revoke_api_key` (imediato).
  **Editar escopos** → `operator_update_api_key_scopes`.

> **Escopo & escrita:** `api_key` não tem RLS de escrita direta — tudo passa pelas RPCs
> `SECURITY DEFINER` acima (validam o vínculo com a empresa). A UI **nunca** recebe `key_hash` nem o
> segredo após a criação. Ver [public-api.md](./public-api.md).

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
