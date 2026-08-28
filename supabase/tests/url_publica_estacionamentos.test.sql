-- pgTAP: nome e slug públicos do estacionamento (uma gramática para as duas famílias).
-- Migration: 20261102090000_url_publica_estacionamentos.sql
-- Spec: docs/specs/url-estacionamentos.md
--
-- O que este arquivo protege, em ordem de importância:
--   1. a unicidade do slug DENTRO do destino e ENTRE as duas tabelas. É o que permite
--      unidade parceira e lote mapeado dividirem a mesma URL, e é onde uma colisão não
--      dá erro em lugar nenhum: some uma ficha e some a URL que tinha ranking;
--   2. a conversão continuar liberando o slug, porque o ganho inteiro do desenho é a ficha
--      reivindicada manter o endereço em vez de recomeçar em outro;
--   3. o formato do nome, que é contrato de marca ("{marca} - Estacionamento {destino}")
--      e alimenta H1, <title> e JSON-LD;
--   4. quem pode mudar as duas colunas. A policy de UPDATE de `location` autoriza por
--      LINHA e RLS não corta coluna, então sem a guarda o parceiro reescreveria a própria
--      URL e poderia tomar o slug do vizinho no mesmo aeroporto.
--
-- Roda em transação com rollback.

begin;
select plan(20);

-- ── estrutura ────────────────────────────────────────────────────────────────
select has_column('public', 'location', 'public_name', 'location guarda o nome público');
select has_column('public', 'location', 'public_slug', 'location guarda o slug público');
select has_column('public', 'prospect_location', 'public_name', 'lote mapeado guarda o nome público');
select has_column('public', 'prospect_location', 'public_slug', 'lote mapeado guarda o slug público');
select has_column('public', 'destination', 'public_slug', 'destino guarda o slug público');

-- ── rótulo primário: o mesmo recorte de seoLabelPrimary em src/lib/seo.ts ─────
select is(
  public.seo_label_primary('Aeroporto Guarulhos (GRU)'),
  'Aeroporto Guarulhos',
  'o código IATA sai do rótulo primário'
);
select is(
  public.seo_label_primary('Aeroporto Curitiba, Afonso Pena (CWB)'),
  'Aeroporto Curitiba',
  'a variante secundária sai do rótulo primário'
);
select is(
  public.seo_label_primary('Jardim Paulista'),
  'Jardim Paulista',
  'rótulo sem parênteses nem vírgula passa inteiro'
);

-- ── fixtures ─────────────────────────────────────────────────────────────────
-- Geo no Atlântico Sul, longe de qualquer destino do baseline: o auto-fill de destino do
-- lote mapeado varre os publicados num raio de 100 km e precisa ser determinístico.
do $$
declare
  dest uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  cmp  uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  lot1 uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  lot2 uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
  uadm uuid := 'aaaaaaaa-0000-4000-8000-000000000007';   -- hub_admin
  uop  uuid := 'aaaaaaaa-0000-4000-8000-000000000008';   -- dono da empresa de teste
