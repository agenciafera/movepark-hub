# Roteiro D - Jornada do operador (dono de estacionamento)

Prova a área do parceiro (`/operator`) ponta a ponta: login e escopo, o que cada papel vê e não vê,
edição de unidade/tipo de vaga/capacidade/preço, reservas (lista, filtro, detalhe, transições),
check-in por QR, extrato de repasse e KYC do recebedor, catálogo comercial e relatórios.

- **Baseline:** 25/07/2026, verificado contra a `main` (gates rodados: typecheck, lint, `bun run test`, `bun run test:db`).
- **Alvo:** produção (`hub.movepark.co` + projeto `mgaigbezdalbyuqiofcf`). Não existe staging do Hub.
- **Usuário:** `peu+operador@fera.ag`, dono (owner) da company **Abbapark** (unidade Aeroporto Afonso Pena), já vinculado em `profile_company`. Papéis de negação (Gerente/Operação/Financeiro) precisam de um membro com esse papel; o dono e o hub_admin furam todo gate de escopo (ver O-06).
- **Automação:** os specs do dono vivem em `e2e/playwright/owner/`, partidos por efeito colateral (mesma ideia do roteiro C). Os que **escrevem** (`O01-dono-jornada`, `O02-operacao-reservas`) ficam no project `e2e-owner-tx`, que só roda pedindo pelo nome; os de **leitura** (`R01-reservas-filtro`) ficam no `e2e-owner` e rodam na suíte padrão. Fora daí, `e2e/playwright/manager/T06-impersonation` e `e2e/playwright/operator/O22-escopo-rota` também cobrem casos deste roteiro. O restante é pgTAP e Vitest, apontado caso a caso.
- **Gateway em SANDBOX:** cobranças deste roteiro não movem dinheiro real e não precisam de estorno.

O nome no ClickUp é "Roteiro D". Os casos usam o prefixo **O-** (owner) para casar com o spec em `e2e/playwright/owner/`.

Status de cada caso é **derivado de evidência** (arquivo:linha, commit, teste), nunca declarado. Quem revisar reconfere no código antes de mexer em qualquer linha de status.

## Sumário dos status

| Caso | O que prova | Status |
|---|---|---|
| O-01 | A lista de reservas da empresa carrega | **PRONTO** · e2e `O01-dono-jornada.spec.ts` (O-01) |
| O-02 | O dono vê as reservas encerradas (expired), soft-delete não esconde | **PRONTO** · e2e (O-02) + commit `e1d2438` (F1) + `d380845` (expired) |
| O-03 | Mudar o preço propaga para busca, checkout e painel | **PRONTO** · e2e (O-03) |
| O-04 | Escopo: o dono só enxerga as unidades da própria empresa | **PRONTO** · sem e2e · RLS + `useScopedLocationIds.ts:13` |
| O-05 | hub_admin entra como operador (impersonation) | **PRONTO** · e2e `manager/T06-impersonation.spec.ts` |
| O-06 | Pacotes de escopo por papel (Dono/Gerente/Operação/Financeiro) | **PRONTO** · pgTAP `operator_rpc_scope.test.sql` |
| O-07 | Operação NÃO vê dinheiro (receita, ticket, RevPAR, saldo) | **PRONTO** · `OperatorDashboard.test.tsx` + `reports.test.tsx` |
| O-08 | Financeiro NÃO vê edição nem avaliações | **PRONTO** · seed `permission_scopes.sql:95-105` + `OperatorDashboard.test.tsx` |
| O-09 | Enforcement é no servidor (RPC sem escopo devolve 42501) | **PRONTO** · pgTAP `operator_rpc_scope.test.sql` + `regate_operator_rpcs.sql` |
| O-10 | Editar a unidade (dados, horário, comodidades) | **PRONTO** · `location-edit.test.tsx` + RLS `location_operator_update` |
| O-11 | Tipo de vaga e capacidade dedicada | **PRONTO** · pgTAP `capacity.test.sql` + RLS `lpt_operator_update` |
| O-12 | Preço é server-authoritative e exige `pricing:write` | **PRONTO** · e2e (O-03) + `regate_operator_rpcs.sql:103-107` |
| O-13 | Reservas: filtro por status e busca por código | **PRONTO** · e2e `owner/R01-reservas-filtro.spec.ts` |
| O-14 | Detalhe da reserva e transições válidas (guard no banco) | **PRONTO** · e2e `O02-operacao-reservas.spec.ts` (O-14) + `BookingDrawer.test.tsx` |
| O-15 | Check-in por QR: confirmed vira checked_in | **PRONTO** · e2e `O02-operacao-reservas.spec.ts` (O-15) + pgTAP `booking_status_guard.test.sql` |
| O-16 | Extrato de repasse e saldo (finance:read / payouts:read) | **PRONTO** · `finance.test.tsx` + pgTAP `payout_*` |
| O-17 | KYC do recebedor: só o Dono salva (payouts:write) | **PRONTO** · pgTAP `payout_kyc.test.sql` + e2e `T10/T15/T16` |
| O-18 | Cupons, descontos e serviços adicionais (CRUD por escopo) | **PRONTO** · pgTAP `coupon_rpc`/`discount_rpc`/`addon_rpc` |
| O-19 | Ocupação e bloqueio de data | **PRONTO** · `occupancy.tsx` + `regate_operator_rpcs.sql:196,229` |
| O-20 | Relatórios: funil livre, Receita gateada por finance | **PRONTO** · `reports.tsx` + `reports.test.tsx` |
| O-21 | Relatórios que faltam (achado) | **ACHADO** · comparativo por unidade e atribuição escopada ao dono não existem |
| O-22 | Rota gateada por escopo devolve pro dashboard | **PRONTO** · e2e `operator/O22-escopo-rota.spec.ts` |

