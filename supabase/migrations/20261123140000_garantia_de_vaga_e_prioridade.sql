-- Garantia de vaga acionada e suporte prioritário (23/09/2026).
-- Specs: docs/specs/spot-guarantee.md, docs/specs/tarifas-operacao.md (fase 3, Q-028).
--
-- 1. A garantia "ou cobrimos a diferença" era só copy: o botão mandava o cliente ao WhatsApp do
--    estacionamento que falhou, e a Movepark nunca ficava sabendo. Agora o acionamento fica
--    registrado (`guarantee_claim`) pelo próprio cliente, o WhatsApp vai para a Movepark, e o
--    Manager fecha com o desfecho (realocado, devolvido, descartado) e o valor coberto.
-- 2. "Suporte prioritário" da Superflex era só um rótulo. A prioridade é DERIVADA, nunca gravada:
--    a caixa de entrada pergunta pelo telefone se há reserva ativa com o benefício e devolve o
--    SLA (`priority_support_sla_minutes`, 15 min em horário estendido).

insert into public.app_setting (key, value) values ('priority_support_sla_minutes', '15')
on conflict (key) do nothing;

-- ── suporte prioritário: prioridade por telefone ─────────────────────────────
create or replace function public.booking_priority_for_phones(p_phones text[])
  returns jsonb
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  with sla as (
    select coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'priority_support_sla_minutes'), 15) as minutos
  ),
  alvo as (
    select distinct regexp_replace(p, '\D', '', 'g') as digits from unnest(coalesce(p_phones, '{}')) p
     where regexp_replace(p, '\D', '', 'g') <> ''
  ),
  reservas as (
    select b.code, b.fare_tier, b.check_out_at,
           regexp_replace(coalesce(b.customer_phone, ''), '\D', '', 'g') as d1,
           regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') as d2
      from public.booking b
      left join auth.users u on u.id = b.profile_id
     where b.deleted_at is null
       and b.status in ('confirmed', 'checked_in')
       and b.check_out_at >= now() - interval '1 day'
       and coalesce((b.fare_benefits ->> 'priority_support')::boolean, false)
  ),
  casadas as (
    select distinct on (a.digits) a.digits, r.code, r.fare_tier
      from alvo a
      join reservas r on r.d1 = a.digits or r.d2 = a.digits
     order by a.digits, r.check_out_at desc
  )
  select coalesce(jsonb_object_agg(c.digits, jsonb_build_object(
           'tier', c.fare_tier, 'reserva', c.code, 'sla_minutos', (select minutos from sla))), '{}'::jsonb)
    from casadas c;
$$;
revoke all on function public.booking_priority_for_phones(text[]) from public, anon, authenticated;
grant execute on function public.booking_priority_for_phones(text[]) to service_role;

-- ── garantia de vaga ────────────────────────────────────────────────────────
create table if not exists public.guarantee_claim (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.booking(id) on delete cascade,
  opened_by      uuid,
  opened_at      timestamptz not null default now(),
  channel        text not null default 'app' check (channel in ('app', 'whatsapp', 'email', 'staff')),
  status         text not null default 'open' check (status in ('open', 'relocated', 'refunded', 'dismissed')),
  covered_cents  integer not null default 0 check (covered_cents >= 0),
  note           text,
  resolved_by    uuid,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.guarantee_claim is
  'Acionamentos da garantia de vaga ("vaga garantida ou cobrimos a diferença"). O cliente abre pela reserva; a Movepark fecha com o desfecho e o valor coberto.';
create index if not exists guarantee_claim_booking_idx on public.guarantee_claim (booking_id);
create index if not exists guarantee_claim_open_idx on public.guarantee_claim (opened_at desc) where status = 'open';
drop trigger if exists guarantee_claim_set_updated_at on public.guarantee_claim;
create trigger guarantee_claim_set_updated_at before update on public.guarantee_claim
  for each row execute function public.set_updated_at();

alter table public.guarantee_claim enable row level security;
drop policy if exists guarantee_claim_admin_all on public.guarantee_claim;
create policy guarantee_claim_admin_all on public.guarantee_claim
  for all to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
drop policy if exists guarantee_claim_owner_read on public.guarantee_claim;
create policy guarantee_claim_owner_read on public.guarantee_claim
  for select to authenticated
  using (exists (select 1 from public.booking b where b.id = booking_id and b.profile_id = auth.uid()));
revoke all on table public.guarantee_claim from anon;

-- O cliente aciona pela reserva dele: confirmada ou em uso, de 2h antes da entrada em diante, uma
-- vez enquanto houver acionamento aberto. Devolve o registro para a tela abrir o WhatsApp.
create or replace function public.claim_spot_guarantee(p_booking_code text)
  returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare v_b record; v_id uuid; v_at timestamptz;
begin
  select b.id, b.status, b.check_in_at, b.profile_id into v_b
    from public.booking b where b.code = p_booking_code and b.deleted_at is null;
  if v_b.id is null or v_b.profile_id is distinct from auth.uid() then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;
  if v_b.status not in ('confirmed', 'checked_in') then
    raise exception 'A garantia vale para reserva confirmada ou em uso.' using errcode = 'P0001';
  end if;
  if now() < v_b.check_in_at - interval '2 hours' then
    raise exception 'A garantia é acionada na chegada: a partir de 2 horas antes do check-in.' using errcode = 'P0001';
  end if;
  select id, opened_at into v_id, v_at from public.guarantee_claim
   where booking_id = v_b.id and status = 'open' order by opened_at desc limit 1;
  if v_id is null then
    insert into public.guarantee_claim (booking_id, opened_by, channel)
    values (v_b.id, auth.uid(), 'app') returning id, opened_at into v_id, v_at;
  end if;
  return jsonb_build_object('id', v_id, 'opened_at', v_at);
end $$;
revoke all on function public.claim_spot_guarantee(text) from public, anon;
grant execute on function public.claim_spot_guarantee(text) to authenticated;

create or replace function public.admin_resolve_guarantee_claim(
  p_id uuid, p_status text, p_covered_cents integer default 0, p_note text default null
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark fecha um acionamento de garantia.' using errcode = '42501';
  end if;
  if p_status not in ('relocated', 'refunded', 'dismissed') then
    raise exception 'Desfecho inválido.' using errcode = '22023';
  end if;
  update public.guarantee_claim
     set status = p_status, covered_cents = greatest(0, coalesce(p_covered_cents, 0)),
         note = nullif(trim(coalesce(p_note, '')), ''), resolved_by = auth.uid(), resolved_at = now()
   where id = p_id and status = 'open';
  if not found then
    raise exception 'Acionamento não encontrado ou já fechado.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_id, 'status', p_status);
end $$;
revoke all on function public.admin_resolve_guarantee_claim(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_resolve_guarantee_claim(uuid, text, integer, text) to authenticated;
