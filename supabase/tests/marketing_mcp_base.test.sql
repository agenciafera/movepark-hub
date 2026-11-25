-- pgTAP: base do MCP de marketing (migration 20261207110000_marketing_mcp_base).
--   - escopos de plataforma;
--   - catálogo de campos de segmento e a validação de definição no servidor;
--   - a trava comum: o servidor (MCP) passa, cliente logado comum continua recusado;
--   - o ator: hub_admin não se passa por chave.
-- Spec: docs/specs/marketing-mcp.md. Roda com: supabase test db. Transação + rollback.

begin;
select plan(18);

do $$
declare
  u uuid := gen_random_uuid();
  adm uuid := gen_random_uuid();
  v_loc uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-mcp-cliente@ex.com', now(), now()),
           (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-mcp-admin@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (adm, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';

  -- Uma compra para o contato existir no documento de marketing.
  select id into v_loc from public.location where deleted_at is null limit 1;
  insert into public.booking(code, profile_id, location_id, status, total_amount, customer_email,
                             created_at, check_in_at, check_out_at)
  values ('MP-MKT-MCP-1', u, v_loc, 'completed', 120, 'mkt-mcp-cliente@ex.com',
          now() - interval '3 days', now() - interval '2 days', now() - interval '1 day');

  perform set_config('test.u', u::text, false);
  perform set_config('test.adm', adm::text, false);
end $$;

-- ── 1. Escopos ──────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.api_scope
    where scope in ('marketing:read', 'marketing:write', 'marketing:dispatch')
      and is_platform_scope and assignable_to_api_key),
  3,
  'os três escopos de marketing são de plataforma e atribuíveis a chave');

-- ── 2. Catálogo de campos ───────────────────────────────────────────────────
select is((select count(*)::int from public.marketing_segment_fields()), 36,
  'o catálogo tem os 36 campos do construtor do front');

select is(
  (select jsonb_array_length(options) from public.marketing_segment_fields() where key = 'rfm_segment'),
  14,
  'rfm_segment lista os 14 segmentos do RFM');

select ok(
  not exists (
    select 1 from public.marketing_segment_fields() f
    where not ((select d.doc from public.marketing_contact_doc(null) d
                where d.contact_key = 'mkt-mcp-cliente@ex.com') ? f.key)),
  'todo campo do catálogo existe no documento do contato');

-- ── 3. Validação da definição ───────────────────────────────────────────────
select is(
  public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":2}]}'),
  '{}'::text[],
  'definição válida não tem problema');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"nao_existe","op":"eq","value":1}]}'), ' ')
    like '%campo desconhecido "nao_existe"%',
  'campo desconhecido é apontado');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"cohort","op":"gte","value":1}]}'), ' ')
    like '%operador "gte" não vale%',
  'operador fora do tipo do campo é apontado');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"total_spent","op":"gte"}]}'), ' ')
    like '%Falta o valor em "Total gasto"%',
  'regra sem valor é apontada');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"cohort","op":"eq","value":"vip"}]}'), ' ')
    like '%Valor fora das opções em "Coorte"%',
  'valor de enum fora das opções é apontado');

select ok(
  array_to_string(public.marketing_validate_definition('{"match":"all","rules":[]}'), ' ')
    like '%pega a base inteira%',
  'segmento sem regra é apontado');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"any","rules":[{"field":"bookings_count","op":"gte","value":1},{"match":"all","rules":[]}]}'), ' ')
    like '%grupo 2 está vazio%',
  'grupo vazio dentro do segmento é apontado');

-- ── 4. A trava comum ────────────────────────────────────────────────────────
-- Servidor: é o MCP com a chave de plataforma, falando como service_role.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$select public.marketing_rfm_overview()$$,
  'o servidor lê o RFM (MCP com chave de plataforma)');
select lives_ok($$select * from public.manager_list_platform_coupons()$$,
  'o servidor lista os cupons da Movepark');

-- Cliente logado comum continua recusado.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.u'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select public.marketing_rfm_overview()$$, '42501', null,
  'cliente logado comum continua sem RFM');
select throws_ok($$select * from public.marketing_leads()$$, '42501', null,
  'cliente logado comum continua sem leads');
reset role;

-- Admin pela tela segue igual.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$select public.marketing_rfm_overview()$$, 'hub_admin segue lendo o RFM pela tela');
reset role;

-- ── 5. O ator ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.marketing_resolve_actor(
    '{"kind":"api_key","id":"00000000-0000-0000-0000-000000000001","label":"Claude marketing"}') ->> 'kind',
  'api_key',
  'o servidor registra a chave que o MCP informou');

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is(
  public.marketing_resolve_actor('{"kind":"api_key","label":"falso"}') ->> 'kind',
  'hub_admin',
  'hub_admin não se passa por chave');

select * from finish();
rollback;
