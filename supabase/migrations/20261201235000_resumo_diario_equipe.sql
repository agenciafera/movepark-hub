-- Resumo diário da equipe Movepark (10/11/2026). Spec: docs/specs/resumo-diario-equipe.md.
--
-- Um e-mail às 7h de Brasília com o dia anterior inteiro (0h às 24h de Brasília): vendas do Hub e
-- do white-label, dinheiro (comissão, repasses, estornos, dívida de parceiro), clientes, o
-- movimento de hoje e alertas. Os números saem daqui, no banco, para o teste pgTAP cobrir a regra;
-- a Edge `team-daily-digest` só monta e manda. Mesmo modelo do resumo do parceiro (20261130170000).
--
--   team_digest_numbers(p_day)  números comparáveis de um dia (o resumo compara com 7 dias antes)
--   team_daily_digest(p_day)    o resumo inteiro, em jsonb
--   team_digest_log             um envio por dia (idempotência da segunda passada)
--   team_digest_expected_key    chave do cron, no Vault
--   app_setting team_daily_digest_enabled / team_daily_digest_recipients (e-mails separados por vírgula)

create table if not exists public.team_digest_log (
  digest_date  date primary key,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  recipients   integer not null default 0
);
comment on table public.team_digest_log is
  'Resumo diário enviado à equipe Movepark (um por dia). Ver 20261201235000.';

alter table public.team_digest_log enable row level security;
drop policy if exists "team_digest_log_admin_read" on public.team_digest_log;
create policy "team_digest_log_admin_read" on public.team_digest_log
  for select to authenticated using (public.is_hub_admin());
revoke all on table public.team_digest_log from public, anon, authenticated;
grant select on table public.team_digest_log to authenticated;
grant all on table public.team_digest_log to service_role;

-- ── Janela do dia em Brasília ────────────────────────────────────────────────
create or replace function public.team_digest_window(p_day date, out ini timestamptz, out fim timestamptz)
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select (p_day::timestamp at time zone 'America/Sao_Paulo'),
         ((p_day + 1)::timestamp at time zone 'America/Sao_Paulo');
$$;

-- ── Números comparáveis de um dia ────────────────────────────────────────────
-- Venda do Hub = pagamento de reserva pago no dia (conta também o que foi estornado depois: a venda
-- aconteceu naquele dia). `payment.amount` é em reais; tudo aqui sai em centavos. A comissão é a
-- perna da Movepark no split (bruta, antes da taxa da Pagar.me). White-label = pedido confirmado,
-- criado no dia, sem duplicata.
create or replace function public.team_digest_numbers(p_day date)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with w as (select ini, fim from public.team_digest_window(p_day)),
  pag as (
    select p.* from public.payment p, w
     where p.kind = 'booking' and p.status in ('paid', 'refunded')
       and p.paid_at >= w.ini and p.paid_at < w.fim
  ),
  com as (
    select coalesce(sum((r->>'amount')::bigint) filter (where not public.split_rule_is_partner(r)), 0) as cents
      from pag, jsonb_array_elements(case when jsonb_typeof(pag.split) = 'array' then pag.split else '[]'::jsonb end) r
  ),
  wl as (
    select b.* from public.wl_booking b, w
     where b.wl_created_at >= w.ini and b.wl_created_at < w.fim
       and b.status = 'confirmed' and not coalesce(b.is_duplicate, false)
  )
  select jsonb_build_object(
    'hub_reservas', (select count(distinct booking_id) from pag),
    'hub_receita_cents', (select coalesce(round(sum(amount) * 100), 0)::bigint from pag),
    'hub_comissao_cents', (select cents from com),
    'hub_cartao', (select count(*) from pag where method = 'card'),
    'hub_pix', (select count(*) from pag where method = 'pix'),
    'wl_reservas', (select count(*) from wl),
    'wl_receita_cents', (select coalesce(sum(coalesce(paid_total_cents, total_cents)), 0)::bigint from wl),
    'clientes_novos', (select count(*) from public.profiles pr, w
                        where pr.role = 'customer' and pr.created_at >= w.ini and pr.created_at < w.fim),
    'cancelamentos', (select count(*) from public.booking_modification m, w
                       where m.type = 'cancel' and m.created_at >= w.ini and m.created_at < w.fim),
    'estornos_cents', (select coalesce(round(sum(p.refunded_amount) * 100), 0)::bigint from public.payment p, w
                        where p.refunded_at >= w.ini and p.refunded_at < w.fim)
  );
$$;

