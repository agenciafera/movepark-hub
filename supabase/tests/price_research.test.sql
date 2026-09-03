-- pgTAP: robô de pesquisa de preço de concorrente (E0.17 · ADR-009 / ADR-010).
-- Migration: 20261112090000_robo_de_pesquisa_de_preco.sql
-- Spec: docs/specs/pesquisa-de-preco-concorrente.md
--
-- O que este arquivo protege, em ordem de importância:
--   1. o robô NÃO publica. A proposta existe sem tocar em `prospect_location`, e o preço da
--      ficha só muda quando alguém aplica. É a regra que sustenta a defesa do número
--      publicado: quem afirma o preço do concorrente é uma pessoa, não um modelo;
--   2. aplicar substitui os QUATRO valores, a data e a fonte de uma vez. Meia aplicação
--      deixaria diária de novembro e semanal de agosto sob um `researched_at` só, e a data
--      publicada passaria a mentir sobre metade da linha;
--   3. proposta sem valor, ou sem fonte e data, não é aplicável: do outro lado a constraint
--      da `prospect_location` recusaria, e o erro chegaria como 23514 sem explicação;
--   4. uma proposta aberta por lote, senão a passada seguinte cria a segunda;
--   5. cliente nenhum sem hub_admin lê ou decide.
--
-- Roda em transação com rollback.

begin;
select plan(14);

do $$
declare
  dest uuid := gen_random_uuid();
begin
  -- `code`, `type` e `city` são NOT NULL desde o baseline: destino de fixture sem eles
  -- morre em 23502 antes do primeiro assert.
  insert into public.destination (id, code, type, name, slug, city, state, latitude, longitude, is_published)
  values (dest, 'ZZ1', 'airport', 'Destino do robô', 'destino-robo-pgtap', 'Cidade', 'MG', -21.0, -31.0, true);

  insert into public.prospect_location
    (id, destination_id, name, slug, address, latitude, longitude, is_published)
  values
    ('22222222-2222-2222-2222-222222222222', dest, 'Lote do robô', 'lote-robo-pgtap',
     'Rua do robô, 1', -21.001, -31.001, true);

  -- Preço antigo, do jeito que a primeira carga entrou: à mão, com fonte e data.
  update public.prospect_location
     set researched_daily_brl = 30.00,
         researched_weekly_brl = 180.00,
         researched_biweekly_brl = 340.00,
         researched_at = current_date - 80,
         research_source = 'tabela de balcão, conferida à mão'
   where id = '22222222-2222-2222-2222-222222222222';
end $$;

-- ── 1 e 2. estrutura ────────────────────────────────────────────────────────────────
select has_table('public', 'prospect_price_research', 'a fila de propostas existe');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.prospect_price_research'::regclass),
  'a fila tem RLS ligada'
);

-- ── 3. o robô grava sem publicar ────────────────────────────────────────────────────
insert into public.prospect_price_research
  (id, prospect_location_id, status, source_url, fetched_at,
   daily_brl, weekly_brl, evidence, model)
values
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
   'pending', 'https://exemplo.com.br/precos', now(),
   34.90, 169.30, 'Diarias a partir de R$ 34,90', 'gemini-2.5-flash');

select is(
  (select researched_daily_brl from public.prospect_location
    where id = '22222222-2222-2222-2222-222222222222'),
  30.00::numeric,
  'proposta gravada NÃO muda o preço publicado: o robô propõe, não publica'
);

-- ── 4. uma proposta aberta por lote ─────────────────────────────────────────────────
select throws_ok(
  $$insert into public.prospect_price_research (prospect_location_id, status, source_url, fetched_at, daily_brl, evidence)
    values ('22222222-2222-2222-2222-222222222222', 'pending', 'https://exemplo.com.br/precos', now(), 39.90, 'x')$$,
  '23505',
  null,
  'duas propostas abertas para o mesmo lote seriam duas verdades esperando decisão'
);

-- ── 5 e 6. zero e falta de fonte ────────────────────────────────────────────────────
select throws_ok(
  $$insert into public.prospect_price_research (prospect_location_id, status, daily_brl, evidence)
    values ('22222222-2222-2222-2222-222222222222', 'applied', 0, 'x')$$,
  '23514',
  null,
  'zero num campo de preço é campo mal preenchido, não gratuidade'
);
select throws_ok(
  $$insert into public.prospect_price_research (prospect_location_id, status, daily_brl, evidence)
    values ('22222222-2222-2222-2222-222222222222', 'pending', 41.00, 'x')$$,
  '23514',
  null,
  'proposta pendente com preço exige fonte e instante do acesso'
);

-- ── 7 a 10. a decisão ───────────────────────────────────────────────────────────────
-- Como hub_admin (a RPC é definer e confere is_hub_admin()).
select lives_ok(
  $$select set_config('request.jwt.claims', json_build_object('sub', (select id::text from auth.users limit 1), 'role', 'authenticated')::text, true)$$,
  'assume um usuário para a RPC'
);

select throws_ok(
  $$select public.manager_price_research_decide('33333333-3333-3333-3333-333333333333', 'apply')$$,
  '42501',
  null,
  'sem hub_admin ninguém decide'
);

-- Vira hub_admin de verdade: a RPC lê o papel do profiles, não do JWT.
do $$
declare
  u uuid := (select id from auth.users limit 1);
begin
  update public.profiles set role = 'hub_admin' where id = u;
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $$;

select lives_ok(
  $$select public.manager_price_research_decide('33333333-3333-3333-3333-333333333333', 'apply')$$,
  'hub_admin aplica a proposta'
);

select results_eq(
  $$select researched_daily_brl, researched_weekly_brl, researched_biweekly_brl,
           researched_monthly_brl, research_source
      from public.prospect_location where id = '22222222-2222-2222-2222-222222222222'$$,
  $$values (34.90::numeric, 169.30::numeric, null::numeric, null::numeric,
            'https://exemplo.com.br/precos'::text)$$,
  'aplicar substitui os quatro valores e a fonte: a linha passa a descrever UMA leitura'
);

select is(
  (select researched_at from public.prospect_location
    where id = '22222222-2222-2222-2222-222222222222'),
  current_date,
  'a data publicada é a do acesso à página, não a do dia em que alguém clicou'
);

-- ── 11 e 12. proposta já decidida ───────────────────────────────────────────────────
select throws_ok(
  $$select public.manager_price_research_decide('33333333-3333-3333-3333-333333333333', 'apply')$$,
  'P0001',
  null,
  'proposta já aplicada não é aplicada de novo'
);

insert into public.prospect_price_research
  (id, prospect_location_id, status, notes)
values
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
   'failed', 'O lugar não publica site no Google.');

select throws_ok(
  $$select public.manager_price_research_decide('44444444-4444-4444-4444-444444444444', 'apply')$$,
  'P0001',
  null,
  'tentativa sem número nenhum não vira preço publicado'
);

-- ── 13 e 14. os grants ──────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.manager_price_research_pending()', 'EXECUTE'),
  'anon NÃO lê a fila: função nova nasce com anon=X por default privilege'
);
select ok(
  not has_function_privilege(
    'anon', 'public.manager_price_research_decide(uuid, text, text)', 'EXECUTE'),
  'anon NÃO decide'
);

select * from finish();
rollback;
