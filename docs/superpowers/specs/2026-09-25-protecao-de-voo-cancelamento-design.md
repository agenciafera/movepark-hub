# Proteção de voo: atraso ou cancelamento

> Desenho aprovado com o Kallef em 25/09/2026, parte a parte. Substitui a "proteção contra atraso
> de voo" (tarifas-operacao §2.7) por um benefício único que cobre também o cancelamento do voo.
> Decisões desta conversa entram em `docs/specs/tarifas-operacao.md` como Q-031 a Q-034.

## O problema

A Superflex vende "proteção contra atraso de voo": saída estendida até 24h, uma vez, por conta da
Movepark. Quando o voo é **cancelado** (ida remarcada com o carro já estacionado, ou volta
cancelada) a situação é a mesma para o carro, mas a nova saída costuma passar das 24h, o
estacionamento não fica sabendo do acionamento e ninguém registra quanto tempo a mais o carro
ficou. Sem integração com a portaria, o tempo real só existe se o Operator registrar.

## Decisões

| Pergunta | Decisão |
|---|---|
| Que situações cobre | Voo de ida cancelado e remarcado com o carro já no estacionamento; voo de volta cancelado ou perdido. Não cobre cancelar a reserva antes de sair de casa (a janela de cancelamento continua a mesma). |
| Para quem | Só Superflex. É a outra metade da proteção de voo que ela já vende. |
| Quanto a Movepark subsidia | As mesmas 24h da proteção de atraso, uma vez por reserva. |
| O que passa de 24h | É do parceiro: cobrado no balcão, pela tabela dele, 100% dele, sem gateway, sem comissão e sem split. O Hub calcula e mostra o previsto aos dois lados e registra o que foi cobrado. |
| Como o estacionamento sabe | Aviso destacado no Operator (lista e reserva) e e-mail para o contato da unidade. |
| Como o tempo real entra | O Operator registra a hora real de retirada no check-out. |

## Parte 1: a regra e o acionamento

- O benefício continua sendo a flag `flight_delay_protection` no catálogo e no snapshot da
  reserva; na tela ele se chama **"Proteção de voo: atraso ou cancelamento"**. Nada de flag nova:
  quem comprou Superflex antes de hoje já tem o cancelamento coberto.
- **Quem aciona:** o cliente, na reserva (`/bookings/<código>`), com status `confirmed` ou
  `checked_in`, até 120 minutos depois da saída prevista, uma vez por reserva (regras de hoje).
  O staff continua podendo acionar pelo Manager e pelo Operator.
- **O que informa:** o motivo (`delay` ou `cancellation`), o número do voo (obrigatório) e a
  nova saída prevista. A nova saída **não tem teto**: num cancelamento ela pode ser depois de
  amanhã.
- **O Hub separa em duas partes:**
  - **saída coberta** = min(saída pedida, saída prevista + 24h). A reserva é estendida até ela
    (`check_out_at`), re-segurando a capacidade desses dias, como a RPC já faz.
  - **excedente** = o que passa da saída coberta. Não bloqueia capacidade (é previsão, não
    reserva), não muda `check_out_at` e não muda o total. Fica gravado como saída pedida.
- **Preço do excedente:** a diária vigente da unidade no momento do acionamento, pelo motor de
  preço (`simulate_price` para um dia, no tipo de vaga da reserva), congelada na extensão. O
  cliente vê na hora: "Até dd/mm hh:mm por nossa conta. Depois disso, R$ X por dia, pago no
  estacionamento na retirada."
- **Registro:** cada acionamento é uma linha de `booking_fare_extension` com `kind`,
  `flight_number`, `requested_check_out_at`, `new_check_out_at` (a coberta),
  `overage_daily_cents` (snapshot), além do que já existe (`old_check_out_at`, `added_days`,
  `partner_credit_cents`, `settlement_id`).

## Parte 2: o Operator e a saída real

- **Aviso destacado** na lista de reservas do Operator (`/operator/bookings`) e na tela da reserva:
  "Proteção de voo acionada (cancelamento, voo LA3456): sai até dd/mm hh:mm sem custo. Depois
  disso, R$ X por dia, a cobrar no balcão." Enquanto o check-out não for registrado, o aviso fica.
- **Check-out com hora real.** Na reserva com proteção acionada, o botão "Check-out" abre um passo
  a mais: a **hora real de retirada**, preenchida com agora e editável (quem registra depois
  corrige). O Hub calcula o excedente: dias além da saída coberta, arredondados para cima, vezes
  `overage_daily_cents`.
- **Registro do que foi cobrado.** O Operator confirma "cobrado no balcão: R$ X", ajusta o valor,
  ou marca "não cobrado" com um motivo curto. Grava na extensão: `actual_check_out_at`,
  `overage_cents` (previsto), `overage_charged_cents` (o que entrou), `overage_note`,
  `overage_recorded_by`, `overage_recorded_at`. O `booking.checked_out_at` recebe a hora real.
- **Sem excedente** (saiu dentro da saída coberta): o check-out segue como hoje, sem passo extra;
  `actual_check_out_at` é gravado do mesmo jeito.
- Reserva sem proteção acionada não muda nada no check-out.

## Parte 3: o dinheiro

