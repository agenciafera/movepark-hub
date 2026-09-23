# Venda pelo Hub (piloto BePark) e benefícios das tarifas: plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vender pelo checkout do Hub um estacionamento real (piloto BePark) sem nenhuma promessa
vazia na ficha: cada benefício das tarifas Básica, Flex e Superflex entregue por um mecanismo
real, e a virada `external → hub` protegida por um pré-voo igual ao que já existe no outro sentido.

**Architecture:** três blocos independentes. (A) Plataforma: bugs e faltas medidos em 23/09/2026 que
quebrariam a primeira venda de um parceiro real. (B) Benefícios: um a um, promessa contra
mecanismo, fechando o que a spec `tarifas-operacao.md` mapeou, com as respostas de Q-025 a Q-030
aceitas como propostas. (C) Piloto BePark: passos operacionais com o Kallef, na ordem que o
pré-voo exige.

**Tech Stack:** React 18 + Vite SSG, TanStack Query, Supabase (Postgres + RLS + Edge Deno), pgTAP
no banco vivo em transação revertida (`bash $SP/tap.sh <teste> <migration>`), Vitest, `deno test`.

## Global Constraints

- Só na `main`; migration aplicada por `supabase db query --linked -f` + `migration repair`;
  carimbo `AAAAMMDDHHMMSS` único (`ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d`).
- `src/types/database.ts` editado à mão. Edges publicadas com `--no-verify-jwt`.
- Sem travessão em texto nenhum. Copy pela skill `revisar-texto`.
- Nunca `supabase start`. Nunca mover dinheiro: compra, saque e cancelamento são do Kallef.
- Função definer nova: `revoke ... from public, anon` nominal; o inventário de grants acusa.
- Catálogo muda o futuro, nunca o passado: a reserva decide por `fare_*` gravados na compra.

## Decisões tomadas em 23/09/2026 (Kallef)

| Tema | Decisão |
|---|---|
| Piloto | BePark (Aeroporto de Confins), uma vaga coberta, capacidade 400, `fixed_bracket` |
| Aviso ao parceiro | Só o painel Operator (sem e-mail/WhatsApp ao estacionamento por reserva) |
| Preço depois da virada | O espelho do white-label continua rodando para unidades `hub` que ainda têm domínio WL |
| Capacidade | Ligar `wl_sync_enabled` na BePark depois de corrigir a liberação no `expired`; exige o limitador de vagas ligado no WL dela |
| Contrato | Aceite na tela pelo dono da BePark basta |
| Preço BePark | Tabela confirmada com a BePark e corrigida no Manager (site dela recusa o cálculo desde 18/09) |
| Q-025 | Proteção de voo: até 24h a mais, uma vez por reserva, acionável até a saída mais a tolerância |
| Q-026 | Número do voo opcional no checkout Superflex, obrigatório ao acionar |
| Q-027 | A diária estendida é paga pela Movepark ao parceiro |
| Q-028 | SLA do suporte prioritário: 15 min em horário estendido |
| Q-029 | Troca de placa e data sem limite, com contador em `booking_modification` |
| Q-030 | Cancelamento a 1 min não compensa o parceiro; medir |

## Medições que fundamentam o plano (23/09/2026)

- 8 externos com preço espelhado e capacidade; nenhum com recebedor, contrato ou split; só
  Abbapark e Virapark com usuário; Virapark `silent`.
- `wl_delivery` só leva reserve/release (quantidade e datas). `release` só em `cancelled`;
  `expired` nunca libera.
- Espelho de preço filtra `checkout_mode = 'external'`; BePark com `calculation-price 400` desde 18/09.
- Transferência entre recebedores nunca foi liberada pela Pagar.me (`payout_transfer` vazia):
  custódia não é caminho de pagamento; recebedor + split são obrigatórios.
- `WHATSAPP_BOOKING_CONFIRMED_TEMPLATE` não está nos segredos: Flex/Superflex não recebem aviso.
- `freeCancelDeadline` cai em 24h quando `fare_cancel_until` é nulo.
- `extend-booking` sem nenhum chamador no front. `priority_support` sem nada por trás.
- Garantia: `MOVEPARK_SUPPORT.whatsapp = ""`; o botão manda ao WhatsApp do estacionamento.

---

