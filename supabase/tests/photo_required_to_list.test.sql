-- pgTAP: foto obrigatória para listar (migration 20260818000000).
-- Regra de produto: "sem foto nenhuma, a unidade não sobe pra venda". Cobre o piso de foto
-- (sem foto => is_listed nunca fica true) e a subida da 1ª foto DEPOIS do recebedor aprovado
-- (o gate na location liga is_listed). Também confirma que remover a última foto desliga.
-- NOTA: não rodado localmente (supabase CLI ausente no ambiente); validar no stack local (test:db).
begin;
select plan(5);

do $$
declare v_co uuid := gen_random_uuid(); v_loc uuid := gen_random_uuid();
begin
  insert into public.company(id, name, slug, status, onboarding_status)
    values (v_co, 'Photo Gate Co', 'photo-gate-co-' || substr(v_co::text, 1, 8), 'active', 'active');
  -- unidade ativa SEM foto (photos default '[]')
  insert into public.location(id, company_id, name, slug, status, timezone)
    values (v_loc, v_co, 'Photo Gate Loc', 'photo-gate-loc-' || substr(v_loc::text, 1, 8),
            'active', 'America/Sao_Paulo');
  perform set_config('t.co', v_co::text, false);
  perform set_config('t.loc', v_loc::text, false);
end $$;

-- 1) recebedor active mas SEM foto: não lista (piso de foto)
insert into public.payout_recipient(company_id, provider, status)
  values (current_setting('t.co')::uuid, 'pagarme', 'active');
select is(
  (select is_listed from public.location where id = current_setting('t.loc')::uuid),
  false, 'recebedor active + sem foto: NAO lista (piso de foto)');

-- 2) sobe a 1a foto (recebedor já ativo): o gate na location liga is_listed
update public.location set photos = '["https://img.example/p1.jpg"]'::jsonb
  where id = current_setting('t.loc')::uuid;
select is(
  (select is_listed from public.location where id = current_setting('t.loc')::uuid),
  true, '1a foto com recebedor ativo: entra na busca');

-- 3) remove a última foto: piso desliga is_listed
update public.location set photos = '[]'::jsonb
  where id = current_setting('t.loc')::uuid;
select is(
  (select is_listed from public.location where id = current_setting('t.loc')::uuid),
  false, 'sem foto de novo: sai da busca');

-- 4) helper location_has_photo
select is(public.location_has_photo('[]'::jsonb), false, 'location_has_photo([]) = false');
select is(public.location_has_photo('["a"]'::jsonb), true, 'location_has_photo(["a"]) = true');

select * from finish();
rollback;
