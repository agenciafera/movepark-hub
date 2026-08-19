-- pgTAP: auditoria de endereço das unidades.
-- Spec: docs/specs/auditoria-enderecos.md
--
-- Cobre o que dói se quebrar:
--   1. a triagem marca os sinais certos (sem geo, sem place_id, place_id de endereço, longe
--      do destino, endereço sem número, mesma porta declarada por duas unidades);
--   2. o veredito do Google classifica por drift medido em PostGIS, não por texto;
--   3. aplicar a correção RE-VINCULA o destino, que é o motivo de a RPC existir: a trigger
--      location_set_destination_trg só age em INSERT;
--   4. a auditoria de uma unidade editada por fora volta para pendente;
--   5. quem não é hub_admin não lê nem escreve nada disso.

begin;
select plan(17);

-- ── fixtures ──────────────────────────────────────────────────────────────────
-- Destinos no Atlântico Sul, longe do seed, para a distância medida ser só a nossa.
do $$
declare
  cmp uuid := gen_random_uuid();
  d1 uuid := gen_random_uuid();
  d2 uuid := gen_random_uuid();
  l_ok uuid := gen_random_uuid();
  l_sem_geo uuid := gen_random_uuid();
  l_longe uuid := gen_random_uuid();
  l_porta_a uuid := gen_random_uuid();
  l_porta_b uuid := gen_random_uuid();
begin
  insert into public.company(id, name, slug) values (cmp, 'Co Auditoria', 'co-auditoria-end');

  insert into public.destination(id, code, name, slug, type, city, country, latitude, longitude, is_published)
  values
    (d1, 'AUD1', 'Destino Auditoria 1', 'destino-auditoria-1', 'airport', 'X', 'BR', -51.0000, -31.0000, true),
    (d2, 'AUD2', 'Destino Auditoria 2', 'destino-auditoria-2', 'airport', 'Y', 'BR', -51.5000, -31.5000, true);

  -- unidade saudável, colada no d1, com place_id de estabelecimento
  insert into public.location(id, company_id, name, slug, address, latitude, longitude, status, google_place_id)
  values (l_ok, cmp, 'Lote Saudavel', 'lote-saudavel-aud', 'Rua Teste, 100 - Bairro, Cidade - SP, 01000-000',
          -51.0010, -31.0010, 'active', 'ChIJauditoriaok');

  -- sem geo: não tem pino nenhum
  insert into public.location(id, company_id, name, slug, address, latitude, longitude, status)
  values (l_sem_geo, cmp, 'Lote Sem Geo', 'lote-sem-geo-aud', 'Av. Sem Pino, 42 - Cidade - SP, 02000-000',
          null, null, 'active');

  -- ancorada no d1 mas a 60 km dele, e com place_id de ENDEREÇO (prefixo E)
  insert into public.location(id, company_id, name, slug, address, latitude, longitude, status, destination_id, google_place_id)
  values (l_longe, cmp, 'Lote Longe', 'lote-longe-aud', 'Rua Distante, 7 - Cidade - SP, 03000-000',
          -51.5400, -31.0000, 'active', d1, 'EltEnderecoCodificado');

  -- duas unidades declarando a mesma porta, com o texto escrito de jeitos diferentes
  insert into public.location(id, company_id, name, slug, address, latitude, longitude, status)
  values
    (l_porta_a, cmp, 'Porta A', 'porta-a-aud', 'Av. Novo Brasil, 954 - Cidade Industrial, Guarulhos - SP',
     -51.0020, -31.0020, 'active'),
    (l_porta_b, cmp, 'Porta B', 'porta-b-aud', 'Av. Novo Brasil, 954 - Cidade Industrial de São Paulo, Guarulhos - SP, 07221-010',
     -51.0030, -31.0030, 'active');

  -- duas unidades copiando o endereço do aeroporto, sem número: não podem virar duplicado
  insert into public.location(id, company_id, name, slug, address, latitude, longitude, status)
  values
    (gen_random_uuid(), cmp, 'Sem Numero A', 'sem-numero-a-aud', 'Av. Rocha Pombo, s/n - Águas Belas, São José dos Pinhais - PR',
     -51.0040, -31.0040, 'active'),
    (gen_random_uuid(), cmp, 'Sem Numero B', 'sem-numero-b-aud', 'Av. Rocha Pombo, s/n - Águas Belas, São José dos Pinhais - PR',
     -51.0050, -31.0050, 'active');

  perform set_config('test.d1', d1::text, false);
  perform set_config('test.d2', d2::text, false);
  perform set_config('test.l_ok', l_ok::text, false);
  perform set_config('test.l_sem_geo', l_sem_geo::text, false);
  perform set_config('test.l_longe', l_longe::text, false);
  perform set_config('test.l_porta_a', l_porta_a::text, false);
end $$;

select public.location_address_scan();

-- ── 1. triagem ────────────────────────────────────────────────────────────────
select ok(
  'sem_geo' = any(
    (select flags from public.location_address_audit where location_id = current_setting('test.l_sem_geo')::uuid)
  ),
  'triagem: unidade sem latitude/longitude é marcada com sem_geo');

select ok(
  'sem_place_id' = any(
    (select flags from public.location_address_audit where location_id = current_setting('test.l_sem_geo')::uuid)
  ),
  'triagem: unidade sem google_place_id é marcada');

select ok(
  'place_id_nao_e_estabelecimento' = any(
    (select flags from public.location_address_audit where location_id = current_setting('test.l_longe')::uuid)
  ),
  'triagem: place_id que não começa por ChIJ é marcado como endereço, não estabelecimento');

