-- E2.8 · Histórico de alterações da reserva (auditoria unificada). Registra cancelamento, troca de
-- data/veículo, upgrade de Tarifa e estorno: quem fez, quando, de->para e o delta financeiro. Base
-- para o suporte e pré-requisito da feature de alterar datas de reserva PAGA (cobrar/estornar delta).
-- A extensão por atraso de voo tem tabela própria (booking_fare_extension) e não duplica aqui.

create type public.booking_modification_type as enum (
  'cancel', 'date_change', 'vehicle_change', 'fare_upgrade', 'refund'
);

create table public.booking_modification (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.booking(id) on delete cascade,
  type               public.booking_modification_type not null,
  -- quem fez: auth.users id (null = sistema/cron/webhook)
  actor_id           uuid,
  actor_role         text not null default 'system' check (actor_role in ('customer', 'staff', 'system')),
  -- de->para livre por tipo (ex.: { from: {...}, to: {...} })
  changes            jsonb,
  -- delta financeiro: + cobrado do cliente / - estornado; null quando não há dinheiro envolvido
  amount_delta_cents integer,
  reason             text,
  created_at         timestamptz not null default now()
);
create index booking_modification_booking_idx on public.booking_modification (booking_id, created_at desc);

alter table public.booking_modification enable row level security;
-- Dono lê o histórico da própria reserva; hub_admin e operador da empresa (via location) também.
-- Escrita só service_role (pelas Edges/RPCs via log_booking_modification).
create policy booking_modification_select on public.booking_modification for select to authenticated
  using (
    public.is_hub_admin()
    or exists (select 1 from public.booking b where b.id = booking_id and b.profile_id = auth.uid())
    or exists (
      select 1
      from public.booking b
      join public.location l on l.id = b.location_id
      join public.profile_company pc on pc.company_id = l.company_id
      where b.id = booking_id and pc.profile_id = auth.uid()
    )
  );

-- Escrita centralizada do histórico (chamada pelas Edges com service_role e por RPCs security
-- definer). Mantém o insert num único ponto testável.
create or replace function public.log_booking_modification(
  p_booking_id uuid,
  p_type public.booking_modification_type,
  p_actor_id uuid default null,
  p_actor_role text default 'system',
  p_changes jsonb default null,
  p_amount_delta_cents integer default null,
  p_reason text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_id uuid;
begin
  insert into public.booking_modification
    (booking_id, type, actor_id, actor_role, changes, amount_delta_cents, reason)
  values
    (p_booking_id, p_type, p_actor_id, coalesce(p_actor_role, 'system'), p_changes,
     p_amount_delta_cents, p_reason)
  returning id into v_id;
  return v_id;
end; $fn$;

-- SECURITY DEFINER + exposta no schema public → o `revoke from public` NÃO tira o grant que o
-- Supabase dá por padrão a anon/authenticated (advisor 0028/0029). Revoga explicitamente dos dois,
-- senão qualquer um insere histórico falso via /rest/v1/rpc (a função bypassa RLS).
revoke all on function public.log_booking_modification(
  uuid, public.booking_modification_type, uuid, text, jsonb, integer, text
) from public, anon, authenticated;
grant execute on function public.log_booking_modification(
  uuid, public.booking_modification_type, uuid, text, jsonb, integer, text
) to service_role;
