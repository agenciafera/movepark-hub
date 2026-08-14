-- pgTAP: E0.17-h · painel administrativo do lote mapeado (`prospect_location`).
-- Migration: 20261017090000_manager_prospect_location.sql
-- Spec: docs/specs/lote-mapeado-vitrine.md · ADR-010
--
-- O irmão `prospect_location.test.sql` protege a FORMA da tabela. Este protege as REGRAS
-- que a migration do painel colocou no servidor, em ordem de importância:
--
--   1. a permissão. As cinco RPCs são SECURITY DEFINER porque o grant de coluna de Q-021
--      esconde telefone e place_id até do hub_admin. Definer com gate furado devolve para
--      qualquer cliente logado exatamente o dado que a tabela nega, e nada na tela
--      denunciaria: a lista simplesmente responderia;
--   2. o gate de publicação, que é a regra de conteúdo do épico. Ele precisa valer nos
--      DOIS caminhos, a constraint (que pega o update na mão) e a RPC (que devolve a frase
--      para a tela), porque um sem o outro é gate pela metade;
--   3. a ficha convertida como somente leitura, que é o que impede a ficha e a unidade de
--      dessincronizarem depois que o parceiro já vê a unidade no painel dele;
--   4. o redirecionamento da URL convertida, o único caminho aberto a `anon` de propósito
--      (quem chama é o Cloudflare Worker, com a anon key). Sem ele a URL que tinha ranking
--      cai no fallback de SPA e responde 200 com o shell vazio, um soft 404.
--
-- Roda em transação com rollback.