Furos da varredura (detalhe em `furos-visao-dono.md`): F1 (canceladas) **corrigido**, F3 (preço base R$ 0) **corrigido**, F4 (abandono vs cancelamento, status `expired`) **corrigido**. F2 (3 reservas de teste "Test Pentest"/R$ 0 no Abbapark) segue como dado de teste conhecido em produção; limpeza é operação de banco, não código.

## Fixtures deste roteiro

| Papel na prova | Quem | Como chega |
|---|---|---|
| Dono (owner) | `peu+operador@fera.ag`, company Abbapark | vínculo `profile_company` já semeado (`e2e/playwright/auth/abbapark-owner.setup.ts`) |
| Negação por papel | membro com `company_role` = manager/operator/finance | precisa existir um `profile_company` com esse papel; os pgTAP criam o membro na hora |
| Super admin | `developer@fera.ag` (`hub_admin`) | fura todo gate; usado só para impersonation (O-05) |

Fonte da verdade dos papéis e escopos: seed `company_role_scope` em `supabase/migrations/20260713000000_permission_scopes.sql:66-105`.

---

## O-01 · A lista de reservas da empresa carrega  [PRONTO · e2e `O01-dono-jornada.spec.ts`]

- **Antes:** a Abbapark tem reservas concluídas. `select count(*) from booking b join location l on l.id=b.location_id join company c on c.id=l.company_id where c.name ilike '%abba%'` > 0.
- **Passos:** logar como dono, abrir `/operator/bookings`.
- **Depois:** o cabeçalho "Reservas" e a coluna "Status" aparecem; a tabela lista as reservas da empresa (`useBookings` escopado por `useScopedLocationIds`).
- **Efeitos colaterais:** nenhum (leitura).
- **Armadilhas:** a lista escopa por `location_id` da empresa; um dono com mais de uma unidade vê todas, um operador impersonado vê só a empresa-alvo.

## O-02 · O dono vê as reservas encerradas (soft-delete não esconde)  [PRONTO · e2e (O-02)]

- **Antes:** a Abbapark tem reservas encerradas. Depois da separação abandono vs cancelamento, os pending que expiraram viraram `expired` (não `cancelled`): `select count(*) from booking ... where status='expired'` = 22, `cancelled` = 0 (25/07).
- **Passos:** em `/operator/bookings`, abrir o filtro Status e escolher "Expirada".
- **Depois:** o filtro mostra "Expirada" e ao menos uma linha "Expirada" aparece. Encerrar uma reserva faz soft-delete (`deleted_at`), mas a lista **não** filtra `deleted_at` (correção do F1 em `src/features/bookings/api.ts`, commit `e1d2438`).
- **Efeitos colaterais:** nenhum.
- **Armadilhas:** antes do F1 o filtro "Cancelada" era natimorto (a lista filtrava `deleted_at is null` e toda cancelada tem `deleted_at`). Hoje o Abbapark tem `expired`, não `cancelled`, então o filtro que traz linhas é "Expirada".

