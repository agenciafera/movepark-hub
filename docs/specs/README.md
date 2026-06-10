# Movepark Hub — Specs

Documentação técnica de referência para o design do Movepark Hub.
Baseada em análise dos projetos legados `movepark-backoffice-v4` e `movepark-nextjs`.

## Índice

| Arquivo | Conteúdo |
|---|---|
| [domain-model.md](./domain-model.md) | Mapeamento de domínio: legado → Hub, glossário, entidades principais |
| [pricing-engine.md](./pricing-engine.md) | Motor de cálculo de preço dinâmico: padrões identificados, modelo de banco, regras transversais |
| [capacity-rules.md](./capacity-rules.md) | Regras de capacidade e controle de disponibilidade por data |
| [database-schema.md](./database-schema.md) | Visão geral do schema atual, decisões de modelagem, migrations existentes |
| [booking-flow.md](./booking-flow.md) | Ciclo de vida da reserva: state machine, sequência de checkout, expiração, cancelamento |
| [coupon-rules.md](./coupon-rules.md) | Motor de Cupons & Descontos — **pilar cupom** (código): validação, ciclo de uso, RPCs, RLS, UI, testes |
| [discount-rules.md](./discount-rules.md) | Motor de Cupons & Descontos — **pilar desconto automático** (regra sem código no `simulate_price`, alimenta `old_price`): modelo, avaliação, empilhamento com cupom, UI, testes |
| [voucher-qrcode.md](./voucher-qrcode.md) | Geração de voucher PDF, check-in por QR code, notificações |
| [partner-onboarding.md](./partner-onboarding.md) | Onboarding de parceiro em 2 etapas: captura de lead → aprovação manual → wizard de setup |
| [destinations.md](./destinations.md) | Destinos (aeroportos/etc): catálogo de busca + páginas de conteúdo SEO `/destinos/<slug>` + CRUD no Manager |

## Status

| Spec | Status |
|---|---|
| domain-model | ✅ Definido |
| pricing-engine | ✅ Analisado — migration aplicada (`20260526100000`) |
| capacity-rules | ✅ Analisado — migration aplicada (`20260526100001`) |
| database-schema | ✅ Schema base + extensões aplicadas (`20260526100002`) |
| booking-flow | ✅ Definido |
| coupon-rules | ✅ Implementado (Fase 1 + Fase 2) — migration `20260611000000`, RPCs `operator_*_coupon`/`coupon_evaluate`/`validate_coupon` + trigger de incremento, painel `/operator/coupons`, cupom no listing + desconto no checkout, pgTAP `coupon_rpc.test.sql`. Ver [coupon-rules.md](./coupon-rules.md) |
| discount-rules | ✅ Implementado (Fase 1 + Fase 2) — migration `20260612000000`, `discount_evaluate` (best-pick) + RPCs `operator_*_discount`, `simulate_price`/`create_booking_atomic` aplicam o desconto + snapshot `booking_discount`, empilha cupom (`allow_coupon_stack`), aba Descontos em `/operator/coupons` ("Promoções"), selo no listing, pgTAP `discount_rpc.test.sql`. Ver [discount-rules.md](./discount-rules.md) |
| voucher-qrcode | ✅ Definido |
| partner-onboarding | ✅ Implementado — migrations `20260603120000`–`20260603120400`, edge functions `submit-partner-lead`/`approve-partner`, UI Stage 1/Manager/Stage 2 |
| destinations | ✅ Implementado — migration `20260609120000`, página SSG `/destinos/<slug>`, CRUD `/manager/destinations`, menu "Destinos" no header |
| operator add-ons | ✅ Implementado — migration `20260610000000`, RPCs `operator_upsert_addon`/`operator_set_location_addon`/`operator_delete_addon`, CRUD `/operator/addons` (ver [operator-panel.md](./operator-panel.md) §4.5) |

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
| `20260603120000_add_onboarding_status_and_company_onboarding.sql` | Enum `onboarding_status`, colunas `company.onboarding_status`/`logo_url`, `location.photos`, tabela `company_onboarding` |
| `20260603120100_onboarding_rls.sql` | RLS de `company_onboarding` + defesa em profundidade no `catalog_read_company` |
| `20260603120200_onboarding_rpcs.sql` | RPCs `submit_partner_lead` + writes do wizard + `onboarding_submit` (go-live) |
| `20260603120300_partner_assets_storage.sql` | Bucket `partner-assets` + policies de escrita por empresa |
| `20260603120400_onboarding_harden.sql` | Hardening: `search_path`, revogação de PUBLIC nas RPCs, listing do bucket |
| `20260603130000_app_setting.sql` | Configurações globais (key/value) editáveis pelo hub_admin — remetente/caixa de e-mail dos parceiros |
| `20260609120000_destination_seo.sql` | `destination`: colunas SEO/conteúdo (`slug` único + backfill, `meta_title`/`meta_description`, `intro`, `hero_image_url`, `is_published`), índice e trigger de slug |
| `20260610000000_add_on_management.sql` | Serviços adicionais geridos pelo operator: coluna `add_on_service.sort_order` + índice; RPCs `SECURITY DEFINER` `operator_upsert_addon`/`operator_set_location_addon`/`operator_delete_addon` + guard `addon_assert_company_access` |
| `20260611000000_coupon_engine.sql` | Motor de cupons (Fase 1+2): colunas `coupon.sort_order`/`description`/`per_user_limit`/`min_amount`/`min_days`, tabela `coupon_parking_type`; `coupon_evaluate`, RPCs `operator_upsert_coupon`/`operator_set_coupon_active`/`operator_delete_coupon`, `validate_coupon`, guard `coupon_assert_company_access`, trigger `payment_bump_coupon` (incrementa `times_used`); refactor de `create_booking_atomic` p/ usar `coupon_evaluate` |
| `20260612000000_discount_engine.sql` | Motor de descontos automáticos (Fase 1+2): tabelas `discount_rule`/`discount_rule_parking_type`/`booking_discount`, `discount_evaluate` (best-pick + janela/`min_days`/`min_amount`/`advance_days`/tipo de vaga), RPCs `operator_upsert_discount`/`operator_set_discount_active`/`operator_delete_discount`, guard `discount_assert_company_access`; `simulate_price` aplica o desconto (preview, `base_price`/`old_price`/`discount` no retorno) e `create_booking_atomic` re-avalia (autoritativo) + snapshot + empilha cupom |

## Pendências

| Item | Prioridade | Motivo |
|---|---|---|
| ~~**[BUG-001]** Corrigir seed Aerovalet Valet GRU~~ | ~~Alta~~ | ✅ Resolvido — `fix_aerovalet_valet_surcharge_seed` + `fix_aerovalet_valet_surcharge_source` |
| Seed de capacidade real em `location_parking_type.capacity` | Alta | Valores ainda são 0 (placeholder) |
| Decisão sobre modelo de staff/backoffice | Média | Necessário para políticas RLS de escrita |
| Preço dinâmico por janela/dia da semana/feriado | Baixa | Definido como v2, fora do MVP |