begin;
select plan(45);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
-- Geo no Atlântico Sul, mesmo motivo do arquivo irmão: `nearest_destination` varre TODOS
-- os destinos publicados num raio de 100 km, e o auto-fill precisa ser determinístico.
-- Nenhum destino do seed chega perto de (-50, -30), então o que a precheck sugere aqui é
-- sempre o destino desta transação.
do $$
declare
  ucust  uuid := gen_random_uuid();   -- cliente logado qualquer
  uadm   uuid := gen_random_uuid();   -- hub_admin
  dest   uuid := gen_random_uuid();   -- destino do painel
  dest2  uuid := gen_random_uuid();   -- destino vizinho, para o filtro
  cmp    uuid := gen_random_uuid();
  lviva  uuid := gen_random_uuid();   -- unidade viva: colide place_id e slug
  llist  uuid := gen_random_uuid();   -- unidade LISTADA, com tipo de vaga ativo
  lnlist uuid := gen_random_uuid();   -- unidade convertida que ainda não foi publicada
  ptipo  uuid := gen_random_uuid();
  cptipo uuid := gen_random_uuid();
  draft  uuid := gen_random_uuid();
  pub    uuid := gen_random_uuid();
  conv   uuid := gen_random_uuid();
  convl  uuid := gen_random_uuid();
  semend uuid := gen_random_uuid();
  apagar uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (ucust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','e17h-cust@ex.com',now(),now()),
    (uadm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','e17h-adm@ex.com', now(),now());
  -- `do update`, não `do nothing`: onde o trigger `on_auth_user_created` existe (o banco
  -- vivo tem; o stack local não, porque o dump do baseline não leva o schema `auth`) a
  -- linha já nasceu como `customer`, e um `do nothing` deixaria o admin sem o papel. O
  -- arquivo passaria verde aqui e mediria outra coisa lá.
  insert into public.profiles(id, role) values
    (ucust,'customer'),(uadm,'hub_admin')
    on conflict (id) do update set role = excluded.role;

  insert into public.destination(id, code, name, slug, type, city, state, country, latitude, longitude, is_published)
  values
    (dest, 'X17H','Destino E17H','destino-e17h','airport','Cidade','PE','BR',-50.0000,-30.0000,true),
    (dest2,'Y17H','Destino E17H Dois','destino-e17h-dois','airport','Cidade','PE','BR',-45.0000,-25.0000,true);

  insert into public.company(id, name, slug) values (cmp,'Co E17H','co-e17h');

  -- Unidade viva com place_id: é o caso de parceiro ativo, o que o painel precisa avisar
  -- antes de alguém mapear de novo quem já é cliente (D-009).
  insert into public.location(id, company_id, name, slug, latitude, longitude, destination_id, google_place_id)
  values (lviva, cmp,'Unidade Viva E17H','unidade-e17h-viva',-50.0005,-30.0005, dest,'PLACE-E17H-VIVA');

  -- Unidade LISTADA: `is_listed` só sobrevive ao gate de foto com pelo menos uma foto.
  insert into public.location(id, company_id, name, slug, latitude, longitude, destination_id, is_listed, photos)
  values (llist, cmp,'Unidade Listada E17H','unidade-e17h-listada',-50.0007,-30.0007, dest, true,
          '["https://img.example/e17h.jpg"]'::jsonb);

  -- Converter não publica oferta: a unidade nasce sem foto, sem tipo de vaga e não listada.
  insert into public.location(id, company_id, name, slug, latitude, longitude, destination_id)
  values (lnlist, cmp,'Unidade Nao Listada E17H','unidade-e17h-nao-listada',-50.0008,-30.0008, dest);

  insert into public.parking_type(id, code, name) values (ptipo,'e17h_coberta','E17H Coberta');
  insert into public.company_parking_type(id, company_id, parking_type_id, base_price, default_capacity)
  values (cptipo, cmp, ptipo, 40, 10);
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
  values (llist, cptipo, 10, true);

  -- Rascunho SEM endereço de propósito: as ações de linha (notificado, revisado) precisam
  -- funcionar numa ficha que ainda não pode ser publicada.
  insert into public.prospect_location(id, destination_id, name, slug, latitude, longitude, is_published)
  values (draft, dest,'Rascunho E17H','e17h-rascunho',-50.0009,-30.0000,false);

  -- Publicada, com telefone e com o place_id da unidade viva: é a linha que exercita o
  -- aviso de colisão e as duas colunas que o grant de coluna esconde.
  insert into public.prospect_location(id, destination_id, name, slug, address, phone, latitude, longitude,
                                       google_place_id, is_published)
  values (pub, dest,'Publicado E17H','e17h-publicado','Rua Publicada, 100','+5581999990002',
          -50.0009,-30.0000,'PLACE-E17H-VIVA',true);

  insert into public.prospect_location(id, destination_id, name, slug, address, latitude, longitude,
                                       is_published, converted_location_id, converted_at)
  values
    (conv,  dest,'Convertido E17H','e17h-convertido','Rua Convertida, 200',
     -50.0009,-30.0000,true, lnlist, now()),
    (convl, dest,'Convertido Listado E17H','e17h-convertido-listado','Rua Convertida, 300',
     -50.0009,-30.0000,true, llist,  now());

  insert into public.prospect_location(id, destination_id, name, slug, latitude, longitude, is_published)
  values
    (semend, dest,'Sem Endereco E17H','e17h-sem-endereco',-50.0009,-30.0000,false),
    (apagar, dest,'Para Apagar E17H','e17h-para-apagar', -50.0009,-30.0000,false);

  -- Vizinho do outro destino (filtro) e um lote a ~2 km (fora do raio de 150 m da precheck).
  insert into public.prospect_location(destination_id, name, slug, latitude, longitude, is_published)
  values
    (dest2,'Outro Destino E17H','e17h-outro-destino',-45.0009,-25.0000,false),
    (dest, 'Longe E17H','e17h-longe',-50.0200,-30.0000,false);

  perform set_config('test.ucust',  ucust::text,  false);
  perform set_config('test.uadm',   uadm::text,   false);
  perform set_config('test.dest',   dest::text,   false);
  perform set_config('test.dest2',  dest2::text,  false);
  perform set_config('test.draft',  draft::text,  false);
  perform set_config('test.conv',   conv::text,   false);
  perform set_config('test.semend', semend::text, false);
  perform set_config('test.apagar', apagar::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- O gate das RPCs é `is_hub_admin()`, que lê o JWT, não o papel do Postgres. Daqui até o
-- bloco 8 quem fala é o admin.
select pg_temp.as_user(current_setting('test.uadm'));

-- ── 1. Permissão ─────────────────────────────────────────────────────────────
-- As duas primeiras asserções são agregadas de propósito: elas enxergam a função criada
-- amanhã. Função nova no schema `public` nasce com EXECUTE para anon e authenticated por
-- default privilege, e `grant ... to authenticated` no fim da migration NÃO desfaz isso.
-- Se um dia a família ganhar uma sexta RPC, a contagem falha e obriga a decisão explícita.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'manager\_prospect\_location%'
      and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'nenhuma manager_prospect_location* é executável por anon (a anon key vai no bundle do front)');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'manager\_prospect\_location%'
      and has_function_privilege('authenticated', p.oid, 'execute')),
  5,
  'as cinco RPCs do painel são executáveis por authenticated (quem separa admin de cliente é o gate)');

