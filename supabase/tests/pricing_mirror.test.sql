-- pgTAP: E0.13 · espelhamento da tabela de preço do white-label.
-- Spec: docs/specs/espelhamento-preco-wl.md
--
-- O que este arquivo protege, em ordem de importância:
--   1. passada que não muda nada NÃO grava linha de log (o motivo de existir do desenho);
--   2. mudança de tabela grava, com o antes e o depois, porque é histórico de preço;
--   3. escala de número não conta como mudança (1 e 1.00 são o mesmo preço);
--   4. a retenção poupa o histórico e só envelhece divergência e erro;
--   5. cliente nenhum executa as RPCs do job;
--   6. passada que não muda nada também não pede publicação do site (20261111090000). Sem
--      isso são oito builds por dia sem conteúdo novo, e o mecanismo de publicação vira
--      barulho de fundo que ninguém lê.

begin;
select plan(26);

do $$
declare
  v_company uuid;
  v_loc uuid;
  v_pt uuid;
  v_cpt uuid;
  v_lpt uuid;
begin
  insert into public.company(name, slug) values ('E013 Parceiro','e013-parceiro') returning id into v_company;
  insert into public.location(company_id, name, slug) values (v_company, 'E013 Unidade','e013-unidade') returning id into v_loc;
  insert into public.parking_type(code, name) values ('e013_coberta','E013 Coberta') returning id into v_pt;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_company, v_pt, 40, 10) returning id into v_cpt;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc, v_cpt, 10, true) returning id into v_lpt;
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- A tabela do Virapark medida em 08/08/2026.
create or replace function pg_temp.regra() returns jsonb language sql as $$
  select '{"strategy":"uniform_by_duration","fractional_day_policy":"hour_tolerance","fractional_day_tolerance":1,"old_price_strategy":"own_table"}'::jsonb;
$$;
create or replace function pg_temp.faixas() returns jsonb language sql as $$
  select '[{"from_day":1,"to_day":1,"unit_price":40,"is_old_price":false},
           {"from_day":2,"to_day":6,"unit_price":28.90,"is_old_price":false},
           {"from_day":7,"to_day":null,"unit_price":24.90,"is_old_price":false},
           {"from_day":1,"to_day":null,"unit_price":40,"is_old_price":true}]'::jsonb;
$$;
create or replace function pg_temp.aplica(p_faixas jsonb) returns jsonb language sql as $$
  select public.wl_mirror_apply_pricing(current_setting('test.lpt')::uuid, pg_temp.regra(), p_faixas, 42, '[]'::jsonb);
$$;

-- ── estrutura ──────────────────────────────────────────────────────────────
select has_table('public','pricing_mirror_run','tabela de log por evento existe');
select has_column('public','pricing_rule','mirror_source','pricing_rule.mirror_source existe');
select has_column('public','pricing_rule','mirror_sampled_at','carimbo de última MUDANÇA existe');
select has_column('public','pricing_rule','mirror_verified_at','carimbo de última OLHADA existe');
select has_column('public','pricing_rule','mirror_status','status de divergência existe');

-- ── primeira amostragem: grava e loga ──────────────────────────────────────
select is((pg_temp.aplica(pg_temp.faixas()) ->> 'changed')::boolean, true,
  'primeira amostragem conta como mudança');
select is(
  (select count(*)::int from public.pricing_mirror_run where kind = 'change'),
  1, 'primeira amostragem deixa uma linha de histórico');
select is(
  (select mirror_source from public.pricing_rule where location_parking_type_id = current_setting('test.lpt')::uuid),
  'wl_sampling', 'a regra fica carimbada como espelhada');
select is(
  (select count(*)::int from public.pricing_tier t
    join public.pricing_rule r on r.id = t.pricing_rule_id
   where r.location_parking_type_id = current_setting('test.lpt')::uuid),
  4, 'grava as três faixas de venda mais a de balcão');

-- ── segunda passada, tabela idêntica: NÃO loga ─────────────────────────────
-- É o coração do desenho. O wl_reconcile_log deste projeto tem 30 mil linhas contra 225
-- reservas por gravar toda passada; aqui a passada silenciosa custa zero linha.
select is((pg_temp.aplica(pg_temp.faixas()) ->> 'changed')::boolean, false,
  'mesma tabela não conta como mudança');
select is(
  (select count(*)::int from public.pricing_mirror_run),
  1, 'passada sem mudança NÃO inunda o log');

-- ── escala de número não é mudança ─────────────────────────────────────────
select is(
  (pg_temp.aplica('[{"from_day":1,"to_day":1,"unit_price":40.00,"is_old_price":false},
                    {"from_day":2,"to_day":6,"unit_price":28.9,"is_old_price":false},
                    {"from_day":7,"to_day":null,"unit_price":24.9000,"is_old_price":false},
                    {"from_day":1,"to_day":null,"unit_price":40.0,"is_old_price":true}]'::jsonb)
   ->> 'changed')::boolean,
  false, '40 e 40.00 são o mesmo preço, não geram linha');

