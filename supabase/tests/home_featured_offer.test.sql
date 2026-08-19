-- pgTAP: curadoria da vitrine da home (`home_featured_offer` + RPC `home_featured_offers`).
-- Migration: 20261031090000_home_featured_offer.sql
-- Spec: docs/specs/customer/home-and-search.md
--
-- O que este arquivo protege é o gate de publicação. A curadoria é uma FK para o tipo de vaga e
-- mais nada: quem impede a home de anunciar unidade de empresa desativada é o predicado dentro da
-- RPC. Ela é SECURITY DEFINER, ou seja, contorna a RLS de propósito, e um `where` a menos ali vaza
-- direto para a home pública.
--
-- Foi exatamente o buraco da RPC anterior (`popular_parking_types`): ela dava `join company` só
-- para pegar o slug e nunca filtrava status. O anônimo não via o estrago porque a RLS de catálogo
-- devolvia a empresa nula e o front descartava a linha, mas quem estava logado como hub_admin lê a
-- `company` inteira pela policy `company_select` e via a unidade morta na vitrine.
--
-- Roda em transação com rollback.

begin;
select plan(11);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
-- Duas empresas de forma idêntica, diferentes só no `status`. É o par mínimo que separa "a RPC
-- filtra" de "a RPC devolve pouco por acaso".
do $$
declare
  pt_covered uuid;
  cviva  uuid := gen_random_uuid();
  cmorta uuid := gen_random_uuid();
  lviva  uuid := gen_random_uuid();
  lviva2 uuid := gen_random_uuid();
  lmorta uuid := gen_random_uuid();
  cptv   uuid := gen_random_uuid();
  cptm   uuid := gen_random_uuid();
  lptv   uuid := gen_random_uuid();
  lptv2  uuid := gen_random_uuid();
  lptm   uuid := gen_random_uuid();
begin
  select id into pt_covered from public.parking_type where code = 'covered';

  insert into public.company (id, name, slug, status, onboarding_status) values
    (cviva,  'pgTAP Viva',  'pgtap-viva',  'active',   'active'),
    (cmorta, 'pgTAP Morta', 'pgtap-morta', 'inactive', 'active');

  -- `photos` não é enfeite na fixture: `enforce_photo_gate_on_location` (20260818000000) força
  -- `is_listed = false` em toda unidade sem foto, no INSERT inclusive. Sem esta coluna a fixture
  -- nasce despublicada e o teste passa a medir o gate de foto, não o de empresa.
  insert into public.location (id, company_id, name, slug, status, is_listed, photos) values
    (lviva,  cviva,  'pgTAP Viva',   'pgtap-viva',   'active', true, '["pgtap.webp"]'::jsonb),
    -- Segunda unidade da MESMA empresa: é o que o teto de 1 por empresa barrava antes.
    (lviva2, cviva,  'pgTAP Viva 2', 'pgtap-viva-2', 'active', true, '["pgtap.webp"]'::jsonb),
    (lmorta, cmorta, 'pgTAP Morta',  'pgtap-morta',  'active', true, '["pgtap.webp"]'::jsonb);

  -- `base_price` é NOT NULL e não é o preço de nada: o motor não lê essa coluna (o preço vem de
  -- pricing_rule). Zero é o que as unidades espelhadas já carregam.
  insert into public.company_parking_type
    (id, company_id, parking_type_id, base_price, default_capacity, is_active) values
    (cptv, cviva,  pt_covered, 0, 10, true),
    (cptm, cmorta, pt_covered, 0, 10, true);

  -- `location_parking_type` é unique em (location_id, company_parking_type_id), então a segunda
  -- oferta da empresa viva mora na segunda unidade dela.
  insert into public.location_parking_type
    (id, location_id, company_parking_type_id, is_active, capacity) values
    (lptv,  lviva,  cptv, true, 10),
    (lptv2, lviva2, cptv, true, 10),
    (lptm,  lmorta, cptm, true, 10);

  -- A morta entra em PRIMEIRO lugar de propósito: se a RPC ordenasse antes de filtrar, ela
  -- apareceria no topo da home.
  insert into public.home_featured_offer (location_parking_type_id, sort_order) values
    (lptm,  1),
    (lptv2, 3),
    (lptv,  2);

  perform set_config('test.lptv',  lptv::text,  true);
  perform set_config('test.lptv2', lptv2::text, true);
  perform set_config('test.lptm',  lptm::text,  true);
end $$;

-- ── contrato da função e da tabela ───────────────────────────────────────────

select has_table('public', 'home_featured_offer', 'tabela home_featured_offer existe');

select has_function(
  'public', 'home_featured_offers', ARRAY[]::text[],
  'home_featured_offers() existe'
);

select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'home_featured_offers'),
  true, 'home_featured_offers é SECURITY DEFINER'
);

-- A home é pública e pré-renderizada: sem este grant a vitrine some para o visitante deslogado.
select ok(
  has_function_privilege('anon', 'public.home_featured_offers()', 'EXECUTE'),
  'anon tem EXECUTE em home_featured_offers'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.home_featured_offer'::regclass),
  'RLS ligada em home_featured_offer'
);

-- A tabela não tem policy de catálogo: a única porta pública é a RPC.
select is(
  (select count(*) from pg_policy where polrelid = 'public.home_featured_offer'::regclass
     and 'anon' = any(select rolname from pg_roles where oid = any(polroles))),
  0::bigint,
  'nenhuma policy de home_featured_offer libera anon'
);

-- ── o gate ───────────────────────────────────────────────────────────────────

-- O caso que motivou o arquivo: curada de empresa inativa some, mesmo em primeiro lugar na lista.
select is(
  (select count(*) from public.home_featured_offers() where id = current_setting('test.lptm')::uuid),
  0::bigint,
  'destaque de empresa inativa não sai na RPC'
);

select is(
  (select count(*) from public.home_featured_offers() where id = current_setting('test.lptv')::uuid),
  1::bigint,
  'destaque de empresa ativa sai na RPC'
);

-- Desligar tira da home sem apagar a linha nem perder a posição.
update public.home_featured_offer set is_active = false
 where location_parking_type_id = current_setting('test.lptv')::uuid;
select is(
  (select count(*) from public.home_featured_offers() where id = current_setting('test.lptv')::uuid),
  0::bigint,
  'destaque desligado não sai na RPC'
);
update public.home_featured_offer set is_active = true
 where location_parking_type_id = current_setting('test.lptv')::uuid;

-- Despublicar a unidade também tira, com a empresa no ar.
update public.location set is_listed = false where slug = 'pgtap-viva';
select is(
  (select count(*) from public.home_featured_offers() where id = current_setting('test.lptv')::uuid),
  0::bigint,
  'unidade despublicada não sai na RPC'
);
update public.location set is_listed = true where slug = 'pgtap-viva';

-- Duas ofertas da mesma empresa convivem: o teto de 1 por empresa saiu junto com o ranking.
select is(
  (select array_agg(id order by sort_order)
     from public.home_featured_offers()
    where id in (current_setting('test.lptv')::uuid, current_setting('test.lptv2')::uuid)),
  array[current_setting('test.lptv')::uuid, current_setting('test.lptv2')::uuid],
  'duas ofertas da mesma empresa saem juntas, na ordem da curadoria'
);

select * from finish();
rollback;
