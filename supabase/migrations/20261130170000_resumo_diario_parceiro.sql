-- Resumo diário do parceiro (20/10/2026, pedido do Kallef).
--
-- O parceiro não enxergava as reservas vendidas pelo Hub: ninguém da Abbapark nem da Nationpark
-- abre o Operator desde 30/09, nenhuma das 36 reservas teve check-in registrado, e o
-- white-label só recebe a contagem de vagas (sem nome nem placa). A decisão de 23/09 era não
-- avisar o parceiro de cada reserva; a de 20/10 é um e-mail por dia, às 6h de Brasília, só
-- quando há movimento: quem entra e quem sai naquele dia e as reservas novas desde o e-mail
-- anterior. Vai para a equipe da empresa com o escopo `bookings:read` (ADR-005).
--
-- Peças:
--   partner_digest_log           uma linha por empresa por dia: idempotência e o "desde quando"
--                                das reservas novas. Só hub_admin lê.
--   partner_daily_digest(day)    o movimento do dia por empresa (fuso de cada unidade).
--   partner_digest_recipients()  e-mails da equipe com bookings:read.
--   partner_digest_expected_key  chave do cron, no Vault (mesmo padrão do booking-reminders).
--   app_setting partner_daily_digest_enabled  chave geral.

create table if not exists public.partner_digest_log (
  company_id   uuid not null references public.company(id) on delete cascade,
  digest_date  date not null,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  recipients   integer not null default 0,
  entradas     integer not null default 0,
  saidas       integer not null default 0,
  novas        integer not null default 0,
  primary key (company_id, digest_date)
);
comment on table public.partner_digest_log is
  'Resumo diário enviado ao parceiro (um por empresa por dia). Ver 20261130170000.';

alter table public.partner_digest_log enable row level security;
drop policy if exists "partner_digest_log_admin_read" on public.partner_digest_log;
create policy "partner_digest_log_admin_read" on public.partner_digest_log
  for select to authenticated using (public.is_hub_admin());
revoke all on table public.partner_digest_log from public, anon, authenticated;
grant select on table public.partner_digest_log to authenticated;
grant all on table public.partner_digest_log to service_role;