begin
  insert into public.destination(id, code, name, short_name, seo_label, slug, type, city, state, country, latitude, longitude, is_published)
  values (dest, 'TU01', 'Aeroporto Internacional de Teste', 'Teste (TU1)', 'Aeroporto Teste (TU1)',
          'aeroporto-de-teste', 'airport', 'Cidade', 'SP', 'BR', -50.0000, -30.0000, true);

  insert into public.company(id, name, slug) values (cmp, 'Co Teste URL', 'co-teste-url');

  insert into public.location(id, company_id, name, slug, latitude, longitude, destination_id, public_name, public_slug)
  values
    (lot1, cmp, 'Unidade Um', 'unidade-url-1', -50.0005, -30.0005, dest,
     public.unit_public_name('Marca Um', dest), 'marca-um'),
    (lot2, cmp, 'Unidade Dois', 'unidade-url-2', -50.0006, -30.0006, dest,
     public.unit_public_name('Marca Dois', dest), 'marca-dois');

  insert into public.prospect_location(id, destination_id, name, slug, latitude, longitude, is_published, public_name, public_slug)
  values
    ('aaaaaaaa-0000-4000-8000-000000000005', dest, 'Mapeado Um', 'mapeado-url-1', -50.0009, -30.0000, false,
     public.unit_public_name('Mapeado Um', dest), 'mapeado-um'),
    ('aaaaaaaa-0000-4000-8000-000000000006', dest, 'Mapeado Dois', 'mapeado-url-2', -50.0008, -30.0000, false,
     public.unit_public_name('Mapeado Dois', dest), 'mapeado-dois');

  -- Dois usuários para a guarda de quem edita. `do update` e não `do nothing`: onde o
  -- trigger `on_auth_user_created` existe (o banco vivo tem; o stack local não), a linha
  -- já nasceu como `customer` e o admin ficaria sem o papel, medindo coisa diferente lá.
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (uadm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'url-adm@ex.com', now(), now()),
    (uop,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'url-op@ex.com',  now(), now());
  insert into public.profiles(id, role) values (uadm, 'hub_admin'), (uop, 'company_operator')
    on conflict (id) do update set role = excluded.role;
  insert into public.profile_company(profile_id, company_id, role) values (uop, cmp, 'owner');
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── derivação automática ─────────────────────────────────────────────────────
select is(
  (select public_slug from public.destination where code = 'TU01'),
  'aeroporto-teste',
  'destino novo nasce com o slug público derivado do seo_label'
);
select is(
  (select public_name from public.location where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  'Marca Um - Estacionamento Aeroporto Teste',
  'o nome público segue o padrão {marca} - Estacionamento {destino}'
);
select is(
  public.unit_public_name('Marca Um', null::uuid)::text,
  null::text,
  'sem destino não há nome público'
);

-- ── unicidade dentro de cada tabela ──────────────────────────────────────────
select throws_ok(
  $$ update public.location set public_slug = 'marca-um'
     where id = 'aaaaaaaa-0000-4000-8000-000000000004' $$,
  '23505', null,
  'duas unidades do mesmo destino não repetem o slug público'
);
select throws_ok(
  $$ update public.prospect_location set public_slug = 'mapeado-um'
     where id = 'aaaaaaaa-0000-4000-8000-000000000006' $$,
  '23505', null,
  'dois lotes mapeados do mesmo destino não repetem o slug público'
);

-- ── unicidade entre as duas tabelas ──────────────────────────────────────────
select throws_ok(
  $$ update public.location set public_slug = 'mapeado-um'
     where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  '23505', null,
  'unidade não toma o slug de um lote mapeado do mesmo destino'
);
select throws_ok(
  $$ update public.prospect_location set public_slug = 'marca-um'
     where id = 'aaaaaaaa-0000-4000-8000-000000000005' $$,
  '23505', null,
  'lote mapeado não toma o slug de uma unidade do mesmo destino'
);

-- ── conversão devolve o slug para a unidade herdeira ─────────────────────────
-- É o ponto do desenho: reivindicar a ficha mantém a URL em vez de redirecionar.
update public.prospect_location
set converted_at = now(), converted_location_id = 'aaaaaaaa-0000-4000-8000-000000000004'
where id = 'aaaaaaaa-0000-4000-8000-000000000005';

select lives_ok(
  $$ update public.location set public_slug = 'mapeado-um'
     where id = 'aaaaaaaa-0000-4000-8000-000000000004' $$,
  'ficha convertida libera o slug para a unidade que nasceu dela'
);

-- ── quem pode mudar nome e slug ──────────────────────────────────────────────
-- O parceiro tem `locations:write` na própria unidade e RLS não corta coluna, então sem a
-- guarda ele reescreve a URL pública quando quiser e o canonical, o sitemap e o mapa de
-- 301 passam a perseguir um endereço que muda sozinho.
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000008');
select throws_ok(
  $$ update public.location set public_slug = 'marca-um-pelo-parceiro'
     where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  '42501', null,
  'dono da empresa não reescreve o slug público da própria unidade'
);
reset role;

set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000007');
select lives_ok(
  $$ update public.location set public_name = 'Marca Um Editada - Estacionamento Aeroporto Teste'
     where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  'hub_admin edita o nome público'
);
reset role;

-- ── invariantes do acervo ────────────────────────────────────────────────────
select is(
  (select count(*) from public.destination where public_slug is null or btrim(public_slug) = '')::int,
  0,
  'nenhum destino fica sem slug público'
);
select is(
  (select count(*) from public.prospect_location
    where public_name is not null and public_name not like '% - Estacionamento %')::int,
  0,
  'todo nome público de lote mapeado segue o padrão'
);

select * from finish();
rollback;