-- ── O resumo inteiro ─────────────────────────────────────────────────────────
create or replace function public.team_daily_digest(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ini timestamptz;
  v_fim timestamptz;
  v_hoje date := p_day + 1;
  v_health jsonb;
begin
  select ini, fim into v_ini, v_fim from public.team_digest_window(p_day);
  begin
    v_health := public.site_rebuild_health();
  exception when others then
    v_health := jsonb_build_object('ok', false, 'motivo', 'não foi possível ler a saúde da publicação');
  end;

  return jsonb_build_object(
    'day', p_day,
    'atual', public.team_digest_numbers(p_day),
    'semana_passada', public.team_digest_numbers(p_day - 7),

    'canais', coalesce((
      select jsonb_agg(jsonb_build_object('canal', canal, 'reservas', n, 'receita_cents', cents) order by n desc, canal)
        from (
          select coalesce(nullif(b.commission_channel, ''), nullif(b.utm_source, ''), 'direto') as canal,
                 count(distinct p.booking_id) as n,
                 round(sum(p.amount) * 100)::bigint as cents
            from public.payment p join public.booking b on b.id = p.booking_id
           where p.kind = 'booking' and p.status in ('paid', 'refunded')
             and p.paid_at >= v_ini and p.paid_at < v_fim
           group by 1
        ) x), '[]'::jsonb),

    -- Primeira compra: a conta não tinha pagamento de reserva antes deste dia.
    'compradores', (
      select jsonb_build_object(
        'primeira', count(*) filter (where not antes),
        'recompra', count(*) filter (where antes))
        from (
          select distinct b.profile_id,
                 exists (select 1 from public.payment p2 join public.booking b2 on b2.id = p2.booking_id
                          where b2.profile_id = b.profile_id and p2.kind = 'booking'
                            and p2.status in ('paid', 'refunded') and p2.paid_at < v_ini) as antes
            from public.payment p join public.booking b on b.id = p.booking_id
           where p.kind = 'booking' and p.status in ('paid', 'refunded')
             and p.paid_at >= v_ini and p.paid_at < v_fim and b.profile_id is not null
        ) c),

    'repasses', coalesce((
      select jsonb_agg(jsonb_build_object('empresa', c.name, 'valor_cents', w.amount_cents,
                                          'origem', w.origin, 'status', w.status) order by c.name)
        from public.payout_withdrawal w join public.company c on c.id = w.company_id
       where w.created_at >= v_ini and w.created_at < v_fim and w.deleted_at is null), '[]'::jsonb),

    -- Só o que é dívida: crédito do parceiro (valor negativo) não abate a dívida de outro.
    'divida_cents', (
      select coalesce(sum(greatest(public.payout_debt_cents(r.company_id), 0)), 0)::bigint
        from public.payout_recipient r
       where r.provider = 'pagarme' and r.deleted_at is null),

    'hoje', jsonb_build_object(
      'entradas', (select count(*) from public.booking b join public.location l on l.id = b.location_id
                    where b.status in ('confirmed', 'checked_in') and b.deleted_at is null
                      and (b.check_in_at at time zone coalesce(l.timezone, 'America/Sao_Paulo'))::date = v_hoje),
      'saidas', (select count(*) from public.booking b join public.location l on l.id = b.location_id
                  where b.status in ('confirmed', 'checked_in') and b.deleted_at is null
                    and (b.check_out_at at time zone coalesce(l.timezone, 'America/Sao_Paulo'))::date = v_hoje)),

    'chamados', jsonb_build_object(
      'novos', (select count(*) from public.support_ticket s where s.created_at >= v_ini and s.created_at < v_fim),
      'abertos', (select count(*) from public.support_ticket s where s.status <> 'closed')),

    'avaliacoes', (
      select jsonb_build_object(
        'n', count(*),
        'media', round(avg(r.rating)::numeric, 1),
        'baixas', coalesce(jsonb_agg(jsonb_build_object('unidade', coalesce(l.public_name, l.name),
                                                        'nota', r.rating, 'comentario', left(r.comment, 200)))
                           filter (where r.rating <= 3), '[]'::jsonb))
        from public.review r join public.location l on l.id = r.location_id
       where r.created_at >= v_ini and r.created_at < v_fim),

    'alertas', jsonb_build_object(
      'leads_parceiro', coalesce((
        select jsonb_agg(jsonb_build_object('empresa', l.company_name, 'cidade', concat_ws('/', l.city, l.state))
                         order by l.created_at)
          from public.partner_lead l where l.created_at >= v_ini and l.created_at < v_fim), '[]'::jsonb),
      'integracao_falhas', (select count(*) from public.integration_delivery d
                             where d.status = 'failed' and d.updated_at >= v_ini and d.updated_at < v_fim),
      'cartao_recusado', (select count(*) from public.payment_gateway_event e
                           where e.kind in ('webhook:charge.payment_failed', 'webhook:charge.antifraud_reproved')
                             and e.created_at >= v_ini and e.created_at < v_fim),
      'publicacao_ok', coalesce((v_health->>'ok')::boolean, false),
      'publicacao_motivo', v_health->>'motivo')
  );
end;
$$;

revoke all on function public.team_digest_window(date) from public, anon, authenticated;
revoke all on function public.team_digest_numbers(date) from public, anon, authenticated;
revoke all on function public.team_daily_digest(date) from public, anon, authenticated;
grant execute on function public.team_digest_window(date) to service_role;
grant execute on function public.team_digest_numbers(date) to service_role;
grant execute on function public.team_daily_digest(date) to service_role;

-- ── Chave do cron, chave geral e destinatários ───────────────────────────────
select vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'team_digest_key', 'Chave do cron team-daily-digest')
 where not exists (select 1 from vault.secrets where name = 'team_digest_key');

create or replace function public.team_digest_expected_key()
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'team_digest_key' limit 1;
$$;
revoke all on function public.team_digest_expected_key() from public, anon, authenticated;
grant execute on function public.team_digest_expected_key() to service_role;

insert into public.app_setting (key, value, is_public) values
  ('team_daily_digest_enabled', 'true', false),
  ('team_daily_digest_recipients', 'contato@movepark.co', false)
on conflict (key) do nothing;

-- 07:00 de Brasília (10:00 UTC), com uma segunda passada às 07:30 caso a primeira falhe.
select cron.unschedule('team-daily-digest') where exists (select 1 from cron.job where jobname = 'team-daily-digest');
select cron.schedule(
  'team-daily-digest',
  '0,30 10 * * *',
  $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/team-daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-team-digest-key', (select decrypted_secret from vault.decrypted_secrets where name = 'team_digest_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
