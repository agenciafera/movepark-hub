-- pgTAP: E0.17-a · ADR-010 · prospect_location (lote mapeado, sem contrato).
-- Migration: 20261008000000_prospect_location.sql
-- Spec: docs/specs/lote-mapeado-vitrine.md
--
-- O que este arquivo protege, em ordem de importância:
--   1. a FORMA da tabela, que é o ADR inteiro: sem checkout_mode, sem is_listed, sem
--      take_rate_bps, sem is_24h e sem NENHUMA FK apontando para cá. É o único teste que
--      falha no dia em que alguém "só adiciona uma coluninha" e reabre o estado impossível;
--   2. o slug único também contra location.slug, que não dá erro em lugar nenhum quando
--      colide: some a ficha e some a URL que tinha ranking;
--   3. a RLS, que precisa esconder rascunho E ficha convertida (a convertida virou
--      location e apareceria duas vezes na mesma busca).
--
-- Roda em transação com rollback.

begin;
select plan(24);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
-- Geo no Atlântico Sul para não colidir com destino do seed/baseline: nearest_destination
-- varre TODOS os destinos publicados num raio de 100 km, e o auto-fill precisa ser
-- determinístico.
do $$
declare
  ucust uuid := gen_random_uuid();   -- customer qualquer
  uadm  uuid := gen_random_uuid();   -- hub_admin
  dest  uuid := gen_random_uuid();
  cmp   uuid := gen_random_uuid();
  lviva uuid := gen_random_uuid();   -- unidade viva: o slug dela é proibido aqui
  lmort uuid := gen_random_uuid();   -- unidade soft-deletada: o slug dela está livre
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (ucust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','e017-cust@ex.com',now(),now()),
    (uadm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','e017-adm@ex.com', now(),now());
  -- `do update`, não `do nothing`: onde o trigger `on_auth_user_created` existe (o banco
  -- vivo tem; o stack local não, porque o dump do baseline não leva o schema `auth`) a
  -- linha já nasceu como `customer`, e um `do nothing` deixaria o admin sem o papel. O
  -- teste passaria verde aqui e falharia lá, medindo coisas diferentes nos dois lugares.
  insert into public.profiles(id, role) values
    (ucust,'customer'),(uadm,'hub_admin')
    on conflict (id) do update set role = excluded.role;

  insert into public.destination(id, code, name, slug, type, city, state, country, latitude, longitude, is_published)
  values (dest,'TE17','Destino E017','destino-e017','airport','Cidade','PE','BR',-50.0000,-30.0000,true);

  insert into public.company(id, name, slug) values (cmp,'Co Teste E017','co-teste-e017');
  insert into public.location(id, company_id, name, slug, latitude, longitude, destination_id)
  values (lviva, cmp, 'Unidade Viva E017', 'lote-e017-ocupado', -50.0005, -30.0005, dest);
  insert into public.location(id, company_id, name, slug, latitude, longitude, destination_id, deleted_at)
  values (lmort, cmp, 'Unidade Morta E017', 'lote-e017-morto', -50.0006, -30.0006, dest, now());

  -- rascunho, publicado e convertido: os três estados que a lista do admin precisa separar.
  insert into public.prospect_location(destination_id, name, slug, latitude, longitude, is_published)
  values
    (dest, 'Rascunho E017', 'e017-rascunho',  -50.0009, -30.0000, false),
    (dest, 'Publicado E017','e017-publicado', -50.0009, -30.0000, true);

  insert into public.prospect_location(
    destination_id, name, slug, latitude, longitude, is_published,
    converted_location_id, converted_at)
  values (dest,'Convertido E017','e017-convertido',-50.0009,-30.0000, true, lviva, now());

  perform set_config('test.uadm',  uadm::text,  false);
  perform set_config('test.dest',  dest::text,  false);
  perform set_config('test.lviva', lviva::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── 1. A forma da tabela é o ADR-010 ─────────────────────────────────────────
-- Estas quatro colunas são exatamente o que separa "lote que a Movepark mapeou" de
-- "unidade vendável". Se alguma aparecer aqui, o trigger que ninguém escreveu volta a
-- ser necessário, e o ADR foi decidido justamente para não precisar dele.
select hasnt_column('public','prospect_location','checkout_mode',
  'ADR-010: prospect_location NÃO tem checkout_mode');
select hasnt_column('public','prospect_location','is_listed',
  'ADR-010: prospect_location NÃO tem is_listed');
select hasnt_column('public','prospect_location','take_rate_bps',
  'ADR-010: prospect_location NÃO tem take_rate_bps');
select hasnt_column('public','prospect_location','is_24h',
  'ADR-010: prospect_location NÃO tem is_24h (horário que ninguém verificou não vira schema)');

-- Nenhuma tabela aponta para cá. É o que impede booking.location_id de nascer apontando
-- para lote sem contrato: quem precisar disso converte primeiro.
select is(
  (select count(*)::int from pg_constraint
    where contype = 'f' and confrelid = 'public.prospect_location'::regclass),
  0,
  'ADR-010: nenhuma FK aponta para prospect_location (booking, review, fare, payout_*)');

-- ── 2. Geo: coluna gerada + PostGIS (ADR-001) ────────────────────────────────
-- 0,0009 grau de latitude ≈ 100 m. A distância sai de ST_Distance na consulta; a única
-- coisa materializada é o ponto.
select ok(
  (select extensions.st_distance(p.geog, d.geog)
     from public.prospect_location p
     join public.destination d on d.id = p.destination_id
    where p.slug = 'e017-publicado') between 90 and 110,
  'geog gerada: ST_Distance até o destino dá ~100 m');

select ok(
  exists (select 1 from pg_index i
           join pg_class c on c.oid = i.indexrelid
           join pg_am am on am.oid = c.relam
          where i.indrelid = 'public.prospect_location'::regclass and am.amname = 'gist'),
  'índice GiST em geog (ADR-001: proximidade indexada, não calculada no front)');

-- ── 3. Sugestão de destino a partir da geo ───────────────────────────────────
insert into public.prospect_location(name, slug, latitude, longitude)
values ('Sem Destino E017','e017-sem-destino',-50.0011,-30.0011);

select is(
  (select destination_id from public.prospect_location where slug = 'e017-sem-destino'),
  current_setting('test.dest')::uuid,
  'insert sem destination_id cai no destino mais próximo (nearest_destination)');

-- ── 4. Slug: único aqui e único contra location ──────────────────────────────
select throws_ok(
  format($f$insert into public.prospect_location(destination_id, name, slug, latitude, longitude)
            values (%L,'Duplicado','e017-publicado',-50.0009,-30.0)$f$, current_setting('test.dest')),
  '23505', null,
  'slug duplicado na própria tabela é recusado');

select throws_ok(
  format($f$insert into public.prospect_location(destination_id, name, slug, latitude, longitude)
            values (%L,'Colide','lote-e017-ocupado',-50.0009,-30.0)$f$, current_setting('test.dest')),
  '23505', null,
  'slug que já pertence a uma location viva é recusado (a rota resolveria a location)');

select lives_ok(
  format($f$insert into public.prospect_location(destination_id, name, slug, latitude, longitude)
            values (%L,'Herdeira','lote-e017-morto',-50.0009,-30.0)$f$, current_setting('test.dest')),
  'slug de location soft-deletada está livre (E0.17-b devolve a URL para a ficha mapeada)');

-- ── 5. Constraints do resto ──────────────────────────────────────────────────
select throws_ok(
  format($f$insert into public.prospect_location(destination_id, name, slug, latitude, longitude, data_source)
            values (%L,'Fonte Ruim','e017-fonte-ruim',-50.0009,-30.0,'chute')$f$, current_setting('test.dest')),
  '23514', null,
  'data_source fora de manual/google_places/import_wp é recusado');

select throws_ok(
  format($f$insert into public.prospect_location(destination_id, name, slug, latitude, longitude, converted_location_id)
            values (%L,'Meia Conversao','e017-meia-conversao',-50.0009,-30.0,%L)$f$,
         current_setting('test.dest'), current_setting('test.lviva')),
  '23514', null,
  'apontar para uma location sem carimbar converted_at é recusado (a ficha ficaria visível)');

select throws_ok(
  format($f$insert into public.prospect_location(destination_id, name, slug, latitude, longitude, converted_location_id, converted_at)
            values (%L,'Segunda Ficha','e017-segunda-ficha',-50.0009,-30.0,%L,now())$f$,
         current_setting('test.dest'), current_setting('test.lviva')),
  '23505', null,
  'duas fichas não convertem para a mesma location (índice unique parcial)');

select lives_ok(
  format($f$insert into public.prospect_location(destination_id, name, slug, latitude, longitude)
            values (%L,'Nao Convertida A','e017-nao-convertida-a',-50.0009,-30.0)$f$, current_setting('test.dest')),
  'o índice parcial não bloqueia as fichas ainda não convertidas (converted_location_id null)');

-- ── 6. RLS: a vitrine anônima vê só o publicado e não convertido ─────────────
set local role anon;
select is(
  (select count(*)::int from public.prospect_location where slug = 'e017-rascunho'),
  0,
  'anon NÃO enxerga rascunho (is_published = false)');
select is(
  (select count(*)::int from public.prospect_location where slug = 'e017-publicado'),
  1,
  'anon enxerga ficha publicada');
select is(
  (select count(*)::int from public.prospect_location where slug = 'e017-convertido'),
  0,
  'anon NÃO enxerga ficha convertida (senão ela e a location apareceriam juntas)');
select throws_ok(
  format($f$insert into public.prospect_location(destination_id, name, slug, latitude, longitude)
            values (%L,'Hack','e017-hack',-50.0,-30.0)$f$, current_setting('test.dest')),
  '42501', null,
  'anon NÃO insere ficha (escrita é só de hub_admin)');

-- Q-021: o telefone é guardado e não exibido, e quem garante isso é o grant de coluna.
-- A RLS devolve a LINHA INTEIRA da ficha publicada, então sem este corte um `select=*`
-- com a anon key leria o número que a tela não mostra. RLS é por linha; coluna é grant.
select throws_ok(
  $$select phone from public.prospect_location where slug = 'e017-publicado'$$,
  '42501', null,
  'anon NÃO lê a coluna phone (Q-021: guardado, nunca exibido)');
select lives_ok(
  $$select name, address, slug, latitude, longitude, google_maps_url
      from public.prospect_location where slug = 'e017-publicado'$$,
  'anon lê as colunas que a página de destino renderiza');
reset role;

-- ── 7. hub_admin escreve e enxerga os três estados ───────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.uadm'));
select lives_ok(
  format($f$insert into public.prospect_location(destination_id, name, slug, latitude, longitude)
            values (%L,'Admin E017','e017-admin',-50.0009,-30.0)$f$, current_setting('test.dest')),
  'hub_admin insere ficha');
select is(
  (select count(*)::int from public.prospect_location where slug = 'e017-rascunho'),
  1,
  'hub_admin enxerga rascunho (é o que o painel do E0.17-h precisa)');
reset role;

-- ── 8. As funções-trigger não são RPC ────────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p
    where p.proname in ('prospect_location_set_destination','prospect_location_guard_slug')
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'as funções-trigger de prospect_location não são executáveis por anon nem authenticated');

select * from finish();
rollback;