## Bloco A: plataforma (bugs e faltas para a primeira venda de um parceiro real)

### A1. Vaga presa no white-label: `release` também no `expired`
- Migration: trigger `booking_wl_release` passa a disparar quando `new.status in ('cancelled','expired')`
  e o status antigo não era um desses. `event_id` continua `<booking>:release` (idempotente).
- pgTAP em `supabase/tests/wl_delivery.test.sql` (ou novo): reserva com reserve entregue que expira
  enfileira release; expirar duas vezes não duplica.

### A2. Pré-voo da virada para `hub`
- RPC `location_hub_readiness(p_location_id) → jsonb {ready, missing: text[]}` checando: empresa
  `onboarded` (não `silent`), `onboarding_status='active'`, contrato aceito, recebedor `active` com
  id e sem `gateway_missing_at`, `effectiveSplitEnabled` (global ou empresa), toda vaga ativa com
  `pricing_rule` e `capacity > 0`, `take_rate_bps` definido.
- Trigger `location_checkout_mode_guard`: ao virar para `hub` (UPDATE), exige `ready`, com a lista
  do que falta na mensagem. INSERT com `hub` continua livre (unidade nova nasce hub sem vender: a
  RLS/is_listed cuida).
- `LocationPlatformDialog`: mostra os itens que faltam e desabilita o toggle com o motivo, como no
  sentido externo. Vitest.
- pgTAP `checkout_mode_hub_readiness.test.sql`.

### A3. Unidade externa não reserva pelo Hub por nenhum caminho
- `_create_booking_core`: se `location.checkout_mode = 'external'`, `raise` "Esta unidade reserva
  pelo site do estacionamento." Cobre `create-booking`, chat, MCP e Public API. pgTAP.

### A4. `create-pix-charge` confere o status do recebedor
- Mesmo gate do cartão: com split ligado, recebedor precisa ser `active` (não só ter id). Deno.

### A5. `sync-recipient create` limpa `gateway_missing_at`
- Ao recriar o recebedor com sucesso, `gateway_missing_at = null`. Deno.

### A6. Espelho de preço para unidades `hub` com domínio WL
- `wl-price-mirror` (e `wl_mirror_trigger`) passam a incluir `checkout_mode in ('external','hub')`
  desde que a empresa tenha `wl_domain` e a vaga tenha os dois slugs. Quando o site do parceiro
  responder erro, a regra mantém a última tabela (como hoje) e o `pricing_mirror_run` registra.
- Deno para o filtro; observação: a BePark só volta a espelhar quando o site dela responder.

### A7. Reconciliação de confirmação manda e-mail e WhatsApp
- `reconcile-confirmations` no ramo `confirmar`: `sendBookingConfirmationEmail` (idempotente por
  `confirmation_email_sent_at`) e `notifyBookingConfirmed`. Deno.

## Bloco B: benefícios, um a um

### B1. Cancelamento grátis (todas)
- Bug: `freeCancelDeadline(checkIn, null)` devolve `null` (sem cancelamento grátis) em vez de 24h;
  `refundDecision` trata `null` como "sem reembolso". Deno.
- Alteração de data recalcula a janela a partir da janela DA RESERVA (`check_in_at - fare_cancel_until`
  antes da troca), não do catálogo. pgTAP em `change_booking_dates`/`apply_paid_date_change`.

### B2. A ficha lê o catálogo
- `FareComparisonDialog` e os tooltips do `ReservationCard` montam a matriz a partir de
  `get_unit_fares` (`benefits` + `cancel_window_minutes`), com os rótulos de `FARE_BENEFIT_LABELS`.
  Linha "vaga garantida" vira "em qualquer tarifa" fora do grid (1.5). Comparativo diz que alterar
  data reprecifica (1.4). `ListingTrustBar` lê a janela da Básica. Vitest + `listing.capabilities`.

### B3. Troca de placa (Flex+)
- Servidor bloqueia depois do check-in (`checked_in_at` ou status `checked_in`). Contador: já vai
  para `booking_modification` (Q-029). Deno.

