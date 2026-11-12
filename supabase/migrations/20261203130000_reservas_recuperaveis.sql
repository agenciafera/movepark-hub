-- Reservas não concluídas que ainda dá para recuperar (12/11/2026).
--
-- A Pare Seguro (GRU) reclamou de "muitas reservas expiradas". A conta mostrou que boa parte era
-- gente que pagou minutos depois, e que sobravam poucas pessoas para abordar. O parceiro quer
-- ligar para cada uma, e a lista tinha sido montada à mão.
--
-- Esta migration dá ao painel do parceiro (e ao Manager) essa lista, calculada no servidor:
--   * recuperável = `status = 'expired'` E `check_in_at > now()` (booking-flow.md, "Recuperável").
--     É derivado e nunca vira status;
--   * a expiração grava `deleted_at`, e as telas de reserva filtram `deleted_at is null`. Por isso
--     a RPC é SECURITY DEFINER e lê as expiradas apesar do soft delete;
--   * uma linha por pessoa (a tentativa mais recente), com quantas tentativas houve;
--   * sai quem comprou depois: na mesma empresa, casando por conta, e-mail ou telefone (só
--     dígitos); em outra empresa com datas sobrepostas, só pela mesma conta (e-mail e telefone
--     do snapshot são digitados livremente, e casar por eles vazaria compra de outra empresa);
--   * contato do snapshot da reserva; se faltar, do `auth.users` (ADR-006), nunca de `profiles`.
--
-- São dados de quem NÃO comprou, e quem os recebeu foi a Movepark. O acesso é o escopo
-- `bookings:recovery` (ADR-005), interno e fora do alcance de chave de API, dado a Dono e Gerente.
-- Cada exportação fica registrada em `booking_recovery_export` (quem, quando, quantas linhas).
--
-- Idempotente: um `db push` posterior reaplica o arquivo (carimbo local ≠ carimbo do MCP).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Escopo (ADR-005)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.api_scope (scope, module, description, assignable_to_api_key, is_platform_scope)
values (
  'bookings:recovery',
  'bookings',
  'Ver e exportar as reservas não concluídas que ainda dá para recuperar (com contato)',
  false,
  false
)
on conflict (scope) do update set
  module = excluded.module,
  description = excluded.description,
  assignable_to_api_key = excluded.assignable_to_api_key,
  is_platform_scope = excluded.is_platform_scope;

insert into public.company_role_scope (role, scope) values
  ('owner', 'bookings:recovery'),
  ('manager', 'bookings:recovery')
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Registro de exportação (LGPD)
-- ─────────────────────────────────────────────────────────────────────────────
-- `exported_by` sem FK de propósito: o registro tem que sobreviver à exclusão do usuário.
create table if not exists public.booking_recovery_export (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.company(id) on delete cascade,
  exported_by uuid not null,
  row_count   integer not null check (row_count >= 0),
  created_at  timestamptz not null default now()
);

comment on table public.booking_recovery_export is
  'Cada download da lista de reservas recuperáveis: quem, quando e quantas pessoas. Escrita só pela RPC operator_recoverable_bookings.';

create index if not exists booking_recovery_export_company_idx
  on public.booking_recovery_export (company_id, created_at desc);

alter table public.booking_recovery_export enable row level security;

-- Leitura: hub_admin e quem tem o escopo na empresa. Escrita: nenhuma policy, só a RPC.
drop policy if exists booking_recovery_export_select on public.booking_recovery_export;
create policy booking_recovery_export_select on public.booking_recovery_export
  for select to authenticated
  using (public.member_has_scope(company_id, 'bookings:recovery'));

revoke all on public.booking_recovery_export from anon;
revoke insert, update, delete, truncate on public.booking_recovery_export from authenticated;
grant select on public.booking_recovery_export to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Chave de telefone: só dígitos, sem o DDI 55
-- ─────────────────────────────────────────────────────────────────────────────
-- "+55 (11) 99999-9999", "11999999999" e "5511999999999" são a mesma pessoa.
create or replace function public.recovery_phone_key(p_phone text)
returns text language sql immutable set search_path to 'public' as $fn$
  select case
    when d = '' then null
    when d ~ '^55[0-9]{10,11}$' then substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) s;
$fn$;

