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
select plan(36);

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

-- Quem aponta para cá é lista EXATA, e o que ela protege é a regra do ADR-010: nenhuma
-- tabela TRANSACIONAL (booking, review, fare, payout_*) pode se ligar a um lote sem
-- contrato. Quem precisar disso converte primeiro.
--
-- `company_onboarding` entra porque é o oposto de transacional: é o lead, a mesma fase
-- pré-contrato do próprio lote mapeado, e ele guarda de qual ficha a reivindicação partiu
-- (E0.17-g). Uma entrada nova aqui é uma decisão de arquitetura, não um detalhe de
-- implementação, e é por isso que a lista é exata em vez de um teto.
select set_eq(
  $$ select c.conrelid::regclass::text
       from pg_constraint c
      where c.contype = 'f' and c.confrelid = 'public.prospect_location'::regclass $$,
  array['company_onboarding'],
  'ADR-010: só o lead aponta para prospect_location, e nenhuma tabela transacional');

-- E a FK que existe não pode custar a exclusão. "Excluir é delete de verdade" é uma
-- propriedade que o ADR-010 comprou de propósito (a URL tinha ranking, e apagar uma ficha
-- errada precisa ser possível); uma FK sem `on delete set null` transformaria isso em
-- "não dá para excluir enquanto houver lead".
select is(
  (select count(*)::int from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'public.prospect_location'::regclass
      and c.confdeltype <> 'n'),
  0,
  'toda FK que aponta para cá é ON DELETE SET NULL: excluir a ficha segue possível');

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

-- ── 8. destination_prospect_cards: a seção de baixo da página de destino ─────
-- A RPC é `security invoker` de propósito. Se alguém a promover a definer para "resolver"
-- alguma coisa, ela passa a contornar o grant de coluna e o telefone volta para a vitrine
-- sem ninguém perceber, porque a tela não mostra e o JSON sim.
select is(
  (select count(*)::int from public.destination_prospect_cards('destino-e017')),
  1,
  'RPC devolve só a ficha publicada e não convertida (1 de 7 no destino)');
select is(
  (select slug from public.destination_prospect_cards('destino-e017')),
  'e017-publicado',
  'RPC devolve a ficha certa: nem rascunho, nem convertida');
select ok(
  (select distance_km from public.destination_prospect_cards('destino-e017')) between 0.09 and 0.11,
  'RPC calcula a distância por ST_Distance (~0,1 km), no mesmo round do card vendável');
select is(
  (select position('phone' in pg_get_function_result(
     'public.destination_prospect_cards(text)'::regprocedure))::int),
  0,
  'o retorno da RPC não tem telefone (Q-021: nem por engano num select novo)');

set local role anon;
select is(
  (select count(*)::int from public.destination_prospect_cards('destino-e017')),
  1,
  'anon chama a RPC e enxerga a ficha publicada');
reset role;

-- ── 9. A reivindicação carrega a referência e carimba a procedência (E0.17-g) ─
-- Este bloco é o que impede o pior estado do épico: a ficha mapeada e a unidade nova
-- renderizando as duas, disputando a mesma busca. O filtro `converted_at is null` da RLS
-- só protege se alguém escrever o carimbo, e quem escreve é o `onboarding_upsert_location`.
do $$
declare
  v_company uuid; v_location uuid;
begin
  insert into public.prospect_location(destination_id, name, slug, address, latitude, longitude, is_published)
  values (current_setting('test.dest')::uuid, 'Lote Claim', 'e017-lote-claim', 'Rua Claim, 1',
          -50.0009, -30.0000, true);

  perform set_config('test.claim',
    (select id::text from public.prospect_location where slug = 'e017-lote-claim'), false);

  -- O lead nasce da página do lote, com a referência.
  select public.submit_partner_lead(
    'Lote Claim', 'Fulano', 'e017-claim@ex.com', '+5511999999999',
    null, null, null, null, 10, null, null, null, null, null,
    current_setting('test.claim')::uuid) into v_company;
  perform set_config('test.claim_company', v_company::text, false);

  -- O board aprova e o dono entra: é o que destrava o wizard.
  update public.company set onboarding_status = 'approved' where id = v_company;
  insert into public.profile_company(profile_id, company_id, role)
  values (current_setting('test.uadm')::uuid, v_company, 'owner');
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.uadm'))::text, false);

  select public.onboarding_upsert_location(
    v_company, null, 'Lote Claim', 'Rua Claim, 1', -50.0009, -30.0000,
    'America/Sao_Paulo', null, null, null, '[]'::jsonb,
    current_setting('test.dest')::uuid, false) into v_location;
  perform set_config('test.claim_location', v_location::text, false);
end $$;

select is(
  (select prospect_location_id from public.company_onboarding
    where company_id = current_setting('test.claim_company')::uuid),
  current_setting('test.claim')::uuid,
  'o lead guarda de qual lote mapeado a reivindicação partiu');

select is(
  (select converted_location_id from public.prospect_location
    where id = current_setting('test.claim')::uuid),
  current_setting('test.claim_location')::uuid,
  'a unidade nascendo carimba a procedência na ficha');

select isnt(
  (select converted_at from public.prospect_location where id = current_setting('test.claim')::uuid),
  null,
  'o carimbo vem com data (é o `converted_at` que tira a ficha da vitrine)');

select is(
  (select count(*)::int from public.destination_prospect_cards('destino-e017')
    where slug = 'e017-lote-claim'),
  0,
  'a ficha convertida some da página de destino: não concorre com a unidade nova');

-- Converter NÃO publica oferta. A unidade nasce inativa e sem tipo de vaga; quem publica
-- é o `onboarding_publish`, depois de preço e capacidade.
select is(
  (select status::text from public.location where id = current_setting('test.claim_location')::uuid),
  'inactive',
  'converter não publica oferta: a unidade nasce inativa');

-- Referência que não resolve é descartada, e o lead segue. Perder atribuição é aceitável;
-- recusar um parceiro real por causa de um parâmetro de URL não é.
do $$
declare v_company uuid;
begin
  select public.submit_partner_lead(
    'Sem Referencia', 'Beltrano', 'e017-semref@ex.com', '+5511988888888',
    null, null, null, null, 10, null, null, null, null, null,
    '00000000-0000-4000-8000-0000000000ee'::uuid) into v_company;
  perform set_config('test.semref_company', v_company::text, false);
end $$;

select ok(
  (select prospect_location_id is null from public.company_onboarding
    where company_id = current_setting('test.semref_company')::uuid),
  'uuid que não existe não vira referência, e o lead entra assim mesmo');

-- ── 10. As funções-trigger não são RPC ───────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p
    where p.proname in ('prospect_location_set_destination','prospect_location_guard_slug')
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'as funções-trigger de prospect_location não são executáveis por anon nem authenticated');

select * from finish();
rollback;
