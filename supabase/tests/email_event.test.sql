-- pgTAP: eventos de e-mail do SES (email_event, 20261205190000, 19/11/2026).
-- Cobre: RLS (só hub_admin lê; cliente, parceiro e anônimo não), ninguém fora do servidor escreve,
-- idempotência por (sns_message_id, destinatário), destinatário sempre minúsculo, tipo fechado, e o
-- alerta do resumo da equipe: devolução e reclamação do dia entram, entrega e evento fora do dia não.
-- O dia do teste fica em 2030, onde o banco vivo não tem dado.
-- Roda com: supabase test db (stack local, ver README.md). Transação + rollback.

begin;
select plan(12);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.email_event'::regclass)
  and not has_table_privilege('anon', 'public.email_event', 'select')
  and not has_table_privilege('authenticated', 'public.email_event', 'insert')
  and not has_table_privilege('authenticated', 'public.email_event', 'update')
  and not has_table_privilege('authenticated', 'public.email_event', 'delete'),
  'email_event com RLS, fechada para anônimo e sem escrita fora do servidor'
);

do $$
declare
  ua uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  d date := date '2030-04-10';
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ses-admin@ex.com', now(), now()),
    (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ses-cliente@ex.com', now(), now());
  insert into public.profiles(id, role) values (ua, 'hub_admin'), (uc, 'customer')
    on conflict (id) do update set role = excluded.role;
  perform set_config('test.ua', ua::text, true);
  perform set_config('test.uc', uc::text, true);

  insert into public.email_event(sns_message_id, event_type, recipient, subject, bounce_type, occurred_at) values
    -- duas devoluções do mesmo destino no dia: uma linha no alerta, n = 2, último assunto
    ('sns-1', 'bounce', 'parceiro@ex.com', 'Movimento de hoje: Ex', 'Permanent', (d + time '07:00') at time zone 'America/Sao_Paulo'),
    ('sns-2', 'bounce', 'parceiro@ex.com', 'Movimento de amanhã: Ex', 'Permanent', (d + time '20:00') at time zone 'America/Sao_Paulo'),
    ('sns-3', 'complaint', 'cliente@ex.com', 'Sua reserva', 'abuse', (d + time '12:00') at time zone 'America/Sao_Paulo'),
    -- entrega: não é alerta
    ('sns-4', 'delivery', 'ok@ex.com', 'Sua reserva', null, (d + time '12:00') at time zone 'America/Sao_Paulo'),
    -- devolução do dia seguinte: fora da janela
    ('sns-5', 'bounce', 'amanha@ex.com', 'x', 'Transient', (d + 1 + time '00:30') at time zone 'America/Sao_Paulo');
end $$;

select throws_ok(
  $$ insert into public.email_event(sns_message_id, event_type, recipient, occurred_at)
     values ('sns-1', 'bounce', 'parceiro@ex.com', now()) $$,
  '23505', null,
  'a mesma notificação do SNS não grava duas vezes para o mesmo destinatário'
);
select lives_ok(
  $$ insert into public.email_event(sns_message_id, event_type, recipient, occurred_at)
     values ('sns-1', 'bounce', 'outro@ex.com', now()) $$,
  'a mesma notificação grava uma linha por destinatário'
);
select throws_ok(
  $$ insert into public.email_event(sns_message_id, event_type, recipient, occurred_at)
     values ('sns-9', 'bounce', 'Maiuscula@Ex.com', now()) $$,
  '23514', null,
  'destinatário entra sempre em minúsculas'
);
select throws_ok(
  $$ insert into public.email_event(sns_message_id, event_type, recipient, occurred_at)
     values ('sns-9', 'open', 'a@ex.com', now()) $$,
  '23514', null,
  'tipo de evento fora da lista é recusado'
);

-- ── leitura por papel ────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.uc'))::text, true);
select is((select count(*)::int from public.email_event), 0, 'cliente não vê evento de e-mail');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ua'))::text, true);
select ok((select count(*) from public.email_event where sns_message_id like 'sns-%') >= 6, 'hub_admin vê os eventos');
reset role;

-- ── alerta no resumo da equipe ───────────────────────────────────────────────
select is(
  jsonb_array_length(public.team_daily_digest(date '2030-04-10')->'alertas'->'emails_problema'),
  2,
  'o alerta traz devolução e reclamação do dia, sem entrega e sem o dia seguinte'
);
select is(
  (select x->>'n' from jsonb_array_elements(public.team_daily_digest(date '2030-04-10')->'alertas'->'emails_problema') x
    where x->>'destinatario' = 'parceiro@ex.com'),
  '2',
  'duas devoluções do mesmo destino viram uma linha com n = 2'
);
select is(
  (select x->>'assunto' from jsonb_array_elements(public.team_daily_digest(date '2030-04-10')->'alertas'->'emails_problema') x
    where x->>'destinatario' = 'parceiro@ex.com'),
  'Movimento de amanhã: Ex',
  'a linha mostra o assunto da devolução mais recente'
);
select is(
  (select x->>'tipo' from jsonb_array_elements(public.team_daily_digest(date '2030-04-10')->'alertas'->'emails_problema') x
    where x->>'destinatario' = 'cliente@ex.com'),
  'complaint',
  'reclamação aparece com o tipo'
);
select is(
  jsonb_array_length(public.team_daily_digest(date '2030-04-09')->'alertas'->'emails_problema'),
  0,
  'dia sem problema traz a lista vazia'
);

select * from finish();
rollback;
