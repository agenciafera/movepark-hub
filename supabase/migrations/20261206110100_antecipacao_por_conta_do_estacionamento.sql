-- Antecipação por conta do estacionamento, em todos (23/11/2026). Spec: docs/specs/antecipacao-do-parceiro.md
--
-- Decisão do Kallef em 23/11/2026: o cartão do estacionamento entra inteiro em 30 dias (nunca
-- parcela a parcela, mês a mês) e a taxa de antecipação fica por conta do estacionamento, em todos.
-- Até aqui o padrão do Hub era a Movepark pagar, cedendo a estimativa no split.
--
-- 1) Quem paga: o padrão do Hub passa a ser o estacionamento. Empresa e regra de origem continuam
--    podendo sobrescrever (`company.anticipation_fee_payer`, `commission_rule.anticipation_fee_payer`);
--    em 23/11 nenhuma sobrescrevia. Reserva já criada segue com o pagador congelado nela.
-- 2) Recebedor novo nasce com a antecipação ligada, no mesmo modelo dos que já existem (gate G2:
--    tipo 1025, 100%, 29 dias, todos os dias). Antes nascia desligado e recebia parcela a parcela.
-- A taxa de antecipação em si não entra aqui (repo público): fica em
-- app_setting.card_anticipation_rate_monthly_bps, gravada direto no banco.

insert into public.app_setting(key, value) values
  ('commission_default_anticipation_payer', 'partner'),
  ('payout_anticipation_enabled', 'true'),
  ('payout_anticipation_type', '1025'),
  ('payout_anticipation_volume_percentage', '100'),
  ('payout_anticipation_delay', '29'),
  ('payout_anticipation_days', '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31')
on conflict (key) do update set value = excluded.value, updated_at = now();