-- ── O movimento do dia ───────────────────────────────────────────────────────
-- Uma linha por empresa que tem entrada, saída ou reserva nova. Datas comparadas no fuso da
-- unidade. "Nova" = paga depois do último resumo enviado à empresa (ou nas últimas 24 h) e que
-- não entra nem sai hoje (essas já aparecem nas outras listas).
create or replace function public.partner_daily_digest(p_day date)
returns table (company_id uuid, company_name text, entradas jsonb, saidas jsonb, novas jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  with base as (
    select
      b.id, b.code, b.status, b.check_in_at, b.check_out_at, b.passenger_count, b.has_pcd,
      b.fare_tier, b.flight_number, b.created_at,
      coalesce((b.fare_benefits ->> 'flight_delay_protection')::boolean, false) as protecao_voo,
      l.company_id, c.name as company_name, l.timezone,
      coalesce(nullif(l.public_name, ''), l.name) as location_name,
      coalesce(nullif(trim(concat_ws(' ', b.customer_first_name, b.customer_last_name)), ''), b.customer_name) as cliente,
      v.license_plate as placa,
      nullif(trim(concat_ws(' ', v.model, v.color)), '') as veiculo,
      (select pt.name from public.booking_item bi join public.parking_type pt on pt.id = bi.parking_type_id
        where bi.booking_id = b.id and bi.item_type = 'parking' limit 1) as vaga,
      (select coalesce(jsonb_agg(a.name order by a.name), '[]'::jsonb) from public.booking_item bi
         join public.add_on_service a on a.id = bi.add_on_service_id
        where bi.booking_id = b.id and bi.item_type = 'add_on') as adicionais,
      coalesce((select min(p.paid_at) from public.payment p
                 where p.booking_id = b.id and p.kind = 'booking' and p.paid_at is not null), b.created_at) as pago_em,
      (b.check_in_at at time zone l.timezone)::date = p_day as entra_hoje,
      (b.check_out_at at time zone l.timezone)::date = p_day as sai_hoje
    from public.booking b
    join public.location l on l.id = b.location_id
    join public.company c on c.id = l.company_id
    left join public.vehicle v on v.id = b.vehicle_id
    where b.deleted_at is null
      and b.status in ('confirmed', 'checked_in', 'completed')
      -- janela larga o bastante para qualquer fuso; o filtro fino é por data local
      and (b.check_in_at between p_day - 2 and p_day + 2
        or b.check_out_at between p_day - 2 and p_day + 2
        or b.created_at > p_day - 3)
  ),
  desde as (
    select c.id as company_id,
           coalesce((select max(g.sent_at) from public.partner_digest_log g
                      where g.company_id = c.id and g.digest_date < p_day),
                    (p_day::timestamp at time zone 'America/Sao_Paulo') - interval '18 hours') as desde
      from public.company c
  ),
  marcado as (
    select b.*,
           jsonb_build_object(
             'code', b.code, 'status', b.status, 'check_in_at', b.check_in_at, 'check_out_at', b.check_out_at,
             'timezone', b.timezone, 'location_name', b.location_name, 'cliente', b.cliente, 'placa', b.placa,
             'veiculo', b.veiculo, 'vaga', b.vaga, 'passageiros', b.passenger_count, 'pcd', b.has_pcd,
             'tarifa', b.fare_tier, 'protecao_voo', b.protecao_voo, 'voo', b.flight_number,
             'adicionais', b.adicionais
           ) as item,
           (not b.entra_hoje and not b.sai_hoje and b.pago_em > d.desde
              and (b.check_in_at at time zone b.timezone)::date > p_day) as nova
      from base b join desde d on d.company_id = b.company_id
  )
  select m.company_id, min(m.company_name),
         coalesce(jsonb_agg(m.item order by m.check_in_at) filter (where m.entra_hoje and m.status in ('confirmed', 'checked_in')), '[]'::jsonb),
         coalesce(jsonb_agg(m.item order by m.check_out_at) filter (where m.sai_hoje), '[]'::jsonb),
         coalesce(jsonb_agg(m.item order by m.check_in_at) filter (where m.nova), '[]'::jsonb)
    from marcado m
   group by m.company_id
  having count(*) filter (where (m.entra_hoje and m.status in ('confirmed', 'checked_in')) or m.sai_hoje or m.nova) > 0;
$$;

revoke all on function public.partner_daily_digest(date) from public, anon, authenticated;
grant execute on function public.partner_daily_digest(date) to service_role;

-- ── Quem recebe ──────────────────────────────────────────────────────────────
-- A equipe da empresa com o escopo de leitura de reservas (os quatro papéis o têm hoje; a regra
-- é pelo escopo, para seguir o ADR-005 se um papel perder a leitura).
create or replace function public.partner_digest_recipients(p_company_id uuid)
returns setof text
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct lower(u.email)
    from public.profile_company pc
    join auth.users u on u.id = pc.profile_id
   where pc.company_id = p_company_id
     and u.email is not null and u.email <> ''
     and u.deleted_at is null
     and (u.banned_until is null or u.banned_until < now())
     and (pc.role = 'owner'
          or exists (select 1 from public.company_role_scope s
                      where s.role = pc.role and s.scope = 'bookings:read'))
   order by 1;
$$;

revoke all on function public.partner_digest_recipients(uuid) from public, anon, authenticated;
grant execute on function public.partner_digest_recipients(uuid) to service_role;

-- ── Chave do cron e chave geral ──────────────────────────────────────────────
select vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'partner_digest_key', 'Chave do cron partner-daily-digest')
 where not exists (select 1 from vault.secrets where name = 'partner_digest_key');

create or replace function public.partner_digest_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'partner_digest_key' limit 1;
$$;
revoke all on function public.partner_digest_expected_key() from public, anon, authenticated;
grant execute on function public.partner_digest_expected_key() to service_role;

insert into public.app_setting (key, value, is_public)
values ('partner_daily_digest_enabled', 'true', false)
on conflict (key) do nothing;

-- 06:00 de Brasília (09:00 UTC), com uma segunda passada às 06:30 para quem falhou na primeira.
select cron.unschedule('partner-daily-digest') where exists (select 1 from cron.job where jobname = 'partner-daily-digest');
select cron.schedule(
  'partner-daily-digest',
  '0,30 9 * * *',
  $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/partner-daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-partner-digest-key', (select decrypted_secret from vault.decrypted_secrets where name = 'partner_digest_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