-- A exceção deliberada: quem chama é o Worker, com a anon key. Fechar isto devolve soft 404
-- na URL que tinha ranking.
select ok(
  has_function_privilege('anon', 'public.prospect_redirect_target(text, text)', 'execute'),
  'anon MANTÉM execute em prospect_redirect_target (é o Worker redirecionando a ficha convertida)');

-- Cliente logado alcança a função (o grant é para `authenticated`), e é o gate que recusa.
-- Recusa em vez de lista vazia: vazio por falta de permissão se disfarça de "não há lote
-- mapeado", que é a leitura errada numa tela de curadoria.
set local role authenticated;
select pg_temp.as_user(current_setting('test.ucust'));

select throws_ok(
  $$select * from public.manager_prospect_locations()$$,
  '42501', null,
  'customer NÃO lista lotes mapeados (recusa, não lista vazia)');

select throws_ok(
  $$select public.manager_prospect_location_precheck(p_latitude => -50.0009, p_longitude => -30.0000)$$,
  '42501', null,
  'customer NÃO roda a pré-checagem do formulário');

select throws_ok(
  $$select public.manager_prospect_location_save(
      p_id => null::uuid, p_name => 'Invasor', p_slug => 'e17h-invasor',
      p_latitude => -50.0009, p_longitude => -30.0000)$$,
  '42501', null,
  'customer NÃO cria lote mapeado');

select throws_ok(
  format($$select public.manager_prospect_location_set_state(%L::uuid, p_notified => true)$$,
         current_setting('test.draft')),
  '42501', null,
  'customer NÃO muda o estado de um lote mapeado');

select throws_ok(
  format($$select public.manager_prospect_location_delete(%L::uuid)$$, current_setting('test.draft')),
  '42501', null,
  'customer NÃO exclui lote mapeado');

reset role;
select pg_temp.as_user(current_setting('test.uadm'));

-- ── 2. A lista do painel ─────────────────────────────────────────────────────
-- Tudo filtrado pelo destino desta transação: as fichas do piloto (migration 20261010) e
-- qualquer carga futura moram em outro destino, e uma contagem global envelheceria sozinha.
select is(
  (select count(*)::int from public.manager_prospect_locations(current_setting('test.dest')::uuid)
    where slug in ('e17h-rascunho','e17h-publicado','e17h-convertido')),
  3,
  'hub_admin enxerga rascunho, publicada e convertida na mesma lista');

select is(
  (select state from public.manager_prospect_locations(current_setting('test.dest')::uuid)
    where slug = 'e17h-rascunho'),
  'draft',
  'state derivado: ficha não publicada é draft');

