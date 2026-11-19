-- Eventos de e-mail do Amazon SES (19/11/2026). Spec: docs/specs/email-eventos-ses.md.
--
-- O `sendEmail` só sabe se o SES ACEITOU a mensagem. Em 19/11/2026 o resumo diário da Pare Seguro
-- sumiu por dias: o SES aceitava, o Gmail e o Outlook recusavam depois, e o `partner_digest_log`
-- seguia marcando "enviado". O diagnóstico só saiu porque o parceiro reclamou.
--
-- Daqui para a frente o SES publica Bounce, Complaint, Delivery, Reject, DeliveryDelay e
-- RenderingFailure (configuration set `movepark-eventos`) num tópico SNS, o SNS entrega na Edge
-- `ses-events` (verify_jwt=false, assinatura do SNS conferida e tópico na allowlist) e ela grava
-- aqui, uma linha por destinatário. Devolução, reclamação e recusa entram no bloco "Atenção" do
-- resumo diário da equipe; o Manager mostra os últimos eventos em /manager/emails.
--
--   email_event                       um evento do SES por destinatário (idempotente por SNS id)
--   app_setting ses_events_topic_arn  o único tópico SNS aceito pela Edge (vazio = recusa tudo)
--   team_daily_digest                 ganha alertas.emails_problema
--   cron email-event-purge            entrega com mais de 90 dias sai; problema fica

create table if not exists public.email_event (
  id              uuid primary key default gen_random_uuid(),
  sns_message_id  text not null,
  event_type      text not null check (event_type in
                    ('bounce', 'complaint', 'delivery', 'reject', 'delivery_delay', 'rendering_failure')),
  recipient       text not null check (recipient = lower(recipient) and recipient <> ''),
  ses_message_id  text,
  subject         text,
  sender          text,
  -- Bounce: Permanent / Transient / Undetermined (+ subtipo). Complaint: o tipo do feedback.
  bounce_type     text,
  bounce_subtype  text,
  -- A resposta do servidor de destino (diagnosticCode da devolução, smtpResponse da entrega).
  diagnostic      text,
  occurred_at     timestamptz not null,
  created_at      timestamptz not null default now(),
  -- O evento inteiro, guardado só no que é problema (entrega é volume e não precisa).
  raw             jsonb,
  constraint email_event_sns_recipient_key unique (sns_message_id, recipient)
);
comment on table public.email_event is
  'Eventos do Amazon SES (devolução, reclamação, entrega...) por destinatário, gravados pela Edge ses-events. Ver 20261205190000.';

create index if not exists email_event_recipient_idx on public.email_event (recipient, occurred_at desc);
create index if not exists email_event_type_idx on public.email_event (event_type, occurred_at desc);

alter table public.email_event enable row level security;
drop policy if exists "email_event_admin_read" on public.email_event;
create policy "email_event_admin_read" on public.email_event
  for select to authenticated using (public.is_hub_admin());
revoke all on table public.email_event from public, anon, authenticated;
grant select on table public.email_event to authenticated;
grant all on table public.email_event to service_role;

-- O tópico aceito. Vazio até o tópico existir: a Edge recusa toda mensagem enquanto isso.
insert into public.app_setting (key, value, is_public) values ('ses_events_topic_arn', '', false)
on conflict (key) do nothing;

-- Entrega bem-sucedida é volume; com 90 dias já não diz nada. Problema fica para sempre.
select cron.unschedule('email-event-purge') where exists (select 1 from cron.job where jobname = 'email-event-purge');
select cron.schedule(
  'email-event-purge',
  '15 6 * * *',
  $cron$ delete from public.email_event where event_type = 'delivery' and occurred_at < now() - interval '90 days'; $cron$
);

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
      'publicacao_motivo', v_health->>'motivo',
      -- E-mail que o SES aceitou e o destino devolveu, reclamou ou o SES recusou (20261205190000).
      -- Uma linha por destinatário e tipo, com o último assunto: o que importa é QUEM não recebe.
      'emails_problema', coalesce((
        select jsonb_agg(jsonb_build_object('destinatario', recipient, 'tipo', event_type,
                                            'bounce_type', bounce_type, 'assunto', assunto, 'n', n)
                         order by n desc, recipient)
          from (
            select e.recipient, e.event_type,
                   (array_agg(e.bounce_type order by e.occurred_at desc))[1] as bounce_type,
                   (array_agg(left(e.subject, 120) order by e.occurred_at desc))[1] as assunto,
                   count(*) as n
              from public.email_event e
             where e.event_type in ('bounce', 'complaint', 'reject')
               and e.occurred_at >= v_ini and e.occurred_at < v_fim
             group by e.recipient, e.event_type
             order by count(*) desc, e.recipient
             limit 20
          ) x), '[]'::jsonb))
  );
end;
$$;

revoke all on function public.team_daily_digest(date) from public, anon, authenticated;
grant execute on function public.team_daily_digest(date) to service_role;