## O-03 · Mudar o preço propaga para busca, checkout e painel  [PRONTO · e2e (O-03)]

- **Antes:** snapshot das faixas de preço da Vaga Descoberta do Abbapark (a `pricing_rule` da unidade).
- **Passos:** em `/operator/pricing`, "Editar preços" do tipo, gravar uma diária nova; simular o preço do consumidor; reservar 1 diária como cliente até o passo de pagamento; abrir a reserva no painel do dono.
- **Depois:** a RPC `simulate_price` devolve o valor novo; o snapshot da reserva (`parking_unit_price`) grava o valor novo; a reserva nova aparece em `/operator/bookings?q=<code>`. O preço volta ao snapshot no `afterAll`.
- **Efeitos colaterais:** cria um `booking` pendente real (expira sozinho) e altera o preço do Abbapark temporariamente (revertido).
- **Armadilhas:** o preço é revertido no teardown; se o teste cair no meio, confira o snapshot em `pricing_tier`. A reserva pendente expira pelo cron; nunca `delete` em `booking`.

## O-04 · Escopo: o dono só enxerga as unidades da própria empresa  [PRONTO · sem e2e · `useScopedLocationIds.ts:13-35`]

- **Antes:** existe mais de uma empresa no banco.
- **Passos:** logar como dono do Abbapark e abrir `/operator/bookings`, `/operator/locations`, relatórios.
- **Depois:** só aparecem dados da(s) empresa(s) em `effectiveCompanyIds`. As queries do front filtram por `location_id` da empresa (`useScopedLocationIds`), e a RLS de `booking`/`location` restringe no servidor mesmo que o front falhe.
- **Efeitos colaterais:** nenhum.
- **Armadilhas:** o filtro do front é conveniência; a barreira real é a RLS. Um operador de outra empresa que tente ler por fora da UI é barrado no banco (ver O-09).

## O-05 · hub_admin entra como operador (impersonation)  [PRONTO · e2e `manager/T06-impersonation.spec.ts`]

- **Antes:** logado como `hub_admin` (`developer@fera.ag`).
- **Passos:** em `/manager/companies`, clicar para entrar como a empresa (`startImpersonation(companyId)`); navega para `/operator`.
- **Depois:** `effectiveRole` vira `company_operator` e `effectiveCompanyIds` vira a empresa-alvo; o `ImpersonationBanner` aparece no shell do operador; "sair" (`stopImpersonation`) volta para `/manager`. A empresa impersonada persiste em `localStorage` (`mp:impersonated-company-id`) e trocar invalida as queries.
- **Efeitos colaterais:** nenhum (muda só a sessão local).
- **Armadilhas:** hub_admin tem `hasScope` sempre `true`, então impersonando ele **vê tudo**. Para provar negação por papel, use um membro real com papel operator/finance, não o admin impersonando.

## O-06 · Pacotes de escopo por papel  [PRONTO · pgTAP `operator_rpc_scope.test.sql`]

- **Antes:** seed `company_role_scope` aplicado (`permission_scopes.sql:66-105`).
- **Passos:** conferir `member_has_scope(company, scope)` para cada papel.
- **Depois (verdade do seed):**
  - **Dono (owner):** todos os escopos do catálogo.
  - **Gerente (manager):** tudo menos `team:write`, `api-keys:write`, `payouts:write`.
  - **Operação (operator):** leitura de catálogo/preço/ocupação/faq + `bookings:read/write/cancel/checkin` + `reviews:read` + `wps:write` + `team:read`. Sem dinheiro, sem escrita de preço/cupom.
  - **Financeiro (finance):** leitura de catálogo/preço/ocupação/faq + `bookings:read` + `finance:read` + `payouts:read` + `team:read`. **Sem `reviews:read`.**
  - `payouts:write` (saque/KYC) é **exclusivo do Dono**.
- **Efeitos colaterais:** nenhum.
- **Armadilhas:** o seed é delete+insert (autoritativo); mudar pacote de papel é migration, não UI. Escopo de plataforma (`checkout:link`) não entra em papel de empresa (trigger `company_role_scope_no_platform` recusa).