select is(
  (select state from public.manager_prospect_locations(current_setting('test.dest')::uuid)
    where slug = 'e17h-publicado'),
  'published',
  'state derivado: ficha publicada e não convertida é published');

-- A convertida tem `is_published = true` também. Se a ordem do CASE invertesse, ela viraria
-- "published" e a curadoria perderia de vista justamente o que não se edita mais.
select is(
  (select state from public.manager_prospect_locations(current_setting('test.dest')::uuid)
    where slug = 'e17h-convertido'),
  'converted',
  'state derivado: converted ganha de published (a conversão manda)');

select set_eq(
  format($$select slug::text
             from public.manager_prospect_locations(p_destination_id => %L::uuid, p_state => 'published')$$,
         current_setting('test.dest')),
  array['e17h-publicado'],
  'filtro p_state=published traz só a publicada e não convertida');

select set_eq(
  format($$select slug::text from public.manager_prospect_locations(%L::uuid)$$,
         current_setting('test.dest2')),
  array['e17h-outro-destino'],
  'filtro por destino devolve só as fichas daquele aeroporto');

select set_eq(
  format($$select slug::text
             from public.manager_prospect_locations(p_destination_id => %L::uuid, p_search => 'Publicado')$$,
         current_setting('test.dest')),
  array['e17h-publicado'],
  'busca por nome devolve só a ficha que casa');

select is(
  (select place_id_conflict_name from public.manager_prospect_locations(current_setting('test.dest')::uuid)
    where slug = 'e17h-publicado'),
  'Unidade Viva E17H',
  'place_id repetido em unidade viva é sinalizado com o nome dela (parceiro ativo, não mapear)');

select is(
  (select place_id_conflict_name from public.manager_prospect_locations(current_setting('test.dest')::uuid)
    where slug = 'e17h-rascunho'),
  null::text,
  'sem place_id não há colisão inventada');

-- O motivo de a RPC ser definer, medido como o painel mede: papel `authenticated`, com o
-- JWT do admin. As duas colunas abaixo são ilegíveis na tabela crua (grant de coluna de
-- Q-021) e chegam pela função.
set local role authenticated;

select is(
  (select phone from public.manager_prospect_locations(current_setting('test.dest')::uuid)
    where slug = 'e17h-publicado'),
  '+5581999990002',
  'a lista do painel inclui o telefone, que a tabela nega');

select is(
  (select google_place_id from public.manager_prospect_locations(current_setting('test.dest')::uuid)
    where slug = 'e17h-publicado'),
  'PLACE-E17H-VIVA',
  'a lista do painel inclui o google_place_id, que a tabela hoje também concede a anon/authenticated (migration de avaliações)');

select throws_ok(
  $$select phone from public.prospect_location where slug = 'e17h-publicado'$$,
  '42501', null,
  'o MESMO hub_admin não lê phone direto da tabela: é o grant de coluna, e é por isso que a RPC é definer');

reset role;

-- ── 3. Gate de publicação: sem endereço não publica ──────────────────────────
-- A constraint pega o caminho que nenhuma RPC cobre (o update na mão, o script de carga).
select throws_ok(
  format($$update public.prospect_location set is_published = true where id = %L$$,
         current_setting('test.semend')),
  '23514', null,
  'constraint recusa publicar ficha sem endereço, inclusive por update direto');

-- A RPC repete a regra para a tela receber a frase em vez do texto do Postgres.
select throws_ok(
  format($$select public.manager_prospect_location_set_state(%L::uuid, p_is_published => true)$$,
         current_setting('test.semend')),
  'P0001', null,
  'set_state recusa publicar sem endereço, com erro de domínio e não de constraint');

select throws_ok(
  format($$select public.manager_prospect_location_save(
      p_id => %L::uuid, p_name => 'Sem Endereco E17H', p_slug => 'e17h-sem-endereco',
      p_latitude => -50.0009, p_longitude => -30.0000, p_is_published => true)$$,
         current_setting('test.semend')),
  'P0001', null,
  'save recusa publicar sem endereço');