revoke all on function public.recovery_phone_key(text) from public, anon;
grant execute on function public.recovery_phone_key(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A lista
-- ─────────────────────────────────────────────────────────────────────────────
-- `p_export = true` registra a exportação com a contagem que o próprio servidor devolveu.
-- `stopped_at`: 'dados' (sem contato no snapshot, parou antes do passo 1), 'veiculo' (antes do
-- passo 2), 'pix' (PIX gerado e não pago), 'cartao' (cartão tentado e não aprovado), 'pagamento'
-- (tudo preenchido, sem tentativa de pagamento).
create or replace function public.operator_recoverable_bookings(
  p_company_id uuid,
  p_export boolean default false
)
returns table (
  booking_id      uuid,
  code            text,
  customer_name   text,
  customer_phone  text,
  customer_email  text,
  location_name   text,
  parking_type    text,
  check_in_at     timestamptz,
  check_out_at    timestamptz,
  days            integer,
  total_amount    numeric,
  attempts        integer,
  origin          text,
  stopped_at      text,
  created_at      timestamptz
)
language plpgsql
volatile
security definer
set search_path to 'public'
as $fn$
#variable_conflict use_column
declare
  v_rows integer;
begin
  if auth.uid() is null or p_company_id is null
     or not public.member_has_scope(p_company_id, 'bookings:recovery') then
    raise exception 'Sem permissão para ver as reservas não concluídas desta empresa'
      using errcode = '42501';
  end if;

  return query
  with comprou as (
    -- Reserva que virou venda: cancelada só existe depois de pagar (booking-flow.md).
    select p.id, p.profile_id, p.created_at, p.check_in_at, p.check_out_at,
           l.company_id,
           lower(nullif(trim(p.customer_email), '')) as em,
           public.recovery_phone_key(p.customer_phone) as ph
    from public.booking p
    join public.location l on l.id = p.location_id
    where p.status in ('confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')
  ),
  cand as (
    select b.id, b.code, b.profile_id, b.created_at, b.check_in_at, b.check_out_at,
           b.total_amount, b.price_breakdown, b.origin, b.vehicle_id,
           l.name as location_name,
           coalesce(
             nullif(trim(b.customer_name), ''),
             nullif(trim(concat_ws(' ', b.customer_first_name, b.customer_last_name)), ''),
             nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
             nullif(trim(u.raw_user_meta_data ->> 'name'), '')
           ) as nome,
           coalesce(nullif(trim(b.customer_email), ''), u.email) as email,
           coalesce(nullif(trim(b.customer_phone), ''), nullif(u.phone, '')) as fone,
           (coalesce(trim(b.customer_name), '') = ''
             and coalesce(trim(b.customer_first_name), '') = ''
             and coalesce(trim(b.customer_email), '') = ''
             and coalesce(trim(b.customer_phone), '') = '') as sem_dados
    from public.booking b
    join public.location l on l.id = b.location_id
    left join auth.users u on u.id = b.profile_id
    where l.company_id = p_company_id
      and b.status = 'expired'
      and b.check_in_at > now()
  ),
  vivas as (
    select c.*,
           coalesce(c.profile_id::text, lower(c.email), public.recovery_phone_key(c.fone), c.id::text)
             as pessoa
    from cand c
    where not exists (
      select 1 from comprou p
      where p.created_at > c.created_at
        and (
          -- Comprou nesta empresa: casa por conta, e-mail ou telefone.
          (p.company_id = p_company_id
           and (p.profile_id = c.profile_id
                or (c.email is not null and p.em = lower(c.email))
                or (public.recovery_phone_key(c.fone) is not null
                    and p.ph = public.recovery_phone_key(c.fone))))
          -- Resolveu a mesma viagem em outro estacionamento: só pela MESMA CONTA. E-mail e
          -- telefone do snapshot são digitados livremente no checkout; casar por eles aqui
          -- deixaria um parceiro criar uma reserva-isca com o contato de alguém e descobrir,
          -- pelo sumiço da linha, se e quando essa pessoa comprou em outra empresa.
          or (p.company_id <> p_company_id
              and c.profile_id is not null
              and p.profile_id = c.profile_id
              and p.check_in_at < c.check_out_at and p.check_out_at > c.check_in_at)
        )
    )
  ),
  ultima as (
    select distinct on (v.pessoa) v.*
    from vivas v
    order by v.pessoa, v.created_at desc
  )
  select
    u.id,
    u.code,
    u.nome,
    u.fone,
    u.email,
    u.location_name,
    (select pt.name
       from public.booking_item bi
       join public.parking_type pt on pt.id = bi.parking_type_id
      where bi.booking_id = u.id and bi.item_type = 'parking'
      order by bi.created_at
      limit 1),
    u.check_in_at,
    u.check_out_at,
    nullif(u.price_breakdown ->> 'days', '')::integer,
    u.total_amount,
    -- Tentativas: expiradas da mesma pessoa nesta empresa desde a última compra dela aqui.
    (select count(*)::integer
       from public.booking x
       join public.location xl on xl.id = x.location_id
      where xl.company_id = p_company_id
        and x.status = 'expired'
        and x.created_at <= u.created_at
        and (x.id = u.id or (u.profile_id is not null and x.profile_id = u.profile_id))
        and x.created_at > coalesce((
          select max(p.created_at) from comprou p
           where p.company_id = p_company_id
             and u.profile_id is not null
             and p.profile_id = u.profile_id
             and p.created_at < u.created_at
        ), '-infinity'::timestamptz)),
    u.origin,
    case
      when u.sem_dados then 'dados'
      when u.vehicle_id is null then 'veiculo'
      when exists (select 1 from public.payment pa where pa.booking_id = u.id and pa.method = 'pix')
        then 'pix'
      when exists (select 1 from public.payment pa where pa.booking_id = u.id and pa.method = 'card')
        then 'cartao'
      else 'pagamento'
    end,
    u.created_at
  from ultima u
  order by u.check_in_at, u.created_at;

  if p_export then
    get diagnostics v_rows = row_count;
    insert into public.booking_recovery_export (company_id, exported_by, row_count)
    values (p_company_id, auth.uid(), v_rows);
  end if;
end;
$fn$;

comment on function public.operator_recoverable_bookings(uuid, boolean) is
  'Reservas expiradas com entrada no futuro, uma por pessoa, sem quem comprou depois. Escopo bookings:recovery. p_export registra a exportação. Ver docs/specs/booking-flow.md (Recuperável).';

revoke all on function public.operator_recoverable_bookings(uuid, boolean) from public, anon;
grant execute on function public.operator_recoverable_bookings(uuid, boolean) to authenticated, service_role;
