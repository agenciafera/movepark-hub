-- Chamado de atendimento na reserva + suporte prioritário fora do catálogo (25/09/2026).
-- Ver docs/specs/chamado-de-atendimento.md e docs/specs/tarifas-operacao.md.
--
-- 1. O benefício "suporte prioritário" sai da Superflex por ora (sem demanda fora do horário
--    comercial para sustentar um SLA de 15 min). Reserva já vendida com o benefício congelado
--    em `booking.fare_benefits` continua valendo: o que se vendeu se honra.
-- 2. O cliente abre um chamado (reclamação, dúvida ou outro) de dentro da reserva. O Hub grava
--    aqui, avisa a equipe por e-mail e pede ao beast-bots para abrir a conversa do cliente já
--    marcada como chamado (o agente fica mudo). O atendimento é em horário comercial.

update public.fare set benefits = coalesce(benefits, '{}'::jsonb) || '{"priority_support": false}'::jsonb;

insert into public.app_setting (key, value) values ('support_inbox', 'contato@movepark.co')
on conflict (key) do nothing;

-- Código curto e legível do chamado (CH-XXXXXX), sem 0/O/1/I para ditar por telefone.
create or replace function public.support_ticket_code()
returns text language sql volatile as $$
  select 'CH-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
    from generate_series(1, 6);
$$;
revoke all on function public.support_ticket_code() from public, anon;

create table if not exists public.support_ticket (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default public.support_ticket_code(),
  booking_id    uuid not null references public.booking(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('complaint', 'question', 'other')),
  message       text not null check (length(message) between 10 and 2000),
  status        text not null default 'open' check (status in ('open', 'closed')),
  phone         text,
  email         text,
  thread_id     text,
  whatsapp_sent boolean not null default false,
  notified_at   timestamptz,
  closed_at     timestamptz,
  closed_by     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists support_ticket_booking on public.support_ticket (booking_id);
create index if not exists support_ticket_open on public.support_ticket (created_at desc) where status = 'open';
drop trigger if exists support_ticket_set_updated_at on public.support_ticket;
create trigger support_ticket_set_updated_at before update on public.support_ticket
  for each row execute function public.set_updated_at();

alter table public.support_ticket enable row level security;
drop policy if exists support_ticket_owner_read on public.support_ticket;
create policy support_ticket_owner_read on public.support_ticket
  for select to authenticated using (profile_id = auth.uid());
drop policy if exists support_ticket_admin_all on public.support_ticket;
create policy support_ticket_admin_all on public.support_ticket
  for all to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
revoke all on table public.support_ticket from anon;
-- A abertura é pela Edge open-support-ticket (service_role): valida a reserva, avisa e abre a conversa.

-- A equipe encerra quando o assunto termina. Encerrar não devolve a conversa ao agente: isso é
-- feito em Conversas, de propósito, porque o humano decide quando o robô volta.
create or replace function public.admin_close_support_ticket(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Só a equipe Movepark encerra chamado.' using errcode = '42501';
  end if;
  update public.support_ticket
     set status = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_id and status = 'open';
end;
$$;
revoke all on function public.admin_close_support_ticket(uuid) from public, anon;
grant execute on function public.admin_close_support_ticket(uuid) to authenticated, service_role;

-- Quantos chamados abertos: o Manager mostra no menu. hub_admin só.
create or replace function public.open_support_ticket_count()
returns integer language sql stable security definer set search_path to 'public' as $$
  select case when public.is_hub_admin() then (select count(*)::int from public.support_ticket where status = 'open') else 0 end;
$$;
revoke all on function public.open_support_ticket_count() from public, anon;
grant execute on function public.open_support_ticket_count() to authenticated;
