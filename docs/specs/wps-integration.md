# Integração WPS / sistemas de pátio (E2.6.1)

Contrato de webhook **versionado e idempotente** entre o Hub e o sistema de pátio do parceiro
(WPS / cancela / ANPR), nos dois sentidos. Fecha o ciclo da reserva (check-in/check-out reais) e
mantém o pátio em sincronia. Entregue como **rota do Public API** (auth por api_key + escopo).

## Inbound — pátio → Hub (`POST /v1/wps/events`, escopo `wps:write`)

O WPS avisa a entrada/saída do veículo; o Hub faz a transição real da reserva.

**Payload (versionado):**
```json
{
  "version": "1",
  "event_id": "evt_abc123",                // idempotência por (empresa, event_id)
  "type": "vehicle.entered" | "vehicle.exited",
  "occurred_at": "2026-06-29T10:00:00Z",   // opcional
  "location_ref": "lote-01",               // location.external_ref (opcional)
  "plate": "ABC1D23",                       // ANPR (ou booking_code)
  "booking_code": "MP-ABCD"                 // alternativa à placa (preferencial, sem ambiguidade)
}
```

**Resolução da reserva:** por `booking_code` (escopo da empresa) ou por **placa normalizada**
(`upper`, sem separadores) + lote (`external_ref`) + janela `[check_in−12h, check_out+12h]` + status
compatível. **Transições:** `vehicle.entered` exige `confirmed` → `checked_in` (+`checked_in_at`);
`vehicle.exited` exige `checked_in` → `completed` (+`checked_out_at`). Status incompatível → não
transiciona (mensagem no retorno). Implementado na RPC `api_wps_event` (SECURITY DEFINER); log/auditoria
+ idempotência na tabela `wps_event` (unique `(company_id, external_event_id)` → replay = `duplicate:true`).

**Resposta:** `{ matched, booking_code, status, duplicate, message }`.

> `no_show` continua sendo do cron (quem não dá check-in até o check_out). O inbound só **alimenta** o
> check-in/out — não marca no_show.

## Outbound — Hub → pátio (webhook do parceiro, assinado HMAC)

Quando uma reserva vira `confirmed` ou `cancelled`, um **trigger** (`wps_enqueue_booking_event`)
enfileira na outbox `wps_delivery` (só se `company.wps_webhook_enabled`). A Edge **`wps-deliver`**
(agendada por pg_cron a cada minuto via pg_net) entrega com **retry/backoff** e assinatura.

**POST no `company.wps_webhook_url`:**
- Headers: `X-Movepark-Event: booking.confirmed|booking.cancelled`, `X-Movepark-Event-Id: <uuid>`,
  `X-Movepark-Signature: sha256=<hmac>` (HMAC-SHA256 do corpo com `company.wps_webhook_secret`).
- Body: `{ version:"1", type, occurred_at, data:{ booking_code, status, plate, location_ref, check_in_at, check_out_at } }`.
- 2xx → `delivered`; senão retry com backoff exponencial (2min, dobrando, teto 4h) até `max_attempts` (6) → `failed`.
- O receptor deve **deduplicar por `X-Movepark-Event-Id`** (idempotência).

## Configuração (Manager → Empresas / Localizações)

- Empresa: `wps_webhook_url`, `wps_webhook_secret` (write-only, mascarado), `wps_webhook_enabled`
  (CHECK: só liga com url+secret). Só hub_admin.
- Lote: `location.external_ref` (código no WPS) — edição da localização, Manager only.
- Chave da Edge de entrega: secret `WPS_DELIVER_KEY` (+ Vault `wps_deliver_key` lido pelo cron).

## Segurança / notas
- Inbound autentica por **api_key da empresa** + escopo `wps:write` (resolve company server-side).
- Segredo HMAC fica **no banco** (não no front; campo write-only no Manager).
- Idempotência dos dois lados: inbound por `event_id`; outbound por `event_id` (no receptor) + retry até entregar.
- **Fora de escopo:** múltiplos endpoints WPS por empresa (MVP = 1 URL); decisão de check-in
  manual vs ANPR fica a critério do parceiro (ambos os caminhos existem).
