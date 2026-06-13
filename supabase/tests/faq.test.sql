-- pgTAP: camada `destination` da FAQ (GEO-07 / ADR-002).
-- Cobre o schema (coluna + enum), o CHECK de consistência por escopo e a RLS
-- (leitura pública de FAQ publicada; escrita só hub_admin). Roda em transação com rollback.

begin;
select plan(7);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
do $$
declare
  uadm  uuid := gen_random_uuid();   -- hub_admin
  ucust uuid := gen_random_uuid();   -- customer qualquer
  did   uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (uadm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','faq-adm@ex.com', now(),now()),
    (ucust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','faq-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (uadm,'hub_admin'),(ucust,'customer') on conflict (id) do nothing;

  insert into public.destination(code,name,slug,type,city,country,latitude,longitude,is_published)
  values ('FQT','Destino FAQ Teste','destino-faq-teste','airport','Cidade','BR',-23.0,-46.0,true)
  returning id into did;

  -- FAQ do destino, publicada
  insert into public.faq(scope, destination_id, question, answer, is_published)
  values ('destination', did, 'Tem traslado no destino?', 'Sim, gratuito.', true);

  perform set_config('test.uadm', uadm::text, false);
  perform set_config('test.did',  did::text,  false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── schema: coluna e valor do enum ──────────────────────────────────────────
select has_column('public', 'faq', 'destination_id', 'faq.destination_id existe');
select lives_ok($$ select 'destination'::public.faq_scope $$, 'enum faq_scope inclui destination');

-- ── CHECK de consistência por escopo ────────────────────────────────────────
select throws_ok(
  $$ insert into public.faq(scope, question, answer) values ('destination','q','a') $$,
  '23514', null,
  'destination sem destination_id viola o CHECK');
select throws_ok(
  $$ insert into public.faq(scope, destination_id, question, answer)
     values ('global', current_setting('test.did')::uuid, 'q', 'a') $$,
  '23514', null,
  'global com destination_id viola o CHECK');

-- ── RLS: leitura pública vs escrita restrita ────────────────────────────────
set local role anon;
select isnt_empty(
  $$ select 1 from public.faq where scope='destination' and question='Tem traslado no destino?' $$,
  'anon lê FAQ destination publicada');
select throws_ok(
  $$ insert into public.faq(scope, destination_id, question, answer)
     values ('destination', current_setting('test.did', true)::uuid, 'hack', 'x') $$,
  '42501', null,
  'anon NÃO insere FAQ (RLS write)');
reset role;

set local role authenticated;
select pg_temp.as_user(current_setting('test.uadm'));
select lives_ok(
  $$ insert into public.faq(scope, destination_id, question, answer)
     values ('destination', current_setting('test.did', true)::uuid, 'E se o voo atrasar?', 'Sem custo extra.') $$,
  'hub_admin insere FAQ destination');
reset role;

select * from finish();
rollback;
