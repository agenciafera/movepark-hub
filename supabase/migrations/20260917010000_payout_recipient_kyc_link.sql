-- E1.3 · Prova de vida (KYC) do recebedor: validade do link e controle do e-mail.
--
-- O link de prova de vida do gateway expira em 20 MINUTOS. Medido em produção em 30/07/2026 no
-- recebedor re_cms7wc1eievek0l9tfxnb8wz2: emitido 20:26:41Z, expires_at 20:46:41Z. Sem guardar a
-- validade não dá para mostrar contador ao parceiro, não dá para saber quando reemitir, e o cron
-- de 15 minutos queima um link novo a cada volta mesmo com um link vivo na linha.
--
-- Conserta também o CHECK de payout_recipient_event.kind, que nunca aceitou 'update' (inserido por
-- update-recipient-payout desde a E0.3.3) nem 'kyc_link'. Como esse insert roda em background, a
-- violação sumia sem derrubar a resposta e o evento simplesmente não era gravado.
--
-- Ver docs/specs/payment-split.md (§ Prova de vida).

alter table public.payout_recipient
  add column if not exists kyc_url_expires_at timestamptz;

alter table public.payout_recipient
  add column if not exists kyc_link_email_sent_at timestamptz;

comment on column public.payout_recipient.kyc_url_expires_at is
  'Validade do kyc_url no gateway (20 min no Pagar.me). Null quando não há link vigente. Gravada sempre na mesma escrita que o kyc_url.';

comment on column public.payout_recipient.kyc_link_email_sent_at is
  'Quando o e-mail desta emissão de link foi enviado. Zerado a cada link novo, o que garante um e-mail por emissão e não por poll.';

-- O CHECK inline nasceu com 3 valores; descobre o nome real antes de trocar.
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.payout_recipient_event'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%kind%';
  if c is not null then
    execute format('alter table public.payout_recipient_event drop constraint %I', c);
  end if;
end $$;

do $$ begin
  alter table public.payout_recipient_event
    add constraint payout_recipient_event_kind_check
    check (kind in ('create', 'refresh', 'webhook', 'update', 'kyc_link'));
exception when duplicate_object then null;
end $$;