## O-07 · Operação NÃO vê dinheiro  [PRONTO · `OperatorDashboard.test.tsx` + `reports.test.tsx`]

- **Antes:** membro com papel **operator**.
- **Passos:** abrir `/operator` (dashboard) e `/operator/reports`.
- **Depois:** o bloco de dinheiro do dashboard (Receita, Ticket médio, RevPAR, Saldo a repassar) e o gráfico de receita **não** aparecem (`canMoney = finance:read || payouts:read`, `OperatorDashboard.tsx:197-235`). Em Relatórios, a aba Receita e o export de receita somem; sobra o funil (`reports.tsx:67,96`). A sidebar não mostra "Repasses" (`nav-items.ts:107`, scope `finance:read`).
- **Efeitos colaterais:** nenhum.
- **Armadilhas:** o gate é por escopo, não por nome de papel. Testar tanto o esconder-na-UI quanto a RPC no servidor (O-09).

## O-08 · Financeiro NÃO vê edição nem avaliações  [PRONTO · seed `permission_scopes.sql:95-105`]

- **Antes:** membro com papel **finance**.
- **Passos:** abrir o `/operator` como Financeiro.
- **Depois:** o Financeiro vê dinheiro (Receita, Saldo) mas **não** vê o card Avaliações (sem `reviews:read`, `OperatorDashboard.tsx:300`). A sidebar esconde Preços (`pricing:write`), Promoções (`coupons:write`), Serviços (`addons:write`), API (`api-keys:write`) e Avaliações (`reviews:read`). Ele mantém `pricing:read`/`parking-types:read` (vê preço e catálogo em leitura).
- **Efeitos colaterais:** nenhum.
- **Armadilhas:** blindar um parceiro sensível (Q-015) é **configuração de papel**, não desenvolvimento. Decisão em aberto: o Financeiro ainda tem `pricing:read`/`parking-types:read`; se o risco é cópia, é a opção de tirar esses escopos do pacote.

## O-09 · Enforcement é no servidor (42501)  [PRONTO · pgTAP `operator_rpc_scope.test.sql` + `regate_operator_rpcs.sql`]

- **Antes:** membro sem o escopo em questão (ex.: operator sem `team:write`).
- **Passos:** chamar a RPC direto (fora da UI), ex.: `company_set_member_role` como operator; `operator_set_pricing` sem `pricing:write`.
- **Depois:** a RPC levanta `42501` (permission denied). Cada `operator_*` de escrita exige `member_has_scope` (`regate_operator_rpcs.sql`); as escritas diretas (location, location_parking_type, booking check-in) carregam o escopo na RLS de UPDATE.
- **Efeitos colaterais:** nenhum.
- **Armadilhas:** a UI é espelho, não barreira. Um caminho novo de escrita **tem** que ganhar um escopo e ser gateado no servidor, senão fura a defesa.

## O-10 · Editar a unidade  [PRONTO · `location-edit.test.tsx` + RLS `location_operator_update`]

- **Antes:** unidade da empresa do dono.
- **Passos:** em `/operator/locations/:id/editar`, mudar dados da unidade (endereço via modal, horário de funcionamento, comodidades, tolerância de saída), gravar.
- **Depois:** `select ... from location where id=<id>` reflete a mudança (`useUpdateLocation`, UPDATE direto gateado por `location_operator_update`: `company_id in current_company_ids()`).
- **Efeitos colaterais:** publicar/despublicar a unidade afeta a vitrine pública.
- **Armadilhas:** endereço é read-only com captura por modal (dado que muda por fora não apaga o que a pessoa digita). O editor resiste a saída/erro/entrada ruim (commit `276551e`).

## O-11 · Tipo de vaga e capacidade dedicada  [PRONTO · pgTAP `capacity.test.sql` + RLS `lpt_operator_update`]

- **Antes:** unidade da empresa.
- **Passos:** em `/operator/locations/:id/parking-types`, criar/editar um tipo de vaga e setar a **capacidade**.
- **Depois:** `select capacity from location_parking_type where id=<id>` reflete o valor (UPDATE direto sob `lpt_operator_update`). A capacidade entra na checagem de disponibilidade (`capacity.test.sql`).
- **Efeitos colaterais:** capacidade 0 tira a vaga da venda; capacidade é compromisso de venda, não só disponibilidade (microcopy no `ParkingTypeForm`; épico em aberto, tarefa `86ajpvjgp`).
- **Armadilhas:** o `base_price` do card é referência e não entra no cálculo; some quando é 0 (F3 corrigido). O preço cobrado vem das faixas em `/operator/pricing`.

