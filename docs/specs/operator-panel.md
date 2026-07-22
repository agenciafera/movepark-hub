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

### 4.10 Usuários da empresa ✅ (E1.6 + E1.7 + E1.8 · ADR-005)

Tela `/operator/users` (item "Usuários" na sidebar, gateada por `team:read`). Lista os
membros vinculados à empresa em escopo (`company_list_members`).

**4 papéis fixos (`company_role`):** Dono (`owner`), Gerente (`manager`), Operação
(`operator`), Financeiro (`finance`). Cada um é um pacote fixo de escopos (seed
`company_role_scope`) — ver a matriz completa em [permissions.md](./permissions.md). Não há
construtor de regras.

**Gestão (E1.7):** quem tem **`team:write`** (Dono) vê o botão **"Convidar usuário"** (Edge
`invite-company-member`: e-mail + papel → magic link), o **seletor de papel** dos 4 presets
(`company_set_member_role`) e o **remover** (`company_remove_member`). Tudo gateado por escopo
no servidor e espelhado no client por `useAuth().hasScope("team:write")`. **Guarda de "último
dono"** atualizada: rebaixar o único dono para **qualquer** papel não-Dono é bloqueado.
`hub_admin` (inclusive impersonando) conta como dono.

**Gating por papel (E1.8):** a sidebar e as rotas do operador são filtradas por escopo
(`<RequireScope>` + `filterNavByScopes`): Financeiro/Repasses (`finance:read`), Promoções
(`coupons:write`), Serviços (`addons:write`), Ocupação (`occupancy:read`), Chaves de API
(`api-keys:write`), Avaliações (`reviews:read`). As escritas correspondentes são bloqueadas no
servidor (RPC/RLS) — a UI nunca é a única barreira.

**Compat:** o backfill da E1.6 deixou `owner` por padrão, então vínculos pré-existentes seguem
com acesso total; só membros explicitamente não-Dono ficam restritos.

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

## 8.y Reservas + status de check-in (E1.5.1)

- O operador vê as reservas da sua unidade em `/operator/bookings` (escopo por `useScopedLocationIds`),
  filtra por **status**, **busca por código** e **período de check-in** (date pickers `from`/`to`).
- No `BookingDrawer` aciona a máquina de estados: confirmar, **check-in** (`checked_in` + `checked_in_at`),
  **check-out** (`completed` + `checked_out_at`), **não compareceu** (`no_show`, terminal, sem estorno) e
  cancelar+estornar (E0.3.2). `StatusBadge` mostra o estado (chegou/em uso/concluída/não-compareceu).
- Check-in por QR também disponível em `/voucher/validate` (escaneando o voucher). Dashboard do operador
  resume check-ins/check-outs do dia.

## 8.z Extrato de repasses (E1.5.2)

- `/operator/finance` ("Repasses") mostra ao parceiro, da **sua** empresa: **saldo a receber**
  (`payout_balance`), o **extrato do mês** (`payout_statement` com `includeLines` — bruto, estornos,
  **líquido a receber**, comissão da Movepark + linhas por reserva) e o **histórico de saques**
  (`payout_withdrawal`, taxa diluída). Consome a reconciliação da **E0.3.3**; o escopo é garantido pelas
  RPCs (operator só a sua empresa) e exibe o **status do recebedor** (`payout_recipient`).
- **NFs** ficam como **placeholder** — dependem da camada fiscal (**E0.2**, em definição com a contabilidade).

## 8.x Preço e disponibilidade na extranet (E1.4)

- **Editar preço (E1.4.1):** o operador edita a precificação da sua unidade em
  `/operator/locations/:id/parking-types` → "Configurar precificação". Como `pricing_rule`/`pricing_tier`
  têm RLS só de leitura, a escrita passa pela RPC **`operator_set_pricing`** (SECURITY DEFINER, valida a
  posse via `current_company_ids()`) — grava a regra + as faixas + o `base_price` numa transação. Mesmo
  padrão do `onboarding_set_pricing`.
- **Capacidade (E1.4.2):** edição inline de `location_parking_type.capacity` (RLS `lpt_operator_update`)
  e regras de reserva (estadia/data mínima, near-capacity) via `CapacityRulesForm`.
- **Bloqueio de datas (E1.4.2):** na grade de **Ocupação** (`/operator/occupancy`) o operador clica numa
  data para **bloquear/liberar** reservas (reforma, evento, lotação por fora). Persiste em
  `location_parking_availability.blocked` via RPC **`operator_set_date_blocked`**; o motor de reserva
  (`_create_booking_core`) **rejeita** datas bloqueadas (antes do cálculo de preço). A RPC
  `operator_location_occupancy` devolve `blocked` para a grade exibir o estado.

### Editar unidade é página, não modal

O parceiro edita a unidade em **`/operator/locations/:locationId/editar`**. Era um dialog com os 15
campos empilhados num grid de 2 colunas, sem seções: dentro de um modal o parceiro não sabia onde
estava nem o que faltava. A página divide em blocos nomeados, cada um respondendo a uma pergunta:
**Identificação**, **Contato**, **Chegada**, **Fotos** e **Política de reserva**. O bloco
**Catálogo Movepark** (slug, status, fuso, âncora de destino, código WPS) só aparece no escopo
`full`, ou seja, nunca para o parceiro.

