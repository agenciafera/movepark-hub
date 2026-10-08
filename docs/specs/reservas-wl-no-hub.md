# Reservas do white-label no Hub

> **Status:** fase 0 em revisão e fase 1 no ar, **desligada**, em 08/10/2026 (ver § 8). Decididos em
> 08/10/2026: Q1 (painel único), Q2 (rota nova no legado) e Q5 (as 8 empresas com WL no Hub).
> Q3 e Q4 foram adotadas como recomendado (§ 7).
> **Pergunta:** dá para trazer as reservas feitas nos sites white-label (WL) para o Hub,
> contabilizadas à parte e sem afetar quem vende só pelo Hub? E dá para dar, a essas unidades,
> no Hub, as funcionalidades que elas têm no WL?
> **Base:** leitura do legado (`movepark-backoffice-v4`, `movepark-nextjs`), do Hub e do banco vivo.
> Relacionadas: `shared-availability.md`, `espelhamento-preco-wl.md`, `checkout-externo-por-local.md`,
> `agente-whatsapp-wl.md`, ADR-006, ADR-010, contrato do parceiro v2 (Anexo A).

## 1. Resposta curta

1. **Trazer as reservas: dá, com tabela própria (`wl_booking`), nunca em `booking`.** Em `booking`,
   cerca de 45 das 68 funções que a leem precisariam de filtro, além de 7 triggers e 4 crons, e dois
   triggers devolveriam a venda ao próprio WL. Em tabela própria, nenhuma delas muda.
2. **"Contabilizar separado" já é a natureza do dado.** O dinheiro da venda WL cai na conta Pagar.me
   do tenant, com split configurado lá. Nada passa pelo Hub: é valor informativo, nunca entra em
   repasse, comissão, extrato do parceiro nem nos KPIs do Hub.
3. **O WL não tem rota que liste reservas.** Só detalhe por número e "última por cliente". Importar
   exige uma rota nova no legado (recomendado) ou ler o Postgres de cada tenant direto.
4. **"Funcionalidades semelhantes" tem duas leituras, de tamanhos muito diferentes** (§ 5): operar as
   reservas do WL dentro do painel do Hub (médio) ou o Hub servir o site com a marca do parceiro no
   lugar do WL (grande). É a decisão que define o resto.

## 2. O que foi medido

### 2.1 Volume

| Empresa | Modo no Hub | Capacidade (vaga principal) | Ocupação média do WL, próximos 30 dias | Pico |
|---|---|---|---|---|
| Virapark | external | 1.100 | 436 carros por dia | 1.198 |
| BePark | hub | 400 | 31 | 86 |
| Abbapark (3 vagas) | hub | 80 + 120 + 15 | 35 | 63 |
| Nationpark (3 vagas) | hub | 250 + 250 + 15 | 26 | 44 |

Fonte: `location_parking_availability.external_booked_count`, que é o `sold_wl` do WL por dia, em
carros-dia (não em reservas). Com estadia média de uns 5 dias, a Virapark vende na ordem de 80 a
90 reservas por dia. O Hub inteiro tem 41 reservas, 17 pagas ou ativas. **Se o WL entrasse em
`booking`, mais de 99% da tabela seria WL.**

O pico de 1.198 numa vaga de 1.100 indica que o WL vendeu acima da capacidade cadastrada no Hub
num dia, ou que as duas capacidades divergem. Vale conferir com a Virapark.

O legado tem **14 tenants** (`config/production/whitelabel.php`); o Hub conhece 8 deles como
empresa com `wl_domain`.

### 2.2 Como a reserva vive no WL

- Multi-tenant por schema do Postgres. Pedido em `lovata_orders_shopaholic_orders`, item em
  `..._order_positions`, cupom em `..._order_promo_mechanism`, cliente em `users` (RainLab).
- Colunas úteis: `order_number`, `status_id`, `category_id` (unidade), `initial_date`/`final_date`
  (hora local, sem fuso), `license_plate`, `origin`, `external_id` (o id que o Hub manda),
  `paid_total_price`, `attendance_status` (compareceu/no-show), `created_at`/`updated_at`.
  Contato do cliente fica em `property` (JSON) e em `users`.
- Status: `new`, `in_progress`, `complete`, `canceled`, `expired`, `refund-requested`, `refunded`.
- Troca de data é edição direta das colunas, sem histórico. Troca de placa tem log próprio.
- **Não há índice em `updated_at`.**

### 2.3 O que o WL expõe hoje

| Rota | Serve para importar? |
|---|---|
| `GET backend/order/detail?order_number=` | Uma por vez, e só se já se sabe o número |
| `GET backend/order/last-by-user?email=\|phone=` | Só a última do cliente |
| `GET account/orders`, `account/orders/search` | Só do cliente logado (JWT dele) |
| Webhooks por tenant (pago, voucher, cancelado, pagamento falhou) | Parcial: não cobrem troca de data, expiração nem estorno |