## O-12 · Preço é server-authoritative e exige `pricing:write`  [PRONTO · e2e (O-03) + `regate_operator_rpcs.sql:103-107`]

- **Antes:** membro com `pricing:write` (dono/gerente/operação? não: operação tem `pricing:read`, não `write`).
- **Passos:** em `/operator/pricing`, "Editar preços" e gravar (`operator_set_pricing`).
- **Depois:** a `pricing_rule`/`pricing_tier` reflete o novo preço; a busca e o checkout passam a cobrar o valor novo (O-03). Sem `pricing:write`, o botão fica desabilitado com hint e a RPC devolve `42501`.
- **Efeitos colaterais:** muda o preço público da unidade na hora.
- **Armadilhas:** salvar uma curva que inverte (faixa maior mais barata) avisa; o motor é server-authoritative, então a UI não é a fonte da verdade do preço.

## O-13 · Reservas: filtro por status e busca por código  [PRONTO · e2e `owner/R01-reservas-filtro.spec.ts`]

- **Antes:** a empresa tem reservas em status variados.
- **Passos:** em `/operator/bookings`, filtrar por status (all, pending, confirmed, checked_in, completed, cancelled, expired) e buscar por código (input, ou `?q=` da command palette).
- **Depois:** a lista reflete o filtro e a busca. O escopo por empresa é aplicado.
- **Efeitos colaterais:** nenhum.
- **Armadilhas:** o filtro de status **não** inclui `no_show` (`statusOptions`, `bookings.tsx:20-28`); se um dia houver `no_show`, ele só aparece em "Todos". No e2e, assertar só que o status escolhido aparece **não** prova nada (sem filtro a lista traz todos), então cada caso confere também que o outro status sumiu da tela.

## O-14 · Detalhe da reserva e transições válidas  [PRONTO · `BookingDrawer.test.tsx` + pgTAP `booking_status_guard.test.sql`]

- **Antes:** uma reserva `confirmed` da empresa.
- **Passos:** abrir o detalhe (`BookingDrawer`), registrar check-in / no-show / conclusão / cancelamento, ou trocar a placa.
- **Depois:** as transições seguem a matriz `allowed` (`BookingDrawer.tsx:22-31`): `pending→[confirmed,cancelled]`, `confirmed→[checked_in,no_show,cancelled]`, `checked_in→[completed,cancelled]`, terminais sem saída. Check-in grava `checked_in_at`; cancelar passa pela Edge `cancel-booking` (com estorno). O banco impõe as transições pelo trigger `booking_guard_status_transition` (staff passa; cliente não promove status).
- **Efeitos colaterais:** cancelar uma reserva paga dispara estorno no gateway (sandbox).
- **Armadilhas:** o gate de horário do cancelamento mora na Edge, não na RPC; um caminho novo de cancelamento precisa refazer o gate. O guard do banco cobre a escalada do cliente, não substitui o gate de janela.

## O-15 · Check-in por QR: confirmed vira checked_in  [PRONTO · pgTAP `booking_status_guard.test.sql` + `voucher.logic.test.ts`]

- **Antes:** reserva `confirmed` com voucher válido.
- **Passos:** abrir `/voucher/validate?code=<code>` como operador, "Registrar entrada".
- **Depois:** `booking.status` vira `checked_in` e `checked_in_at` é gravado (UPDATE direto gateado por `booking_operator_update`). Só `confirmed` libera check-in; `pending`/`cancelled`/`expired`/`no_show`/`completed` bloqueiam (`voucher.logic.ts:104-115`), com janela -30min/+2h como aviso, não bloqueio.
- **Efeitos colaterais:** nenhum além do status.
- **Armadilhas:** a rota é pública (conteúdo por papel): anônimo cai no login do operador, cliente vê aviso. Operador comum não vê o nome do cliente (RLS). Não confundir com `retroactive_check_in.test.sql`, que é sobre entrada com data no passado, não check-in por QR.

## O-16 · Extrato de repasse e saldo  [PRONTO · `finance.test.tsx` + pgTAP `payout_*`]

