# Ações do cliente no operador, parte 1: plano de implementação

> Execução inline nesta sessão (preferência do Kallef: nada de agente de fundo). Spec:
> [`2026-11-26-acoes-do-cliente-no-operador-design.md`](../specs/2026-11-26-acoes-do-cliente-no-operador-design.md) §3.

**Objetivo:** a equipe da empresa (com `bookings:write`) altera as datas e faz o upgrade de plano da
reserva paga pela tela, com PIX na tela; as Edges passam a conferir o escopo de quem age.

**Arquitetura:** um helper puro decide o ator (`decideActor`) e um wrapper de I/O
(`resolveBookingActor`) busca papel, vínculo e escopo; as seis Edges usam o wrapper. A regra da
Básica mora na Edge `change-booking-dates-paid` (vale para tela e Mia). A tela ganha um card
"Alterar reserva" com duas janelas e um painel de PIX compartilhado.

**Stack:** Deno (Edges, `deno test`), React + TanStack Query + Testing Library (Vitest).

## Regras globais

- Copy em pt-BR, sem travessão nem meia-risca; passa pela skill `revisar-texto`.
- O balcão (sem `finance:read`) nunca recebe total da reserva; só diferença de tabela e upgrade.
- Cartão pela equipe não existe (ADR-004).
- Commit e push na `main`; Edges com `supabase functions deploy` (as públicas com `--no-verify-jwt`
  já fixado no `config.toml`).