**Não existe lista por data ou por alteração.** E plugar o Hub no `n8n_webhook_url` desliga o
voucher e o e-mail do WL naquele tenant (`OrderModelHandler.php:369-378`): não serve de atalho.

### 2.4 O que o Hub tem que seria afetado

68 funções leem ou escrevem `booking`; nenhuma filtra por origem. 11 triggers em `booking` e 3 nas
tabelas ligadas, entre eles cashback, membership e indicação ao concluir, webhook WPS, lead de
marketing e os dois do WL (`booking_item_wl_reserve`, `booking_wl_release`). Crons de conclusão,
expiração, lembrete (e-mail e WhatsApp) e pedido de avaliação. A constraint
`profile_id IS NOT NULL OR created_via_api_key_id IS NOT NULL` obrigaria a criar conta para cada
cliente do WL, o que fere o ADR-006.

O valor `booking.origin = 'white_label'` já existe e significa outra coisa: venda que veio do site
WL mas **fechou no checkout do Hub**, com dinheiro e comissão do Hub (regra `match_white_label`).
Usar o mesmo marcador para venda legada faria a comissão casar com venda que não pagou comissão.

## 3. Trazer as reservas: desenho recomendado

### 3.1 Onde guardar: `wl_booking`

Mesmo raciocínio do ADR-010: o estado impossível fica impossível por ausência de coluna e de FK.

- Colunas: `company_id`, `location_id`, `location_parking_type_id` (pelo De/Para de slugs),
  `wl_order_number` (único por empresa), `status` (o do WL, normalizado), `check_in_at`/`check_out_at`
  (convertidas de hora local de São Paulo), `license_plate`, `total_cents` informativo, `origin` e
  UTM do WL, `attendance_status`, snapshot de contato (`customer_name`, `customer_email`,
  `customer_phone`), `wl_created_at`, `wl_updated_at`, `synced_at`.
- **Nenhuma FK de `booking`, `payment`, `payout_*`, `review`, `coupon` aponta para ela.** Sem trigger
  de cashback, e-mail, WhatsApp, WPS ou WL.
- **Não importa o que o Hub mandou:** pedido cujo `external_id` é um `wl_external_id(booking)` já
  está em `booking`.
- RLS: `hub_admin` e membro com escopo de leitura (ADR-005; escopo novo ou `bookings:read`, ver gate
  Q3). Escrita só pela Edge de sincronização (service_role).

### 3.2 Como ler do WL

| Caminho | A favor | Contra |
|---|---|---|
| **Rota nova no legado** `GET backend/orders?updated_since=&page=` (recomendado) | Contrato explícito, mesmo token e cliente que o Hub já usa, sem acesso ao banco | Mexer no legado: controller, índice em `updated_at` por schema |
| Ler o Postgres de cada tenant | Nada a construir no legado | Credencial de banco no Hub, acoplamento ao schema interno do Shopaholic, 14 schemas |
| Webhooks do WL | Já existem | Não cobrem troca de data, expiração nem estorno; um deles desliga o voucher do WL |

Sincronização: Edge `wl-bookings-sync` com cursor `(wl_updated_at, wl_order_number)` por empresa,
cron de 15 em 15 minutos no molde da `wl-reconcile`, com estado e erro em `wl_sync_state` e entrada
na `wl_integration_health`. Carga inicial: janela a definir (gate Q4).

**O cursor por `updated_at` tem um furo conhecido.** Troca de data pelo backoffice passa pelo
model e atualiza `updated_at`. Mas há escritas por SQL cru que não atualizam, como o CAS de
`order_count_applied` (`OrderModelHandler.php:352`). Para o que a importação precisa (status,
datas, placa, comparecimento) o model resolve; vale uma releitura completa semanal dos pedidos
futuros como rede de segurança, no mesmo espírito da `wl-reconcile`.

### 3.3 Contabilizar separado

- O dinheiro da venda WL **não passa pelo Hub**. `total_cents` é informativo: nunca entra em
  `payment`, `payout_*`, `partner_account_statement`, `commission_*` nem em `manager_dashboard_overview`.
- Onde aparecer, aparece **rotulado e somado à parte**: no Operator, "Vendas no seu site"; no
  Manager, um bloco próprio ("Vendas no site do parceiro"), nunca misturado à receita do Hub.
- A capacidade **não muda**: `external_booked_count` já representa o WL no anti-overbooking. A
  `wl_booking` só exibe. (Depois que a importação estiver confiável, dá para derivar o
  `external_booked_count` dela e aposentar a leitura de `/availability`, mas isso é outra fase.)

### 3.4 Dados do cliente (LGPD e contrato)