- **Antes:** membro com `finance:read` (extrato) e `payouts:read` (saldo).
- **Passos:** abrir `/operator/finance`.
- **Depois:** o extrato (`payout_statement`), o saldo a repassar (`payout_balance`) e os saques (`payout_withdrawal`) aparecem. `payout_statement` exige posse + `finance:read`; `payout_balance` exige `payouts:read` (`regate_operator_rpcs.sql:287,374`).
- **Efeitos colaterais:** nenhum (leitura).
- **Armadilhas:** o botão "Configurar recebimento" só aparece com `payouts:write` (exclusivo do dono, `finance.tsx:66`).

## O-17 · KYC do recebedor: só o Dono salva  [PRONTO · pgTAP `payout_kyc.test.sql` + e2e `T10/T15/T16`]

- **Antes:** dono da empresa, recebedor ainda sem KYC.
- **Passos:** em `/operator/recebimento` (ou wizard), preencher dados bancários + KYC (PJ) e assinar o contrato.
- **Depois:** `onboarding_upsert_payout_account` grava as colunas + `kyc_details` e sobe o passo; `company_payout_account` fica preenchido; o aceite grava `contract_accepted_at`. Operador de OUTRA empresa recebe `42501` (`payout_kyc.test.sql`).
- **Efeitos colaterais:** assinar o contrato dispara a Edge `sync-recipient` (cria/atualiza o recebedor na Pagar.me). O KYC é coletado na UI da Movepark, nunca redirecionando pro gateway (ADR-004).
- **Armadilhas:** campo de dinheiro mascara em centavos (digitar `15000` grava R$ 150,00); telefone tem dois controles (país e número); há checkbox obrigatório "represento legalmente" no passo do representante. Todos já mordreram a automação do E1.3.

## O-18 · Cupons, descontos e serviços adicionais  [PRONTO · pgTAP `coupon_rpc`/`discount_rpc`/`addon_rpc`]

- **Antes:** membro com `coupons:write` / `discounts:write` / `addons:write`.
- **Passos:** em `/operator/coupons` (abas Cupons e Promoções) e `/operator/addons`, criar/editar/ativar/apagar.
- **Depois:** as RPCs `operator_upsert_coupon`/`operator_upsert_discount`/`operator_upsert_addon` gravam com o escopo exigido; a rota some da sidebar sem o escopo.
- **Efeitos colaterais:** cupom/desconto ativo muda o preço no listing e no checkout.
- **Armadilhas:** desconto e cupom empilham conforme `allow_coupon_stack`; a disponibilidade de add-on é por unidade (`operator_set_location_addon`).

## O-19 · Ocupação e bloqueio de data  [PRONTO · `occupancy.tsx` + `regate_operator_rpcs.sql:196,229`]

- **Antes:** membro com `occupancy:read`; bloquear data exige `pricing:write`.
- **Passos:** em `/operator/occupancy`, ver a grade por data/tipo e bloquear/liberar uma data.
- **Depois:** `operator_location_occupancy` devolve a ocupação (exige `occupancy:read`); `operator_set_date_blocked` bloqueia a data (exige `pricing:write`). A grade puxa disponibilidade WL ao vivo.
- **Efeitos colaterais:** bloquear data tira a venda daquele dia.
- **Armadilhas:** ocupação é por unidade (uma chamada por unidade); a visão multi-unidade agregada ainda não existe (O-21).

## O-20 · Relatórios: funil livre, Receita gateada  [PRONTO · `reports.tsx` + `reports.test.tsx`]

- **Antes:** membro com e sem `finance:read`.
- **Passos:** abrir `/operator/reports`.
- **Depois:** o funil de status (aba Reservas) e o export de funil são livres; a aba Receita e o export de receita (CSV) exigem `finance:read` (`reports.tsx:67,96,203`). Sem finance, a tab default cai em Reservas.
- **Efeitos colaterais:** exportar gera um CSV local (download).
- **Armadilhas:** a taxa de cancelamento do funil só faz sentido depois do F1 (canceladas visíveis) e do F4 (abandono vira `expired`, fora do denominador).

## O-21 · Relatórios que faltam  [ACHADO · sem backend]