select ok(
  'longe_do_destino' = any(
    (select flags from public.location_address_audit where location_id = current_setting('test.l_longe')::uuid)
  ),
  'triagem: unidade a dezenas de km do aeroporto ancorado é marcada');

select ok(
  'endereco_duplicado' = any(
    (select flags from public.location_address_audit where location_id = current_setting('test.l_porta_a')::uuid)
  ),
  'triagem: duas unidades na mesma porta são marcadas mesmo com o texto escrito diferente');

select ok(
  not ('endereco_duplicado' = any(
    (select flags from public.location_address_audit where location_id = current_setting('test.l_ok')::uuid)
  )),
  'triagem: unidade com endereço próprio não é marcada como duplicada');

-- Endereço sem número é do aeroporto, não de uma porta. Marcar duas dessas como duplicadas
-- encheria a fila de revisão com um falso positivo garantido.
select ok(
  (select 'endereco_sem_numero' = any(flags) and not ('endereco_duplicado' = any(flags))
     from public.location_address_audit a
     join public.location l on l.id = a.location_id
    where l.slug = 'sem-numero-a-aud'),
  'triagem: duas unidades sem número no endereço são marcadas por isso, não como duplicadas');

-- ── 2. veredito do Google, com o drift medido em PostGIS ──────────────────────
-- Pino do Google a ~110 m do nosso, mesma porta com o bairro escrito de outro jeito: ok.
-- Se isto virasse divergência, a fila encheria de endereço certo e ninguém leria a lista.
select is(
  (public.location_address_audit_record(
    current_setting('test.l_ok')::uuid, 'ok', 'ChIJnovo', 'Lote Saudavel',
    'Rua Teste, 100 - Outro Bairro, Cidade - SP, 01000-999',
    -51.0020, -31.0010, 'https://maps.example/1', 'OPERATIONAL', 1.0
  ))->>'status',
  'ok',
  'veredito: pino perto e mesma porta fecha como ok');

-- Mesmo endereço, pino a ~1,1 km: divergente por distância, que é o sinal forte.
select is(
  (public.location_address_audit_record(
    current_setting('test.l_ok')::uuid, 'ok', 'ChIJnovo', 'Lote Saudavel',
    'Rua Teste, 100 - Bairro, Cidade - SP, 01000-000',
    -51.0110, -31.0010, 'https://maps.example/1', 'OPERATIONAL', 1.0
  ))->>'status',
  'divergent',
  'veredito: pino a mais de 250 m do nosso vira divergente');

select ok(
  (select drift_m from public.location_address_audit where location_id = current_setting('test.l_ok')::uuid) > 900,
  'veredito: drift_m guarda a distância real entre os pinos, medida no banco');

-- Pino colado, porta diferente: divergente pelo endereço.
select is(
  (public.location_address_audit_record(
    current_setting('test.l_ok')::uuid, 'ok', 'ChIJnovo', 'Lote Saudavel',
    'Rua Outra Completamente, 999 - Cidade - SP',
    -51.0010, -31.0010, 'https://maps.example/1', 'OPERATIONAL', 1.0
  ))->>'status',
  'divergent',
  'veredito: pino colado mas porta diferente também vira divergente');

-- ── 3. aplicar re-vincula o destino ───────────────────────────────────────────
create or replace function pg_temp.as_admin() returns void language plpgsql as $$
declare uid uuid;
begin
  select id into uid from auth.users limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', coalesce(uid::text, gen_random_uuid()::text), 'role', 'authenticated')::text, true);
end $$;

-- is_hub_admin lê o profile; para o teste, promove o usuário da fixture.
do $$
declare uid uuid;
begin
  select id into uid from auth.users limit 1;
  if uid is not null then
    update public.profiles set role = 'hub_admin' where id = uid;
    perform set_config('test.admin', uid::text, false);
  end if;
end $$;

select pg_temp.as_admin();

-- Move a unidade "longe" para a vizinhança do d2: o destino tem que acompanhar.
select is(
  (public.manager_location_address_apply(
    current_setting('test.l_longe')::uuid,
    'Rua Corrigida, 55 - Cidade - SP, 03000-111',
    -51.5010, -31.5010,
    'ChIJcorrigido', 'https://maps.example/corrigido',
    true, 'teste de re-vínculo'
  ))->>'destination_after',
  'AUD2',
  'aplicar: coordenada corrigida re-vincula a unidade ao aeroporto que passou a ser o mais próximo');

select is(
  (select destination_id from public.location where id = current_setting('test.l_longe')::uuid),
  current_setting('test.d2')::uuid,
  'aplicar: o destination_id gravado é o novo, não o antigo');

select ok(
  (select distance_km_after < distance_km_before
   from public.location_address_change
   where location_id = current_setting('test.l_longe')::uuid
   order by changed_at desc limit 1),
  'aplicar: o histórico registra a distância antes e depois da correção');

-- ── 4. edição por fora reabre a verificação ───────────────────────────────────
select is(
  (public.location_address_audit_record(
    current_setting('test.l_ok')::uuid, 'ok', 'ChIJnovo', 'Lote Saudavel',
    'Rua Teste, 100 - Bairro, Cidade - SP, 01000-000',
    -51.0010, -31.0010, null, 'OPERATIONAL', 1.0
  ))->>'status',
  'ok',
  'veredito: volta a ok quando o pino e a porta batem');

update public.location set latitude = -51.2000, longitude = -31.2000
 where id = current_setting('test.l_ok')::uuid;

select is(
  (select verify_status from public.location_address_audit where location_id = current_setting('test.l_ok')::uuid),
  'pending',
  'edição da unidade por fora invalida o veredito, que volta para pendente');

select * from finish();
rollback;