O contrato v2, Anexo A, diz que o WL é produto que a Movepark licencia e que **os dados do cliente
do WL são do parceiro**. Trazer para o Hub é a Movepark tratando dado do parceiro como operadora:

- uso só para a operação daquele parceiro (painel dele, suporte);
- **nunca** em marketing da Movepark (`marketing_lead`, RFM, campanhas), Mia ou carteira;
- sem ligar a conta do Hub por coincidência de e-mail ou telefone (ADR-006). Se um dia houver
  "histórico unificado do cliente", liga só por identificador verificado por OTP.

A Virapark está como `hub_relationship = 'silent'`: o parceiro não sabe que está no Hub. Importar a
base dela para um painel que ela não usa não tem destinatário, e é a que mais pesa em dado pessoal.

## 4. Fases propostas para a importação

| Fase | Entrega | Mexe em |
|---|---|---|
| 0 | Rota `GET backend/orders?updated_since` + índice em `updated_at` | legado. **PR agenciafera/movepark-backoffice#614, em revisão** |
| 1 | `wl_booking` + Edge de sincronização + saúde | Hub, nada das 68 funções. **Feita em 08/10/2026, desligada** |
| 2 | Reservas do WL na lista do Operator, só leitura, com selo "do seu site" | uma RPC de leitura (`booking UNION ALL wl_booking`) |
| 3 | Bloco "Vendas no site do parceiro" no Manager e no Dashboard do Operator, à parte da receita do Hub | duas RPCs novas |
| 4 | Ações sobre a reserva do WL a partir do Hub (§ 5.1) | legado + Hub |

## 5. Funcionalidades do WL no Hub

### 5.1 Leitura 1: o parceiro opera tudo num painel só (Hub)

O parceiro com WL passa a ver e mexer nas reservas do site dele dentro do Operator. O Hub já tem
quase tudo para as reservas dele mesmo; o que falta é **escrever de volta no WL**:

| Ação no WL | No Hub hoje (reserva do Hub) | Para reserva do WL, precisa |
|---|---|---|
| Lista e detalhe de pedidos | Sim (`/operator/bookings`) | Fase 2 |
| Validar voucher / check-in | Sim (QR, `/voucher/validate`) | Rota no legado para marcar entrada, ou o Hub só registra localmente |
| Compareceu / no-show | Sim | Rota no legado (`attendance_status`) |
| Trocar placa com motivo | Sim | Rota no legado (já existe o serviço, falta expor) |
| Trocar status / cancelar | Sim, com estorno | Estorno no WL é manual no Pagar.me: fica no WL |
| Regerar voucher | Sim (PDF) | Link para o voucher do WL |
| Relatórios (receita, UTM, origem, permanência) | Parcial (`/operator/reports`) | Fase 3 |
| Cupons, descontos, campanhas do site | Sim, só para o Hub | Ficam no WL |
| Preço por classe PHP | Editor de preço, mas o espelho sobrescreve | Fica no WL; o espelho continua trazendo |
| CRM, segmentos, links curtos | Não para o parceiro | Fica no WL |

Tamanho: médio. O Hub vira painel, o WL continua sendo onde a venda acontece.

### 5.2 Leitura 2: o Hub substitui o site WL

O Hub passa a servir o site com a marca do parceiro (domínio, logo, cores, só as unidades dele) e
o checkout do Hub fecha a venda com o recebedor do parceiro. É a direção em que tudo converge
(preço, capacidade, cliente, comissão num lugar só), mas:

- não há nada disso no Hub hoje: o worker serve só `movepark.co`; `company.logo_url` é gravado e
  nunca exibido;
- cada parceiro precisa estar pronto para vender pelo Hub (contrato v2, recebedor ativo, split):
  em 27/09 só 1 de 11 empresas tinha aceito o contrato e 5 de 6 recebedores não existiam no gateway;
- o que o WL faz e o Hub não faz por parceiro: classe de preço própria, CRM e campanhas por tenant,
  OTP por SMS, Viva Wallet (Fera Park na Europa);
