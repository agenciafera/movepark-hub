-- E0.3.3 · Configuração de repasse por empresa. Hoje a cadência é global (app_setting
-- payout_transfer_*); aqui ela (e a antecipação automática) passa a ser configurável POR EMPRESA
-- em colunas do payout_recipient. NULL = herda o default global. Editável só por hub_admin na área
-- de Recebedores; o valor efetivo (coluna ?? global) é aplicado no recebedor da Pagar.me
-- (transfer-settings / automatic-anticipation-settings). Ver docs/specs/payment-split.md.

alter table public.payout_recipient
  add column if not exists transfer_enabled boolean,
  add column if not exists transfer_interval text
    check (transfer_interval in ('Daily', 'Weekly', 'Monthly')),
  add column if not exists transfer_day integer,
  add column if not exists anticipation_enabled boolean,
  add column if not exists anticipation_type text
    check (anticipation_type in ('full', '1025')),
  add column if not exists anticipation_volume_percentage integer
    check (anticipation_volume_percentage between 0 and 100),
  add column if not exists anticipation_delay integer,
  add column if not exists anticipation_days integer[];

-- Coerência do dia com o intervalo (quando ambos presentes): Daily=0, Weekly=1..5, Monthly=1..31.
do $$ begin
  alter table public.payout_recipient add constraint payout_recipient_transfer_day_ck check (
    transfer_interval is null or transfer_day is null or (
      (transfer_interval = 'Daily'   and transfer_day = 0) or
      (transfer_interval = 'Weekly'  and transfer_day between 1 and 5) or
      (transfer_interval = 'Monthly' and transfer_day between 1 and 31)
    )
  );
exception when duplicate_object then null; end $$;

comment on column public.payout_recipient.transfer_interval is
  'Cadência de repasse desta empresa (Daily/Weekly/Monthly). NULL = herda payout_transfer_interval global.';
comment on column public.payout_recipient.anticipation_enabled is
  'Antecipação automática por empresa. NULL = herda payout_anticipation_* global. Requer liberação Pagar.me.';

-- Defaults globais de antecipação (fallback pra empresa sem config própria). transfer_* já existem.
insert into public.app_setting (key, value) values
  ('payout_anticipation_enabled', 'false'),
  ('payout_anticipation_type', 'full'),
  ('payout_anticipation_volume_percentage', '100'),
  ('payout_anticipation_delay', ''),
  ('payout_anticipation_days', '')
  on conflict (key) do nothing;