-- ── mudança de verdade: loga com antes e depois ────────────────────────────
select is(
  (pg_temp.aplica('[{"from_day":1,"to_day":1,"unit_price":40,"is_old_price":false},
                    {"from_day":2,"to_day":6,"unit_price":32.90,"is_old_price":false},
                    {"from_day":7,"to_day":null,"unit_price":24.90,"is_old_price":false},
                    {"from_day":1,"to_day":null,"unit_price":40,"is_old_price":true}]'::jsonb)
   ->> 'changed')::boolean,
  true, 'parceiro mudou a faixa do meio e isso conta como mudança');
select is(
  (select count(*)::int from public.pricing_mirror_run where kind = 'change'),
  2, 'mudança real deixa a segunda linha de histórico');
select isnt_empty(
  $$ select 1 from public.pricing_mirror_run
      where kind = 'change' and before is not null and after is not null
        and before is distinct from after $$,
  'a linha guarda o antes e o depois, que é o histórico de preço');

-- ── divergência derruba a vitrine para "a partir de" ───────────────────────
select lives_ok(
  format($$ select public.wl_mirror_flag_divergence(%L, '{"dias":9}'::jsonb) $$, current_setting('test.lpt')),
  'marca divergência entre os motores');
select is(
  (select mirror_status from public.pricing_rule where location_parking_type_id = current_setting('test.lpt')::uuid),
  'divergent', 'a regra fica marcada como divergente');

-- ── retenção: histórico fica, ruído envelhece ──────────────────────────────
update public.pricing_mirror_run set created_at = now() - interval '200 days';
select is(
  (public.cron_prune_integration_logs() ->> 'pricing_mirror_run')::int,
  1, 'a limpeza apaga só a divergência velha');
select is(
  (select count(*)::int from public.pricing_mirror_run where kind = 'change'),
  2, 'histórico de preço não é apagado pela retenção, mesmo velho');

-- ── publicação automática: passada calada não pede build ───────────────────
-- Migration 20261111090000. O espelho escreve em três tabelas que têm trigger de
-- publicação, e escrevia nas três a cada passada mesmo sem mudança de preço.
delete from public.site_rebuild_request;

-- A porta em si: enquanto ela está aberta, escrita nenhuma enfileira.
select set_config('movepark.skip_site_rebuild', 'on', true);
insert into public.amenity (code, name, category)
values ('e013_porta_aberta', 'E013 porta aberta', 'extras');
select is(
  (select count(*)::int from public.site_rebuild_request),
  0, 'com a porta aberta, mudança de conteúdo não enfileira publicação'
);
select set_config('movepark.skip_site_rebuild', 'off', true);
insert into public.amenity (code, name, category)
values ('e013_porta_fechada', 'E013 porta fechada', 'extras');
select is(
  (select count(*)::int from public.site_rebuild_request),
  1, 'com a porta fechada, o enfileirador volta ao normal'
);

-- Passada sem mudança: escreve nas três tabelas e não pede nada.
delete from public.site_rebuild_request;
select is(
  (pg_temp.aplica('[{"from_day":1,"to_day":1,"unit_price":40,"is_old_price":false},
                    {"from_day":2,"to_day":6,"unit_price":32.90,"is_old_price":false},
                    {"from_day":7,"to_day":null,"unit_price":24.90,"is_old_price":false},
                    {"from_day":1,"to_day":null,"unit_price":40,"is_old_price":true}]'::jsonb)
   ->> 'rebuild_requested')::boolean,
  false, 'passada que reencontra a mesma tabela não pede publicação');
select is(
  (select count(*)::int from public.site_rebuild_request),
  0, 'e não deixa pedido nenhum na fila, nem de pricing_tier'
);

-- Mudança de verdade: um pedido, não um por statement.
select is(
  (pg_temp.aplica('[{"from_day":1,"to_day":1,"unit_price":40,"is_old_price":false},
                    {"from_day":2,"to_day":6,"unit_price":35.90,"is_old_price":false},
                    {"from_day":7,"to_day":null,"unit_price":24.90,"is_old_price":false},
                    {"from_day":1,"to_day":null,"unit_price":40,"is_old_price":true}]'::jsonb)
   ->> 'rebuild_requested')::boolean,
  true, 'parceiro mudou o preço e a publicação é pedida');
select is(
  (select count(*)::int from public.site_rebuild_request),
  1, 'mudança pede UM build, não um por tabela tocada'
);

-- ── as RPCs do job não são chamáveis pelo cliente ──────────────────────────
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('wl_mirror_apply_pricing','wl_mirror_flag_divergence','cron_prune_integration_logs')
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'nem anon nem authenticated executam as RPCs do job');

select * from finish();
rollback;
