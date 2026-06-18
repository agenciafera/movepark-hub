-- E0.1.3 — Cartão de crédito com split + parcelamento. Coluna de parcelas no payment e a POLÍTICA
-- de parcelamento como config dinâmica (JSON em app_setting), editável no Manager (hub_admin) sem
-- code change. A cobrança real e o valor financiado são server-authoritative (Edge create-card-charge);
-- o front só exibe opções. Ver docs/specs/payment-split.md.

alter table public.payment
  add column if not exists installments int;

comment on column public.payment.installments is
  'Número de parcelas do cartão (1 = à vista; null para PIX/mock).';

-- Política de parcelamento (default conservador: 0% juros, grátis até 3x, teto 12x).
-- O hub_admin ajusta em Manager → Configurações → Pagamentos.
insert into public.app_setting (key, value)
  values (
    'card_installment_policy',
    '{"version":1,"enabled":true,"maxInstallments":12,"interestFreeUpTo":3,"monthlyInterestPct":0,"minInstallmentCents":500,"absorb":"customer"}'
  )
  on conflict (key) do nothing;