select lives_ok(
  format($$select public.manager_prospect_location_save(
      p_id => %L::uuid, p_name => 'Sem Endereco E17H', p_slug => 'e17h-sem-endereco',
      p_latitude => -50.0009, p_longitude => -30.0000,
      p_address => 'Rua do Endereco, 42', p_is_published => true)$$,
         current_setting('test.semend')),
  'com endereço, o save publica');

select is(
  (select is_published from public.prospect_location where id = current_setting('test.semend')::uuid),
  true,
  'a publicação persistiu (o gate era o endereço, não a publicação)');

-- ── 4. Ficha convertida é somente leitura ────────────────────────────────────
-- Editar depois da conversão dessincroniza do que o parceiro já vê no painel dele, e
-- apagar joga fora a procedência, que é o número que responde se o épico valeu.
select throws_ok(
  format($$select public.manager_prospect_location_save(
      p_id => %L::uuid, p_name => 'Convertido E17H', p_slug => 'e17h-convertido',
      p_latitude => -50.0009, p_longitude => -30.0000)$$, current_setting('test.conv')),
  'P0001', null,
  'save recusa editar ficha já convertida');

select throws_ok(
  format($$select public.manager_prospect_location_set_state(%L::uuid, p_reviewed => true)$$,
         current_setting('test.conv')),
  'P0001', null,
  'set_state recusa mexer em ficha já convertida');

select throws_ok(
  format($$select public.manager_prospect_location_delete(%L::uuid)$$, current_setting('test.conv')),
  'P0001', null,
  'delete recusa ficha convertida (apagá-la joga fora a procedência)');

-- ── 5. Ações de linha: tri-estado, `null` não mexe ───────────────────────────
-- A ficha aqui é o rascunho SEM endereço: marcar notificado não pode esbarrar no gate de
-- publicação, senão a curadoria não consegue registrar o contato antes de completar o dado.
select public.manager_prospect_location_set_state(current_setting('test.draft')::uuid, p_notified => true);
select isnt(
  (select notified_owner_at from public.prospect_location where id = current_setting('test.draft')::uuid),
  null::timestamptz,
  'p_notified => true carimba notified_owner_at');

select public.manager_prospect_location_set_state(current_setting('test.draft')::uuid, p_reviewed => true);
select isnt(
  (select notified_owner_at from public.prospect_location where id = current_setting('test.draft')::uuid),
  null::timestamptz,
  'p_notified => null não mexe no carimbo que já existia');
select isnt(
  (select last_reviewed_at from public.prospect_location where id = current_setting('test.draft')::uuid),
  null::timestamptz,
  'p_reviewed => true carimba last_reviewed_at');

select public.manager_prospect_location_set_state(current_setting('test.draft')::uuid, p_notified => false);
select is(
  (select notified_owner_at from public.prospect_location where id = current_setting('test.draft')::uuid),
  null::timestamptz,
  'p_notified => false zera notified_owner_at (desmarcar é possível)');
select isnt(
  (select last_reviewed_at from public.prospect_location where id = current_setting('test.draft')::uuid),
  null::timestamptz,
  'p_reviewed => null não mexe no carimbo de revisão');

select public.manager_prospect_location_set_state(current_setting('test.draft')::uuid, p_reviewed => false);
select is(
  (select last_reviewed_at from public.prospect_location where id = current_setting('test.draft')::uuid),
  null::timestamptz,
  'p_reviewed => false zera last_reviewed_at');

-- ── 6. Excluir é delete de verdade ───────────────────────────────────────────
-- Sem FK transacional apontando para cá, a exclusão pode ser real (ADR-010). Soft delete
-- deixaria o slug ocupado e a URL inalcançável para sempre.
select lives_ok(
  format($$select public.manager_prospect_location_delete(%L::uuid)$$, current_setting('test.apagar')),
  'hub_admin exclui ficha não convertida');

