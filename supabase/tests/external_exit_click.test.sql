-- pgTAP: E0.16 · registro de clique de saída da unidade externa.
-- Migration: 20261001010000_external_exit_click.sql
-- Spec: docs/specs/clique-saida-externa.md
--
-- O que este arquivo protege, em ordem de importância:
--   1. a tabela NÃO aceita escrita direta de anon nem de authenticated (só a RPC definer grava);
--   2. a RPC só aceita vaga ativa de unidade EXTERNA, e não um uuid qualquer;
--   3. a dedup de 5 minutos, que é o que impede clique duplo de virar dois registros no funil;
--   4. a leitura do funil é de hub_admin.

begin;
select plan(15);

do $$
declare
  v_co uuid; v_loc_ext uuid; v_loc_hub uuid; v_pt uuid; v_cpt uuid;
  v_lpt_ext uuid; v_lpt_hub uuid; v_lpt_inativa uuid;
begin
  insert into public.company(name, slug) values ('Saida Parceiro','saida-parceiro') returning id into v_co;

  -- Unidade externa (o alvo válido) e unidade hub (que a RPC tem que recusar).
  insert into public.location(company_id, name, slug, checkout_mode)
    values (v_co, 'Saida Externa','saida-externa','external') returning id into v_loc_ext;
  insert into public.location(company_id, name, slug, checkout_mode)
    values (v_co, 'Saida Hub','saida-hub','hub') returning id into v_loc_hub;

  insert into public.parking_type(code, name) values ('saida_coberta','Saida Coberta') returning id into v_pt;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_co, v_pt, 40, 10) returning id into v_cpt;

  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc_ext, v_cpt, 10, true) returning id into v_lpt_ext;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc_hub, v_cpt, 10, true) returning id into v_lpt_hub;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc_ext, v_cpt, 10, false) returning id into v_lpt_inativa;

  perform set_config('t.ext', v_lpt_ext::text, false);
  perform set_config('t.hub', v_lpt_hub::text, false);
  perform set_config('t.inativa', v_lpt_inativa::text, false);
end $$;

-- ── 1. Ninguém escreve direto na tabela ─────────────────────────────────────

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'external_exit_click'
      and cmd in ('INSERT','UPDATE','DELETE','ALL')),
  0, 'a tabela não tem policy de escrita: só a RPC definer grava');

select ok(
  not has_table_privilege('anon', 'public.external_exit_click', 'INSERT'),
  'anon não tem INSERT na tabela');
select ok(
  not has_table_privilege('authenticated', 'public.external_exit_click', 'INSERT'),
  'authenticated não tem INSERT na tabela');
select ok(
  not has_table_privilege('anon', 'public.external_exit_click', 'SELECT'),
  'anon não lê clique de saída');

-- ── 2. A RPC só aceita alvo válido ──────────────────────────────────────────

select is(
  public.log_external_exit(current_setting('t.ext')::uuid, 'sess-a',
    '2026-09-19T21:00:00Z', '2026-09-22T21:00:00Z'),
  true, 'vaga ativa de unidade externa é registrada');

select is(
  public.log_external_exit(current_setting('t.hub')::uuid, 'sess-a'),
  false, 'vaga de unidade HUB é recusada: ali a reserva nasce no Hub e tem booking');

select is(
  public.log_external_exit(current_setting('t.inativa')::uuid, 'sess-a'),
  false, 'vaga inativa é recusada');

select is(
  public.log_external_exit(gen_random_uuid(), 'sess-a'),
  false, 'uuid que não existe é recusado, e não vira linha órfã');

select is(
  public.log_external_exit(current_setting('t.ext')::uuid, '   '),
  false, 'sem sessão anônima não registra');

-- ── 3. Dedup de 5 minutos ───────────────────────────────────────────────────

select is(
  public.log_external_exit(current_setting('t.ext')::uuid, 'sess-a',
    '2026-09-19T21:00:00Z', '2026-09-22T21:00:00Z'),
  false, 'clique repetido da mesma sessão, mesma vaga e mesmas datas não conta de novo');

select is(
  public.log_external_exit(current_setting('t.ext')::uuid, 'sess-a',
    '2026-10-01T21:00:00Z', '2026-10-05T21:00:00Z'),
  true, 'mesma sessão com OUTRAS datas é outra intenção, e conta');

select is(
  public.log_external_exit(current_setting('t.ext')::uuid, 'sess-b',
    '2026-09-19T21:00:00Z', '2026-09-22T21:00:00Z'),
  true, 'outra sessão nas mesmas datas conta');

-- O total confirma a leitura acima: 3 registros de 6 chamadas.
select is(
  (select count(*)::int from public.external_exit_click), 3,
  'seis chamadas, três cliques registrados');

-- A duração vem derivada, que é o que permite cruzar com o relatório do parceiro por estadia.
select is(
  (select days from public.external_exit_click
    where session_id = 'sess-a' and check_in_at = '2026-09-19T21:00:00Z'),
  3, 'a duração da busca é derivada das datas');

-- ── 4. A leitura do funil recusa quem não é hub_admin ───────────────────────
--
-- Recusa em vez de lista vazia: vazio se disfarça de "não teve clique nenhum", que num painel de
-- funil é a leitura errada e some com o problema.
select throws_ok(
  $$ select * from public.manager_external_exit_clicks() $$,
  '42501', null, 'sem hub_admin, o funil recusa em vez de devolver vazio');

select * from finish();
rollback;
