-- Trava de cobrança por reserva (19/10/2026, depois da MP-07DAE9).
--
-- Em 17/10 um cliente foi cobrado duas vezes no cartão (R$ 219,70 cada): dois cliques com 3 s de
-- intervalo viraram duas chamadas à Edge `create-card-charge`, e a guarda dela ("já existe
-- pagamento aprovado?") é consulta seguida de cobrança. As duas consultas viram zero e as duas
-- cobraram. A trava fecha a corrida no banco: só uma cobrança por reserva fica em andamento.
--
-- Como funciona: a Edge reivindica a trava antes de conferir pagamento e cobrar, e solta no fim.
-- O `insert ... on conflict ... where locked_until < now()` é atômico: com duas chamadas ao mesmo
-- tempo, a segunda espera a primeira gravar e não leva a trava. O prazo cobre a Edge que morre
-- sem soltar (o runtime derruba a invocação em 150 s). O token impede que uma chamada atrasada
-- solte a trava de outra.
--
-- Uso só do servidor (service role). PIX e cartão usam a mesma trava, então também não sai PIX
-- novo enquanto um cartão está sendo cobrado.

create table if not exists public.payment_charge_lock (
  booking_id uuid primary key references public.booking(id) on delete cascade,
  token uuid not null,
  locked_until timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.payment_charge_lock is
  'Trava de cobrança por reserva (uma cobrança em andamento por vez). Só service role. Ver 20261130100000.';

alter table public.payment_charge_lock enable row level security;
revoke all on table public.payment_charge_lock from public, anon, authenticated;

create or replace function public.payment_charge_lock_claim(p_booking_id uuid, p_ttl_seconds integer default 120)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_got uuid;
begin
  insert into public.payment_charge_lock as l (booking_id, token, locked_until)
  values (p_booking_id, v_token, now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 120), 1)))
  on conflict (booking_id) do update
    set token = excluded.token,
        locked_until = excluded.locked_until,
        created_at = now()
    where l.locked_until < now()
  returning token into v_got;
  return v_got; -- null = já existe cobrança em andamento para esta reserva
end;
$$;

create or replace function public.payment_charge_lock_release(p_booking_id uuid, p_token uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with d as (
    delete from public.payment_charge_lock
     where booking_id = p_booking_id and token = p_token
    returning 1
  )
  select exists (select 1 from d);
$$;

revoke all on function public.payment_charge_lock_claim(uuid, integer) from public, anon, authenticated;
revoke all on function public.payment_charge_lock_release(uuid, uuid) from public, anon, authenticated;
grant execute on function public.payment_charge_lock_claim(uuid, integer) to service_role;
grant execute on function public.payment_charge_lock_release(uuid, uuid) to service_role;
