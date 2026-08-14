-- pgTAP: a nota do Google no card do lote mapeado (§6 de docs/specs/avaliacoes-google.md).
-- Migration: 20261024093000_prospect_cards_google_rating.sql
--
-- O que este arquivo protege:
--   1. o join do snapshot filtra `is_hidden` e os 30 dias POR CONTA PRÓPRIA. A policy de
--      leitura de `google_place_snapshot` esconde os dois de anon, mas a policy de escrita
--      é `for all` gateada em `is_hub_admin()`, e policies permissivas se somam: para um
--      admin logado a linha oculta e a vencida aparecem (o google_place_snapshot.test.sql
--      trava esse comportamento de propósito). Sem os filtros no join, a página pública
--      mudaria de conteúdo conforme quem abrisse;
--   2. a função continua SECURITY INVOKER. Promovê-la a definer para "resolver" um
--      permission denied contornaria o grant de coluna do Q-021 e devolveria o telefone;
--   3. o telefone continua sem SELECT para anon, mesmo depois de o `google_place_id` ter
--      ganhado grant de coluna. O grant novo é de UMA coluna, não da tabela.
--
-- Roda em transação com rollback.

begin;
select plan(12);

-- ── fixtures ─────────────────────────────────────────────────────────────────
-- Geo no Atlântico Sul, mesmo motivo do prospect_location.test.sql: `nearest_destination`
-- varre todo destino publicado num raio de 100 km e o auto-fill precisa ser determinístico.
do $$
declare
  uadm uuid := gen_random_uuid();
  dest uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
  values (uadm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gpr-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values (uadm,'hub_admin')
    on conflict (id) do update set role = excluded.role;

  insert into public.destination(id, code, name, slug, type, city, state, country, latitude, longitude, is_published)
  values (dest,'TGPR','Destino GPR','destino-gpr','airport','Cidade','PE','BR',-50.0000,-30.0000,true);

  -- Quatro fichas publicadas, uma por estado do snapshot. Publicar exige endereço.
  insert into public.prospect_location(destination_id, name, slug, latitude, longitude, is_published, address, phone, google_place_id)
  values
    (dest,'Lote Fresco GPR', 'gpr-fresco', -50.0009,-30.0000,true,'Av. GPR, 100','(81) 98692-0000','ChIJ_gpr_fresco'),
    (dest,'Lote Oculto GPR', 'gpr-oculto', -50.0009,-30.0000,true,'Av. GPR, 200','(81) 98692-0001','ChIJ_gpr_oculto'),
    (dest,'Lote Vencido GPR','gpr-vencido',-50.0009,-30.0000,true,'Av. GPR, 300','(81) 98692-0002','ChIJ_gpr_vencido'),
    (dest,'Lote Sem Place GPR','gpr-sem-place',-50.0009,-30.0000,true,'Av. GPR, 400','(81) 98692-0003',null);

  insert into public.google_place_snapshot(place_id, rating, user_rating_count, fetched_at, is_hidden)
  values
    ('ChIJ_gpr_fresco', 4.6, 312, now() - interval '3 days',  false),
    ('ChIJ_gpr_oculto', 4.9, 100, now() - interval '3 days',  true),
    ('ChIJ_gpr_vencido',3.1,  50, now() - interval '31 days', false);

  perform set_config('test.uadm', uadm::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── 1. A forma da função ─────────────────────────────────────────────────────
select has_function('public','destination_prospect_cards', array['text'],
  'a RPC dos cards de lote mapeado existe');

-- Se isto virar `true`, a função passou a enxergar a tabela inteira e o telefone volta a
-- depender de alguém lembrar de não selecioná-lo.
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'destination_prospect_cards'),
  false,
  'a RPC continua SECURITY INVOKER (definer contornaria o grant de coluna do Q-021)');

-- ── 2. anon: a nota fresca sai pronta no card ────────────────────────────────
set local role anon;

select is(
  (select count(*)::int from public.destination_prospect_cards('destino-gpr')),
  4,
  'o join do snapshot não multiplica nem some com card (4 fichas, 4 cards)');

select is(
  (select google_rating from public.destination_prospect_cards('destino-gpr') where slug = 'gpr-fresco'),
  4.6::numeric,
  'lote com snapshot fresco sai com a nota do Google');

select is(
  (select google_rating_count from public.destination_prospect_cards('destino-gpr') where slug = 'gpr-fresco'),
  312,
  'e com a contagem de avaliações');

-- É este retorno que a ficha do lote (E0.17-e) usa para carregar o snapshot inteiro: o
-- front anônimo não lê a coluna direto na tabela.
select is(
  (select google_place_id from public.destination_prospect_cards('destino-gpr') where slug = 'gpr-fresco'),
  'ChIJ_gpr_fresco',
  'a RPC devolve o place_id, que a ficha usa para achar as avaliações');

select is(
  (select google_rating from public.destination_prospect_cards('destino-gpr') where slug = 'gpr-sem-place'),
  null::numeric,
  'lote sem place_id sai sem nota, e não com zero fingindo nota');

-- O grant novo é de UMA coluna. O telefone continua fora, e é o que Q-021 fechou.
select throws_ok(
  $$select phone from public.prospect_location where slug = 'gpr-fresco'$$,
  '42501', null,
  'anon continua SEM ler a coluna phone depois do grant do google_place_id');

reset role;

-- ── 3. hub_admin: o filtro do join é o que esconde, não a policy ─────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.uadm'));

-- Premissa do teste: para o admin a linha oculta e a vencida existem na tabela. Se um dia
-- deixarem de existir, as duas asserções seguintes passariam por acidente.
select is(
  (select count(*)::int from public.google_place_snapshot
    where place_id in ('ChIJ_gpr_oculto','ChIJ_gpr_vencido')),
  2,
  'hub_admin enxerga snapshot oculto e vencido na tabela (policy for all, em OR)');

select is(
  (select google_rating from public.destination_prospect_cards('destino-gpr') where slug = 'gpr-oculto'),
  null::numeric,
  'snapshot desligado pelo hub_admin não vira nota no card, nem para o próprio hub_admin');

select is(
  (select google_rating from public.destination_prospect_cards('destino-gpr') where slug = 'gpr-vencido'),
  null::numeric,
  'snapshot além dos 30 dias não vira nota no card (limite de cache do Google)');

select is(
  (select google_rating_count from public.destination_prospect_cards('destino-gpr') where slug = 'gpr-oculto'),
  0,
  'sem snapshot válido a contagem é 0, não nula');

reset role;

select * from finish();
rollback;
