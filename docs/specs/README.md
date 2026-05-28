# Move Park Hub — Specs

Documentação técnica de referência para o design do Move Park Hub.
Baseada em análise dos projetos legados `movepark-backoffice-v4` e `movepark-nextjs`.

## Índice

| Arquivo | Conteúdo |
|---|---|
| [domain-model.md](./domain-model.md) | Mapeamento de domínio: legado → Hub, glossário, entidades principais |
| [pricing-engine.md](./pricing-engine.md) | Motor de cálculo de preço dinâmico: padrões identificados, modelo de banco, regras transversais |
| [capacity-rules.md](./capacity-rules.md) | Regras de capacidade e controle de disponibilidade por data |
| [database-schema.md](./database-schema.md) | Visão geral do schema atual, decisões de modelagem, migrations existentes |
| [booking-flow.md](./booking-flow.md) | Ciclo de vida da reserva: state machine, sequência de checkout, expiração, cancelamento |
| [coupon-rules.md](./coupon-rules.md) | Algoritmo de validação de cupons, cálculo de desconto, regras de incremento |
| [voucher-qrcode.md](./voucher-qrcode.md) | Geração de voucher PDF, check-in por QR code, notificações |

## Status

| Spec | Status |
|---|---|
| domain-model | ✅ Definido |
| pricing-engine | ✅ Analisado — migration aplicada (`20260526100000`) |
| capacity-rules | ✅ Analisado — migration aplicada (`20260526100001`) |
| database-schema | ✅ Schema base + extensões aplicadas (`20260526100002`) |
| booking-flow | ✅ Definido |
| coupon-rules | ✅ Definido |
| voucher-qrcode | ✅ Definido |

## Migrations

| Arquivo | Conteúdo |
|---|---|
| `20260525142111_init_movepark_hub_schema.sql` | Schema base completo |
| `20260525142247_harden_security_definer_functions.sql` | Hardening da função `handle_new_auth_user` |
| `20260525143531_seed_parking_type_catalog.sql` | Seed: catálogo de tipos de vaga |
| `20260525155000_seed_companies_locations.sql` | Seed: empresas, unidades, pivots de vaga |
| `20260526100000_add_pricing_engine.sql` | Motor de preço: `pricing_rule`, `pricing_tier`, `pricing_hourly_bracket` |
| `20260526100001_add_capacity_rules.sql` | Disponibilidade por data + colunas de config em `location` e `location_parking_type` |
| `20260526100002_extend_booking_schema.sql` | Colunas faltantes em `booking` (expires_at, UTM, voucher, check-in real) |
| `20260526100003_seed_pricing_rules.sql` | Seed: 17 `pricing_rule` + tiers para todas as empresas do seed inicial |

## Pendências

| Item | Prioridade | Motivo |
|---|---|---|
| ~~**[BUG-001]** Corrigir seed Aerovalet Valet GRU~~ | ~~Alta~~ | ✅ Resolvido — `fix_aerovalet_valet_surcharge_seed` + `fix_aerovalet_valet_surcharge_source` |
| Seed de capacidade real em `location_parking_type.capacity` | Alta | Valores ainda são 0 (placeholder) |
| Decisão sobre modelo de staff/backoffice | Média | Necessário para políticas RLS de escrita |
| Preço dinâmico por janela/dia da semana/feriado | Baixa | Definido como v2, fora do MVP |