- Rodar `bun run test` com o Node 22 do nvm (Node 26 quebra o localStorage dos testes).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/_shared/booking-actor.ts` (novo) | `decideActor` (puro) + `resolveBookingActor` (I/O) |
| `supabase/functions/_shared/booking-actor.test.ts` (novo) | matriz do ator |
| `cancel-booking`, `change-booking-vehicle`, `change-booking-dates`, `extend-booking` (`index.ts`) | trocam o bloco de autorização pelo wrapper |
| `change-booking-dates-paid/logic.ts` (+ teste) | `waive_fare_upgrade`/`reason` no input, `fareUpgradeFor`, `chargeCents`, `stripTotals` |
| `change-booking-dates-paid/index.ts` | escopo, upgrade da Básica, PIX único, totais escondidos, dispensa do hub_admin |
| `create-fare-upgrade/logic.ts` (+ teste) | `checkBookingUpgradable` aceita `isStaff` |
| `create-fare-upgrade/index.ts` | wrapper de ator com `bookings:write` |
| `pagarme-webhook/index.ts` | `date_change` com `fare_target_tier`: datas e depois upgrade; log do upgrade |
| `src/features/bookings/customerApi.ts` | tipos e args novos (`fare_upgrade`, totais opcionais, dispensa) |
| `src/features/bookings/staffChange.logic.ts` (+ teste) | resumo da prévia para a equipe, detecção do pago |
| `src/features/bookings/PixChargePanel.tsx` | QR, copiar, validade, "Pagamento recebido" |
| `src/features/bookings/StaffChangeDatesDialog.tsx` | janela de alterar datas da equipe |
| `src/features/bookings/StaffFareUpgradeDialog.tsx` | janela de upgrade da equipe |
| `src/features/bookings/BookingDetailView.tsx` (+ teste) | card "Alterar reserva", escopo no Cancelar e no Trocar placa |
| `src/features/bookings/bookingHistory.logic.ts` (+ teste) | texto do upgrade (de, para, dispensado) |

## Tarefas

### T1. Ator da reserva por escopo
- `decideActor({ isOwner, isHubAdmin, isMember, hasScope })` →
  `{ kind: "owner" } | { kind: "staff", hubAdmin } | { kind: "denied", status: 403, error }`.
  Dono vence (segue os gates de cliente). hub_admin é equipe. Sem vínculo: "Sem permissão para
  alterar esta reserva." Com vínculo e sem escopo: "Seu papel na empresa não permite esta ação."
- `resolveBookingActor({ admin, userClient, userId, ownerId, companyId, scope })`: lê
  `profiles.role`, `profile_company` e `member_has_scope` (com o JWT), e chama `decideActor`.
- `seesMoney({ userClient, companyId })`: `member_has_scope(company, "finance:read")`.
- Teste: dono; hub_admin; membro com escopo; membro sem escopo (Financeiro); não membro.
- As quatro Edges (`cancel-booking` com `bookings:cancel`; as outras com `bookings:write`) trocam o
  bloco atual pelo wrapper, mantendo as mensagens de 403.

### T2. Troca de datas pela equipe com upgrade da Básica
- `logic.ts`: input aceita `waive_fare_upgrade` (boolean) e `reason` (string ≤ 300);
  `fareUpgradeFor({ isStaff, isHubAdmin, waive, benefits, currentFareCents, flexCents })` devolve
  `{ tier: "flex", cents } | null` (só equipe, sem `date_change`, sem dispensa);
  `chargeCents(deltaCents, upgrade)` = `max(delta, 0) + upgrade.cents` quando delta > 0;
  `stripTotals(view)` tira `current_total`, `new_total`.
- `index.ts`: ator por T1; `waive_fare_upgrade` só com hub_admin e com `reason` (senão 403/400).
  Com upgrade e delta > 0: PIX de `delta + upgrade`, `buildSplit` com `chargedCents` somado e
  `baseCents = delta`, `payment.fare_target_tier = "flex"`, cotação gravada com `fare_upgrade` e
  `actor_role`. Com upgrade e delta ≤ 0: 409 `code: "fare_upgrade_first"` com o valor do upgrade
  (a tela faz o upgrade e volta). Dispensa: log `fare_upgrade` com `changes.waived`.
  Sem `finance:read` (e não dono): `stripTotals` em todas as respostas e `total_amount` nulo.
- Webhook: no ramo `date_change`, depois de `apply_paid_date_change` sem erro e com
  `fare_target_tier`, chama `apply_fare_upgrade`; passa `p_actor_role` da cotação; loga o upgrade.
- Teste (`logic.test.ts`): Básica pela equipe soma o upgrade; Flex não; cliente não; hub_admin com
  dispensa não; `chargeCents`; `stripTotals`; input com dispensa sem motivo é recusado.

### T3. Upgrade pela equipe
- `checkBookingUpgradable` ganha `isStaff`: equipe não precisa ser dona. Teste novo.
- `index.ts`: ator por T1 com `bookings:write`.

### T4. Tela
- `staffChange.logic.ts`: `staffQuoteSummary(quote)` (o que cobrar, o que devolver, upgrade) e
  `changeLanded(booking, alvo)` (datas iguais às pedidas, ou plano igual ao alvo). Testes.
- `PixChargePanel`: QR, código com "Copiar código", validade, e quando `paid` "Pagamento recebido".
- `StaffChangeDatesDialog`: datas, prévia, confirmar; Básica mostra a linha do upgrade; no Manager,
  caixa "Não cobrar o upgrade" com motivo; `fare_upgrade_first` vira o passo do upgrade e volta.
  Enquanto espera o PIX, relê a reserva a cada 3 s (`refetchInterval` no `useBookingByCode`).
- `StaffFareUpgradeDialog`: Flex ou Superflex acima do atual, PIX.
- `BookingDetailView`: card "Alterar reserva" (reserva `confirmed`, antes da entrada, com
  `bookings:write`), Cancelar com `bookings:cancel` também no Operator, Trocar placa com
  `bookings:write`.
- Testes no `BookingDetailView.test.tsx`: botões por escopo; Financeiro sem Cancelar; card some
  depois da entrada.

### T5. Fechamento
- `bookingHistory.logic`: "Plano alterado de Básica para Flex", "Upgrade para Flex dispensado".
- Specs: `booking-modifications.md` (§5 e nova §8.7), `operator-panel.md`, `permissions.md`,
  `fares.md`, `assistente-do-operador.md`; texto do `quote_date_change` da Mia.
- `bun run typecheck`, `bun run lint`, `bun run test`, `deno test` das Edges tocadas.
- `/security-review` e advisors do Supabase (diff mexe em Edge).
- Deploy das Edges, commit, push, conferir no ar.
