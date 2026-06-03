-- Partner Onboarding — hardening pós-advisors
-- 1) fixa search_path do slugify; 2) bloqueia execução por PUBLIC/anon das RPCs
--    (mantendo authenticated, que é quem o operador usa); 3) remove listing público do bucket.

-- 1) search_path imutável no slugify (usa apenas funções de pg_catalog)
alter function public.slugify(text) set search_path = pg_catalog, public;

-- 2) RPCs do wizard: tira do PUBLIC (remove o alcance de anon) e concede só a authenticated.
do $$
declare sig text;
begin
  foreach sig in array array[
    'public.onboarding_update_company(uuid,text,text,text,text)',
    'public.onboarding_upsert_location(uuid,uuid,text,text,numeric,numeric,text,text,text,text,jsonb)',
    'public.onboarding_set_parking_types(uuid,uuid,jsonb)',
    'public.onboarding_set_pricing(uuid,uuid,text,jsonb)',
    'public.onboarding_set_addons(uuid,uuid,jsonb)',
    'public.onboarding_submit(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;
end $$;

-- helpers internos (chamados só de dentro das funções definer): nega PUBLIC inteiramente.
revoke execute on function public.onboarding_assert_editable(uuid) from public, anon, authenticated;
revoke execute on function public.onboarding_bump_step(uuid, integer) from public, anon, authenticated;
revoke execute on function public.generate_unique_company_slug(text) from public, anon, authenticated;
revoke execute on function public.generate_unique_location_slug(uuid, text) from public, anon, authenticated;

-- 3) bucket público não precisa de policy de SELECT para servir URLs;
--    remover evita listagem de todos os arquivos por clientes.
drop policy if exists partner_assets_public_read on storage.objects;
