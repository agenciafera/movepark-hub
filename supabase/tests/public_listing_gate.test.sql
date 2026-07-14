-- pgTAP: public-listing gate (correção do vazamento do E1.9, migration 20260816000000).
-- Cobre: location.is_listed nasce false; o trigger list_locations_on_recipient_active liga
-- is_listed quando o recebedor da empresa fica 'active' (auto go-live); é monotônico (não desliga).
-- A RLS catalog_read_location (exige is_listed) é verificada pela própria policy + advisors; aqui
-- focamos o gatilho, que é a parte determinística.
-- NOTA: não rodado localmente (supabase CLI ausente no ambiente); validar no stack local (test:db).
begin;
select plan(4);

do $$
declare v_co uuid := gen_random_uuid(); v_loc uuid := gen_random_uuid();
begin
  insert into public.company(id, name, slug, status, onboarding_status)
    values (v_co, 'Gate Test Co', 'gate-test-co-' || substr(v_co::text, 1, 8), 'active', 'active');
  insert into public.location(id, company_id, name, slug, status, timezone)
    values (v_loc, v_co, 'Gate Test Loc', 'gate-test-loc-' || substr(v_loc::text, 1, 8),
            'active', 'America/Sao_Paulo');
  perform set_config('t.co', v_co::text, false);
  perform set_config('t.loc', v_loc::text, false);
end $$;

-- 1) unidade nova nasce NÃO listada (default false)
select is(
  (select is_listed from public.location where id = current_setting('t.loc')::uuid),
  false, 'location nasce is_listed = false');

-- 2) recebedor em draft não lista
insert into public.payout_recipient(company_id, provider, status)
  values (current_setting('t.co')::uuid, 'pagarme', 'draft');
select is(
  (select is_listed from public.location where id = current_setting('t.loc')::uuid),
  false, 'recebedor draft: segue não listada');

-- 3) recebedor vira 'active' → trigger liga is_listed
update public.payout_recipient set status = 'active'
  where company_id = current_setting('t.co')::uuid;
select is(
  (select is_listed from public.location where id = current_setting('t.loc')::uuid),
  true, 'recebedor active: trigger liga is_listed (auto go-live)');

-- 4) monotônico: recebedor sai de active (suspended) NÃO desliga o que já estava listado
update public.payout_recipient set status = 'suspended'
  where company_id = current_setting('t.co')::uuid;
select is(
  (select is_listed from public.location where id = current_setting('t.loc')::uuid),
  true, 'recebedor suspenso: is_listed permanece (monotônico, não derruba catálogo)');

select * from finish();
rollback;