- **O que falta (não é bug, é escopo):** comparativo período-anterior por unidade; ocupação agregada de várias unidades numa chamada; RevPAR/RevPAS por vaga disponível; take-rate exposto como número; atribuição por origem **escopada ao dono** (o RPC `booking_attribution` hoje é só `hub_admin`). Detalhe em `furos-visao-dono.md` (seção Dashboard, "O que pede backend novo").
- **Por que fica registrado:** são relatórios que o dono pediria e que dependem de RPC/endpoint novo, não de UI. Marcado como achado do roteiro, não como caso pendente.

## O-22 · Rota gateada por escopo devolve pro dashboard  [PRONTO · e2e `operator/O22-escopo-rota.spec.ts`]

- **Antes:** membro com papel **Operação** (`operator`) numa empresa. O papel tem `occupancy:read`, e não tem `pricing:write` nem `finance:read`.
- **Passos:** com esse usuário, abrir `/operator/pricing`, depois `/operator/finance`, depois `/operator/occupancy`.
- **Depois:** as duas primeiras devolvem pro `/operator` (dashboard), porque `RequireScope` faz `Navigate to="/operator"` sem o escopo; a terceira abre normalmente (título "Ocupação").
- **Efeitos colaterais:** nenhum na navegação. O teste semeia e apaga a company da fixture Mercy, e rebaixa o vínculo dela para Operação (revertido junto com a fixture).
- **Armadilhas:** o **Dono tem todos os escopos** e o hub_admin fura todo gate (`hasScope` sempre true), então com eles nada é negado e o caso não prova nada. Rebaixar papel só na fixture Mercy, nunca no dono do Abbapark, que é parceiro real. O **controle positivo** (Ocupação abrindo) é obrigatório: sem ele, o caso passaria mesmo se a área inteira estivesse caindo no dashboard por outro motivo.

---

## Cobertura automatizada e lacunas

**Coberto por automação:** O-01/02/03 (e2e `O01-dono-jornada`), O-13 (e2e `owner/R01-reservas-filtro`), O-14/15 (e2e `O02-operacao-reservas` + pgTAP `booking_status_guard`, Vitest `BookingDrawer.test.tsx`/`voucher.logic.test.ts`), O-05 (e2e `manager/T06-impersonation`), O-22 (e2e `operator/O22-escopo-rota`), O-06/07/08/09 (pgTAP `operator_rpc_scope` + Vitest `OperatorDashboard.test.tsx`, `reports.test.tsx`, `Sidebar.logic.test.ts`), O-11/12 (pgTAP `capacity`, `pricing`, `operator_pricing_dates`), O-16/17 (pgTAP `payout_*`, e2e `T10/T15/T16`), O-18/19 (pgTAP `coupon_rpc`/`discount_rpc`/`addon_rpc`/`high_demand_signal`), O-20 (Vitest `reports.test.tsx`).

Impersonation (O-05) tem e2e próprio em `e2e/playwright/manager/T06-impersonation.spec.ts`, na suíte normal do manager: impersonar mexe só na sessão local, não escreve no banco, então não precisa da trava `tx`. O bounce de rota por escopo (O-22) roda em `e2e/playwright/operator/O22-escopo-rota.spec.ts`, na suíte normal do operador, rebaixando o papel só na fixture Mercy.

**Sem rede de regressão:** nenhuma lacuna aberta. Todo caso do roteiro tem e2e, pgTAP ou teste de componente, como listado acima. Os casos que restam sem e2e de tela (O-04, O-06 a O-12, O-16 a O-20) são de regra de servidor ou de gating de componente, onde pgTAP e Testing Library provam mais barato e mais fundo que o navegador.

O `O02-operacao-reservas.spec.ts` fechou as duas maiores lacunas (check-in por QR e transição no drawer). Ele semeia uma reserva confirmada de teste no Abbapark pelo `admin` (service_role), roda a ação do operador e confere no banco; a reserva de teste (`OTEST-*`) é reutilizada por código fixo e aposentada por soft-delete, sem delete de booking.

## Limpeza

- O roteiro O-03 cria um `booking` pendente real; ele **expira sozinho** pelo cron. Nunca `delete` em `booking` (FK RESTRICT em `booking.location_id`, proposital).
- O preço alterado no O-03 volta ao snapshot no `afterAll` (`restoreTiers`).
- Provas de papéis (O-06 a O-09) rodam em pgTAP transacional (rollback), sem resíduo.