- A barra de ações é `sticky` no rodapé: com seis blocos o formulário passa da dobra em qualquer
  tela, e salvar não deve exigir rolar até o fim.
- Estado e submit ficam em `useLocationForm`; a apresentação em `LocationSections`. O dialog
  (`LocationForm`) continua existindo porque o **manager também cria** unidade a partir da empresa,
  e nesse fluxo a sobreposição faz sentido. Os dois consomem as mesmas seções, então não divergem.
- A posse é verificada pela própria listagem: `useOperatorLocations` já vem escopada por empresa, e
  a página resolve a unidade com um `find` nessa lista. Id de outra empresa cai em "não encontrada".
- O deep-link legado `?edit=<id>` (usado pelo "Adicionar mais fotos" do preview) redireciona para a
  página com `replace`, sem deixar a listagem no histórico entre o preview e o editor.

### Plano de cancelamento não existe para o parceiro

`/operator/fares` **não aparece no menu da empresa e não é alcançável por membro de empresa**. Preço
e disponibilidade dos planos Flex e Superflex são produto da Movepark, então a tela é da equipe
interna.

O gate é o escopo de plataforma **`fares:write`** (ver [permissions.md](./permissions.md)): um
trigger recusa concedê-lo a papel de empresa, e o `hasScope` do front devolve `true` só para
`hub_admin`, inclusive impersonando, que é como ele chega na tela. Com um escopo só, o item some da
sidebar, some da command palette (que filtra pela mesma função) e a rota redireciona quem digita a
URL. Antes o item usava `pricing:write`, que é preço de diária e não tem relação com plano.

O RLS de `location_fare` e `fare` já exigia `is_hub_admin()` para escrever; o furo era a RPC
**`operator_set_unit_fare`**, que sendo `SECURITY DEFINER` passa por cima do RLS e aceitava qualquer
membro com `pricing:write` (na prática, dono e gerente da empresa). A RPC agora exige `is_hub_admin()`,
alinhada com o RLS das tabelas que ela escreve. A UI gateia por **`session.role`**, o papel real, e
não pelo `effectiveRole`: o hub_admin chega nessa tela por impersonation, quando o papel efetivo já
virou `company_operator`, e `is_hub_admin()` também olha o papel real, então os dois batem.

Migration `20260903000000_fare_edit_is_hub_admin_only.sql`, pgTAP em `location_fare.test.sql`.

### Busca do painel (command palette)

O campo de busca da topbar abre uma **command palette** (`⌘K` no mac, `Ctrl+K` no resto), compartilhada
entre `/operator` e `/manager` pelo `AppShell`. Ela faz duas coisas: acha objetos e pula para telas.

- **Objetos** vêm da RPC **`admin_search(p_query, p_limit)`** (`UNION` entre `booking`, `location` e
  `coupon`). Reserva casa por código, nome e e-mail do cliente; unidade por nome e endereço; cupom por
  código. Termo com menos de 2 caracteres devolve vazio, para uma tecla solta não varrer as tabelas.
- **Escopo por empresa é explícito na query, não herdado do RLS.** As policies são permissivas e se
  somam com `OR`: `location` tem a `catalog_read_location` e `coupon` tem a `catalog_read_coupon`, ambas
  liberando leitura para `anon`/`authenticated` (o site do consumidor precisa listar estacionamentos).
  Uma busca que confiasse só no RLS devolveria unidade e cupom **de outras empresas** para o operador.
  Por isso cada ramo carrega `is_hub_admin() OR company_id = any(current_company_ids())`. A função é
  `SECURITY INVOKER` de propósito: o RLS segue valendo por baixo e o filtro é a segunda camada.
- **Navegação** reaproveita as seções da sidebar e passa pelo mesmo `filterSectionsByScopes`, então a
  palette nunca é atalho para uma tela que o papel do usuário não abre (ADR-005).
- **Destino de cada resultado** (`palette.logic.ts`): reserva abre a listagem com `?q=<código>` já
  semeado (o painel não tem rota de detalhe de reserva); unidade vai para `/operator/locations` ou, no
  manager, para `/manager/companies/:id/locations` (a rota é aninhada na empresa, por isso a RPC
  devolve `company_id`); cupom só existe no operator. Quando o painel não tem rota para o tipo, o
  resultado **não é exibido** em vez de virar link morto.
- Índices de trigrama (`pg_trgm`, GIN) em `booking.code`, `booking.customer_name`,
  `booking.customer_email`, `location.name`, `location.address` e `coupon.code`.

Migration `20260902000000_admin_search.sql`.

## 9. Open Points

- [ ] Confirmação manual de reservas: fluxo obrigatório ou opcional por empresa?
- [ ] Política de cancelamento: quem define — Movepark ou operador?
- [ ] Integração de acesso (cancela/portão): escopo futuro ou MVP?
- [ ] Operador pode editar uma reserva já confirmada?
- [ ] App mobile para operadores ou apenas web responsivo?