### B4. Proteção de voo (Superflex)
- Migration: `booking.flight_number text` (opcional, checkout Superflex);
  `booking_fare_extension.flight_number text not null`; RPC `extend_booking_flight_delay` ganha
  limite: `new_check_out <= old_check_out + 24h`, uma extensão por reserva, acionável até
  `check_out_at + tolerância`; exige `p_flight_number`. Lançamento: a Movepark deve ao parceiro a
  diária extra: linha em `payout_debt_settlement` com `kind = 'flight_extension_credit'` e valor
  negativo (crédito), calculada pelo motor (`simulate_price` de 1 diária na vaga) e mostrada na
  conta do parceiro como "Extensão por atraso de voo, paga pela Movepark". pgTAP.
- Edge `extend-booking`: recebe `flight_number`; cliente e staff.
- UI: botão "Meu voo atrasou" em `bookings-detail.tsx` (Superflex, confirmada/em uso, dentro do
  prazo) com nova saída e número do voo; a mesma ação em `BookingDetailView` (Operator e Manager).
  Campo "Número do voo (opcional)" no checkout da Superflex. Copy de `/cancelamento`: "estende
  sozinha" vira "estende com um clique, até 24h, sem custo". Vitest.

### B5. Avisos por WhatsApp (Flex+)
- `notification_log` (canal, evento, reserva, destino, status, id externo, chave de idempotência).
- `_shared/notify.ts`: `notify(event, booking)` → WhatsApp quando template configurado; senão (ou
  em falha) e-mail. Eventos: confirmação (existe), lembrete 24h antes do check-in, lembrete de
  retirada (2h antes do check-out), cancelamento/estorno, alteração de data aplicada, troca de
  veículo, extensão. Cron `booking-reminders` a cada 15 min.
- E-mails transacionais faltantes: alteração de data, troca de veículo (ADR-007 em `email.ts`).
- Templates da Meta: nomes e parâmetros documentados na spec; aprovação é do Kallef. Até lá, o
  benefício é entregue por e-mail e a copy diz "avisos por WhatsApp ou e-mail".

### B6. Suporte prioritário (Superflex)
- `mia-inbox` `listar`: para cada conversa, consulta reserva ativa pelo telefone e devolve
  `prioridade: 'superflex' | null` e `sla_minutos: 15`. RPC `booking_priority_for_phone(text)`
  (service_role) devolve tarifa da reserva ativa mais próxima. Conversas: fila ordenada por
  prioridade e espera, selo "Superflex · SLA 15 min" e tempo desde a última fala do cliente.
  Deno + Vitest.

### B7. Vaga garantida (todas)
- `MOVEPARK_SUPPORT.whatsapp` = `WHATSAPP_SUPORTE_DIGITOS` (fonte única). Botão "Acionar garantia"
  passa a abrir a Movepark, não o estacionamento.
- Migration: `guarantee_claim` (reserva, aberto por, quando, situação: `open|relocated|refunded|
  dismissed`, valor coberto, nota). Edge `claim-guarantee` (cliente, reserva confirmada/em uso, no
  dia do check-in ou depois): grava o claim e devolve o link do WhatsApp com o código.
- Manager: card "Garantias acionadas" em Reservas (lista + fechar com desfecho e valor). Processo
  manual documentado na spec `spot-guarantee.md`. JSON-LD do slogan condicionado a `hubCheckout`.

### B8. Propagar mudança ao white-label (Flex+, sync ligado)
- Alteração de data e extensão: `release` da janela antiga + `reserve` da nova, `event_id` com
  sufixo da versão. Placa não vai (o WL não recebe placa). pgTAP.

## Bloco C: piloto BePark (com o Kallef, na ordem do pré-voo)

1. Convite ao dono da BePark → login → aceite do contrato (Operator › Recebimento) → KYC → recebedor
   (`sync-recipient`) → prova de vida → `active`.
2. Split por empresa (Manager › Recebedores) e regra de comissão, se houver.
3. Tabela de preço confirmada com a BePark e corrigida no Manager; limitador de vagas ligado no WL
   dela; `wl_sync_enabled` on.
4. Virada pelo diálogo com o pré-voo verde. Compra de teste real (PIX e cartão), check-in no
   Operator pelo dono, cancelamento, e a conferência do split e do extrato.

## Ordem de execução

A1, A3, A4, A5, A7 (pequenos, fecham buracos) → B1, B3 (bugs) → A2, A6 → B2 → B4 → B7 → B6 →
B5 → B8 → C (depende do parceiro).