- o contrato v2 e a estratégia escrita vão no sentido oposto por enquanto ("base instalada aponta
  para fora, lote novo nasce no Hub", revisão em 20/01/2027).

Tamanho: grande, e depende mais de negócio que de código.

## 6. Riscos e pendências que valem independente da decisão

- **Token global do backend do WL vazou** em exports do Dify (`agente-whatsapp-wl.md`) e libera ler
  pedido e criar reserva nos 14 tenants. Precisa ser rotacionado antes de o Hub depender mais dele.
- **Duas rotas sem autenticação no legado** (`MP/api/routes/account.php`):
  `GET account/order/transaction/{id}` devolve o pedido inteiro, com `property` (nome, telefone,
  veículo), só a partir do id da transação; e `PATCH webhook/orderconfirmation/callback` grava QR,
  gera voucher e manda e-mail. É exposição de dado pessoal hoje, independente desta decisão.
- **Segredo de assinatura dos webhooks do WL é um literal no código, igual para todos os tenants.**
- **Pico da Virapark acima da capacidade** (1.198 contra 1.100).
- **Fuso:** o WL guarda hora local sem fuso; a importação converte de `America/Sao_Paulo`, o mesmo
  fuso que `wl_local_date` usa para mandar.

## 7. Gates (decisões abertas)

| # | Decisão | Recomendação |
|---|---|---|
| Q1 | Leitura 1 (painel único) ou leitura 2 (Hub substitui o WL)? | **Decidido em 08/10/2026: leitura 1, painel único.** A venda segue no site WL; o parceiro vê e opera no Hub. A leitura 2 volta na revisão de 20/01/2027 |
| Q2 | Rota nova no legado ou ler o Postgres dos tenants? | **Decidido em 08/10/2026: rota nova** (PR #614) |
| Q3 | Quem vê: só Movepark (Manager) ou também o parceiro (Operator)? Escopo novo `wl-bookings:read` ou o `bookings:read`? | Os dois, com escopo próprio só-leitura, para o papel Financeiro poder ver sem operar. **Fase 1 abre só para hub_admin**; o escopo entra na fase 2, junto da tela do Operator |
| Q4 | Janela da carga inicial | Últimos 12 meses mais tudo que ainda vai acontecer. **Adotado** (`app_setting.wl_booking_import.lookback_months = 12`) |
| Q5 | Quais empresas: as 4 com sync ligado, as 8 conhecidas, ou os 14 tenants? E a Virapark (`silent`)? | **Decidido em 08/10/2026: as 8 empresas com WL no Hub**, Virapark incluída. Consequência: a Virapark sozinha é a maior parte do volume (cerca de 436 vagas ocupadas por dia) e é a relação silenciosa, então o cuidado de § 3.4 (uso só operacional, nada de marketing nem de ligação de conta) pesa mais nela. A recomendação era começar pelas 3 que vendem pelo Hub |

## 8. Fase 1 implementada (08/10/2026)

Migration `20261128233000_wl_booking_importacao.sql`, Edge `wl-bookings-sync`, pgTAP
`wl_booking_import.test.sql` (18 casos).

- **`wl_booking`**: uma linha por pedido do site, única por `(company_id, wl_order_id)`. Datas do
  legado (hora local sem fuso) convertidas de `America/Sao_Paulo`. Status do legado traduzido
  (`complete` → `confirmed`, `canceled` → `cancelled`, `refund-requested` → `refund_requested`…),
  com o original em `wl_status`. De/Para por `(wl_category_slug, wl_product_slug)` dentro da empresa;
  sem par, a reserva entra sem vaga. Nenhuma FK de entrada, nenhum trigger além de `updated_at`.
- **`wl_booking_sync_state`**: cursor `(cursor_updated_since, cursor_after_id)` por empresa, última
  leitura boa e último erro.
- **`wl_booking_apply_page`** (service_role): grava a página e avança o cursor na mesma transação.
  Pula, avançando o cursor, pedido cujo `external_id` é uma reserva do Hub e pedido que saiu antes
  da janela. Não regride: versão mais velha do pedido não sobrescreve a mais nova.
- **Edge `wl-bookings-sync`** (cron `7,22,37,52 * * * *`): para cada empresa de
  `wl_booking_import_target` (domínio e tenant de WL), pede página após página até `has_more = false`
  ou até o orçamento de 90 s; o que sobrar continua na próxima passada. Cursor que não anda com
  `has_more = true` vira erro em vez de laço.
- **Chave:** `app_setting.wl_booking_import = {"enabled": false, "lookback_months": 12, "page_limit": 200}`.
  Desligada, a Edge responde `{"ok": true, "enabled": false}` e não chama o legado.
- **Saúde:** motivo `importacao_parada` em `wl_integration_health` (só com a chave ligada), bloco
  "Reservas feitas no site do parceiro" em `/manager/white-label`, explicação no `wl-health.yml`.
- **Leitura:** só `hub_admin` (RLS). O Operator entra na fase 2.

### Para ligar

1. Merge do PR #614 na `develop`, conferir em staging, merge na `main` (deploy do legado em
   produção, de preferência fora do pico por causa do índice).
2. Rotacionar o token de backend do legado (vazou) e atualizar o segredo `WL_BACKEND_TOKEN` no Hub.
3. `update app_setting set value = jsonb_set(value::jsonb, '{enabled}', 'true')::text where key = 'wl_booking_import';`
4. Acompanhar a primeira carga em `/manager/white-label`. A Virapark é a maior (centenas de reservas
   por dia): leva algumas passadas de 15 minutos até alcançar o presente.