select is(
  (select count(*)::int from public.prospect_location where id = current_setting('test.apagar')::uuid),
  0,
  'a ficha sai da tabela de verdade, não vira linha marcada');

-- ── 7. Pré-checagem do formulário: avisa, não decide ─────────────────────────
select is(
  (public.manager_prospect_location_precheck(p_latitude => -50.0009, p_longitude => -30.0000)
     -> 'suggested_destination' ->> 'id')::uuid,
  current_setting('test.dest')::uuid,
  'precheck sugere o destino pela geo, o mesmo caminho do trigger');

select is(
  public.manager_prospect_location_precheck(
    p_latitude => -50.0009, p_longitude => -30.0000, p_google_place_id => 'PLACE-E17H-VIVA'
  ) -> 'place_id_conflict',
  jsonb_build_object('kind','location','name','Unidade Viva E17H'),
  'place_id de unidade viva é avisado como parceiro ativo, com o nome dela');

select is(
  public.manager_prospect_location_precheck(
    p_latitude => -50.0009, p_longitude => -30.0000, p_slug => 'unidade-e17h-viva'
  ) -> 'slug_conflict',
  jsonb_build_object('kind','location','name','Unidade Viva E17H'),
  'slug que já é de unidade viva é avisado antes do submit (o trigger recusaria só na gravação)');

-- Vizinhança de 150 m. Dois lotes vizinhos existem de verdade em aeroporto, então isto é
-- aviso e não bloqueio: o teste mede o raio, não uma recusa.
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.manager_prospect_location_precheck(p_latitude => -50.0009, p_longitude => -30.0000) -> 'nearby'
    ) as viz(item) where item ->> 'name' = 'Unidade Viva E17H'),
  'nearby traz o vizinho a menos de 150 m');

select ok(
  not exists (
    select 1 from jsonb_array_elements(
      public.manager_prospect_location_precheck(p_latitude => -50.0009, p_longitude => -30.0000) -> 'nearby'
    ) as viz(item) where item ->> 'name' = 'Longe E17H'),
  'nearby não traz o lote a ~2 km (o raio é 150 m, não "tudo do aeroporto")');

-- ── 8. Para onde a URL da ficha convertida aponta (E0.17-i) ──────────────────
select is(
  (select count(*)::int from public.prospect_redirect_target('destino-e17h','e17h-publicado')),
  0,
  'ficha ainda não convertida não redireciona: zero linhas, e o Worker segue servindo a página');

-- Enquanto a unidade não está listada (converter não publica oferta), o destino é a página
-- do destino e o redirecionamento é TEMPORÁRIO: marcar 301 para um endereço de passagem
-- cravaria no cache do navegador e do Google um destino que ainda vai mudar.
select results_eq(
  $$select target, permanent from public.prospect_redirect_target('destino-e17h','e17h-convertido')$$,
  $$values ('/destinos/destino-e17h'::text, false)$$,
  'unidade convertida e não listada: cai no destino, e o redirecionamento é temporário');

select results_eq(
  $$select target, permanent from public.prospect_redirect_target('destino-e17h','e17h-convertido-listado')$$,
  $$values ('/p/co-e17h/unidade-e17h-listada/e17h_coberta'::text, true)$$,
  'unidade listada com tipo de vaga ativo: vai para a single, e aí sim o redirecionamento é permanente');

-- E o Worker consulta sem sessão nenhuma. A RLS esconde ficha convertida de quem tem a anon
-- key, e é a função definer que atravessa isso para devolver só a URL pública da unidade.
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  (select target from public.prospect_redirect_target('destino-e17h','e17h-convertido')),
  '/destinos/destino-e17h',
  'anon (o Worker) enxerga a ficha convertida que a RLS esconde dele, e só a URL pública');
reset role;

select * from finish();
rollback;
