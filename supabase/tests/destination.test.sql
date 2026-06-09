-- pgTAP: RLS da tabela destination. Leitura pública (catálogo de destinos para
-- SEO/busca) e escrita restrita a hub_admin. Roda em transação com rollback.

begin;
select plan(5);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
do $$
declare
  ucust uuid := gen_random_uuid();   -- customer qualquer
  uadm  uuid := gen_random_uuid();   -- hub_admin
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (ucust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','dest-cust@ex.com',now(),now()),
    (uadm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','dest-adm@ex.com', now(),now());
  insert into public.profiles(id, role) values
    (ucust,'customer'),(uadm,'hub_admin') on conflict (id) do nothing;

  -- um destino publicado e um rascunho
  insert into public.destination(code, name, slug, type, city, state, country, latitude, longitude, is_published)
  values
    ('TST','Destino Teste Publicado','destino-teste-publicado','airport','Cidade','SP','BR',-23.0,-46.0,true),
    ('TS2','Destino Teste Rascunho','destino-teste-rascunho','airport','Cidade','SP','BR',-23.1,-46.1,false);

  perform set_config('test.ucust', ucust::text, false);
  perform set_config('test.uadm',  uadm::text,  false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── anon: lê o catálogo de destinos (policy select = true) ───────────────────
set local role anon;
select isnt_empty(
  $$select 1 from public.destination where slug = 'destino-teste-publicado'$$,
  'anon lê destino publicado');
select throws_ok(
  $$insert into public.destination(code,name,slug,type,city,country,latitude,longitude)
    values ('HCK','Hack','hack','airport','X','BR',0,0)$$,
  '42501', null,
  'anon NÃO insere destino (RLS write)');
reset role;

-- ── customer: o UPDATE é filtrado pelo USING (0 linhas, sem erro) ─────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.ucust'));
update public.destination set name = 'Hijack' where slug = 'destino-teste-publicado';
reset role;
select is(
  (select name from public.destination where slug = 'destino-teste-publicado'),
  'Destino Teste Publicado',
  'customer NÃO altera destino (RLS write)');

-- ── hub_admin: escreve livremente ────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.uadm'));
select lives_ok(
  $$insert into public.destination(code,name,slug,type,city,country,latitude,longitude,is_published)
    values ('ADM','Destino Admin','destino-admin','airport','X','BR',-1,-2,true)$$,
  'hub_admin insere destino');
select lives_ok(
  $$update public.destination set sort_order = 5 where slug = 'destino-teste-rascunho'$$,
  'hub_admin edita destino');
reset role;

select * from finish();
rollback;
