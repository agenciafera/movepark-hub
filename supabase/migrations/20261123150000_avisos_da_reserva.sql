-- Avisos da reserva (23/09/2026). Spec: docs/specs/tarifas-operacao.md (fase 2: 2.1 a 2.4).
--
-- "Avisos por WhatsApp" (Flex e Superflex) era uma mensagem só, sem registro, que falhava calada
-- quando o template não existia na Meta. Agora todo aviso passa por `notify.ts`: WhatsApp para
-- quem tem o benefício e template configurado; senão (ou em falha) e-mail. Cada envio fica em
-- `notification_log`, com chave de idempotência, e o cron `booking-reminders` manda o lembrete
-- de entrada (24h antes) e de retirada (2h antes).

create table if not exists public.notification_log (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.booking(id) on delete cascade,
  event        text not null,
  channel      text not null check (channel in ('whatsapp', 'email')),
  destination  text,
  status       text not null check (status in ('sent', 'failed', 'skipped')),
  external_id  text,
  error        text,
  created_at   timestamptz not null default now(),
  unique (booking_id, event, channel)
);
comment on table public.notification_log is
  'Um registro por aviso enviado (ou tentado) ao cliente, por reserva, evento e canal. Idempotência dos avisos.';
create index if not exists notification_log_booking_idx on public.notification_log (booking_id);
alter table public.notification_log enable row level security;
drop policy if exists notification_log_admin_read on public.notification_log;
create policy notification_log_admin_read on public.notification_log
  for select to authenticated using (public.is_hub_admin());
revoke all on table public.notification_log from anon;

-- ── cron dos lembretes ──────────────────────────────────────────────────────
select vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'booking_reminders_key', 'Chave do cron booking-reminders')
 where not exists (select 1 from vault.secrets where name = 'booking_reminders_key');

create or replace function public.booking_reminders_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'booking_reminders_key' limit 1;
$$;
revoke all on function public.booking_reminders_expected_key() from public, anon, authenticated;
grant execute on function public.booking_reminders_expected_key() to service_role;

select cron.unschedule('booking-reminders') where exists (select 1 from cron.job where jobname = 'booking-reminders');
select cron.schedule(
  'booking-reminders',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/booking-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-booking-reminders-key', (select decrypted_secret from vault.decrypted_secrets where name = 'booking_reminders_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