- **As 24h cobertas:** regra de hoje (Q-027). A Movepark credita ao parceiro a diária extra pelo
  motor de preço (`payout_debt_settlement.kind = 'flight_extension_credit'`) e o total da reserva
  não muda. Atraso e cancelamento pagam igual.
- **O excedente é do parceiro.** Não passa pelo gateway, não tem comissão, não entra no split nem
  no extrato como venda. O Hub registra previsto e cobrado para a reserva contar a história
  inteira.
- **Custo visível:** o card "Proteção de voo" na reserva do Manager mostra três números: crédito
  ao parceiro (24h), excedente previsto e excedente cobrado no balcão. O relatório de tarifas
  (Manager) soma por mês: acionamentos, crédito pago, excedente previsto e cobrado.

## Parte 4: avisos e copy

- **Cliente, no acionamento:** WhatsApp pelo template de saída estendida que já existe
  (`movepark_saida_estendida`) quando cabe nas 24h; com excedente, um segundo template,
  `movepark_saida_estendida_excedente` (nome, código, saída coberta, preço por dia), porque
  template da Meta não tem frase opcional. E-mail espelha os dois casos
  (`tplBookingExtended` ganha o bloco do excedente).
- **Unidade, no acionamento:** e-mail para `location.email` com voo, motivo, saída coberta,
  preço por dia e o link da reserva no Operator (`tplFlightProtectionUnit`). Unidade sem e-mail
  só recebe pelo painel; o Manager passa a alertar "sem e-mail de contato" na unidade. Medido em
  25/09/2026: 7 das 18 unidades listadas estão sem e-mail.
- **Cliente, no check-out com excedente:** nenhum aviso novo. A reserva mostra a saída real e o
  valor registrado no balcão.
- **Copy:** matriz, tooltips e ficha dizem "Proteção de voo: atraso ou cancelamento (até 24h por
  nossa conta)". A página `/cancelamento` ganha o parágrafo do cancelamento com a regra do
  excedente pago no estacionamento, sem asterisco (ADR-009: o bloco só renderiza pela capacidade
  da unidade).

## Erros e limites

- Acionar duas vezes, fora do prazo, sem o benefício ou sem número de voo: a RPC recusa com a
  mensagem de hoje; a UI já esconde o botão nesses casos.
- Capacidade cheia nos dias cobertos: a RPC recusa como hoje ("sem vaga para estender"). O
  cliente vê a recusa e o caminho de contato; a Movepark não promete o que a unidade não tem.
- Saída real antes da saída coberta: excedente zero; o crédito ao parceiro continua o das 24h,
  porque a capacidade foi segurada.
- Saída real sem registro (Operator concluiu sem o passo): o check-out registra `actual_check_out_at
  = now()` e excedente calculado por ele; o Manager pode corrigir o valor cobrado.

## Dados

Migration nova sobre `booking_fare_extension`: `kind text check in ('delay','cancellation')
default 'delay'`, `requested_check_out_at`, `overage_daily_cents`, `overage_cents`,
`actual_check_out_at`, `overage_charged_cents`, `overage_note`, `overage_recorded_by`,
`overage_recorded_at`. RPC `extend_booking_flight_delay` ganha `p_kind` e `p_requested_check_out_at`,
calcula a saída coberta e o snapshot do preço. RPC nova `operator_record_flight_checkout(booking,
actual_at, charged_cents, note)` (escopo `bookings:write` da empresa, ou hub_admin) grava a saída
real, o excedente e conclui a reserva. Vista/consulta para o relatório mensal.

## Código

- Edge `extend-booking`: aceita `kind` e `requested_check_out_at`, escolhe o template pelo
  excedente, manda o e-mail da unidade.
- Front cliente: `FlightDelayDialog` vira `FlightProtectionDialog` (motivo, voo, nova saída, frase
  do excedente com o preço). Reserva mostra o estado da proteção.
- Operator: aviso na lista e na reserva; `BookingDetailView` ganha o passo de check-out com hora
  real e registro do cobrado (`FlightCheckoutDialog`).
- Manager: card "Proteção de voo" com os três números; relatório mensal na tela de tarifas.
- E-mails: `tplFlightProtectionUnit`, `tplBookingExtended` com excedente. Template
  `movepark_saida_estendida_excedente` na Meta e segredo `WHATSAPP_BOOKING_EXTENDED_OVERAGE_TEMPLATE`.
- Copy: `fares.ts` (rótulo), `fareMatrix.logic.ts` (tooltip), `content/pages.ts` (/cancelamento).

## Testes

- pgTAP: saída coberta e excedente (pedida dentro e fora das 24h), snapshot do preço, recusa de
  segundo acionamento, `operator_record_flight_checkout` (escopo, excedente por dia arredondado,
  "não cobrado" com motivo, reserva concluída).
- Deno: `extend-booking/logic` (escolha do template, corpo do e-mail da unidade); `email.test`.
- Vitest: lógica do diálogo (frase do excedente), lógica do check-out (cálculo de dias e valor),
  matriz e tooltips, contratos de mutation.

## Fora de escopo

- Cancelar a reserva antes de sair de casa por voo cancelado (janela de cancelamento não muda).
- Conferir o cancelamento numa API de voos (o número do voo fica gravado para auditoria futura).
- Cobrar o excedente pelo Hub (decisão: balcão).
