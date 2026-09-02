-- pgTAP: E0.17-k · preço PESQUISADO do lote mapeado (ADR-009 / ADR-010).
-- Migration: 20261107090000_preco_pesquisado_do_lote_mapeado.sql
-- Spec: docs/specs/lote-mapeado-vitrine.md
--
-- O que este arquivo protege:
--   1. preço de terceiro NUNCA entra sem data e sem fonte. É a diferença entre "pesquisamos
--      isto em 29/08/2026" e afirmar hoje um valor que ninguém sabe de quando é;
--   2. zero não passa. Zero num campo de preço não é "de graça", é campo mal preenchido, e
--      "R$ 0,00 a diária" numa tabela pública é o pior erro possível aqui;
--   3. `anon` LÊ os quatro preços e a data, e NÃO lê `research_source`. O SELECT da tabela é
--      por coluna desde o Q-021: coluna nova nasce fora do grant, e quem esquece a linha de
--      grant derruba a vitrine inteira em 42501 (foi o bug da 20261103091500);
--   4. a fonte é rastro de auditoria, não conteúdo, e por isso fica fora do grant público;
--   5. a VALIDADE: preço de terceiro vale 90 dias e some da vitrine quando vence
--      (20261111091500). Preço velho na tela é o que torna a comparação indefensável, e a
--      data ao lado não conserta o número. O painel continua vendo o vencido, que é onde
--      alguém reconfere;
--   6. `anon` NÃO executa as duas manager_*. As três funções mudaram de assinatura e foram
--      recriadas, e função nova neste projeto nasce com `anon=X` por default privilege: o
--      `revoke ... from public` não alcança esse grant. Os advisors pegaram em 30/08/2026.
--
-- Roda em transação com rollback.

begin;
select plan(16);

-- ── fixtures ────────────────────────────────────────────────────────────────────────
-- Geo no Atlântico Sul para não colidir com destino do seed: `nearest_destination` varre
-- todos os destinos publicados num raio de 100 km e o auto-fill precisa ser determinístico.
do $$
declare
  dest uuid := gen_random_uuid();
begin
  insert into public.destination (id, name, slug, latitude, longitude, is_published)
  values (dest, 'Destino do teste de preço', 'destino-preco-pgtap', -20.0, -30.0, true);

  insert into public.prospect_location
    (id, destination_id, name, slug, address, latitude, longitude, is_published)
  values
    ('11111111-1111-1111-1111-111111111111', dest, 'Lote com preço', 'lote-com-preco-pgtap',
     'Rua do teste, 1', -20.001, -30.001, true);
end $$;

-- ── 1 a 4. a constraint ─────────────────────────────────────────────────────────────
select throws_ok(
  $$update public.prospect_location set researched_daily_brl = 29.90
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'preço sem data e sem fonte é recusado pela constraint'
);

select throws_ok(
  $$update public.prospect_location
    set researched_daily_brl = 29.90, researched_at = current_date
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'preço com data e sem fonte também é recusado: sem fonte não dá para reconferir'
);

select throws_ok(
  $$update public.prospect_location
    set researched_daily_brl = 29.90, researched_at = current_date, research_source = '   '
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'fonte em branco não conta como fonte'
);

select throws_ok(
  $$update public.prospect_location
    set researched_daily_brl = 0, researched_at = current_date, research_source = 'site do lote'
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'zero não passa: num campo de preço zero é campo mal preenchido, não gratuidade'
);

-- ── 5. o caminho feliz ──────────────────────────────────────────────────────────────
select lives_ok(
  $$update public.prospect_location
    set researched_daily_brl = 22.90, researched_weekly_brl = 168.00,
        researched_at = current_date, research_source = 'tabela de balcão do lote'
    where id = '11111111-1111-1111-1111-111111111111'$$,
  'preço com data e fonte entra'
);

-- ── 6. limpar o preço não exige data ────────────────────────────────────────────────
-- Se exigisse, tirar um valor obsoleto da página viraria um quebra-cabeça, e o time
-- deixaria o valor velho no ar em vez de apagar.
select lives_ok(
  $$update public.prospect_location
    set researched_daily_brl = null, researched_weekly_brl = null,
        researched_at = null, research_source = null
    where id = '11111111-1111-1111-1111-111111111111'$$,
  'apagar o preço junto com data e fonte é sempre permitido'
);

-- ── 7 a 9. os grants de coluna ──────────────────────────────────────────────────────
select ok(
  (select bool_and(has_column_privilege('anon', 'public.prospect_location', c, 'SELECT'))
   from unnest(array[
     'researched_daily_brl', 'researched_weekly_brl',
     'researched_biweekly_brl', 'researched_monthly_brl', 'researched_at'
   ]) as c),
  'anon lê os quatro preços e a data: sem isso a vitrine morre em 42501'
);

select ok(
  not has_column_privilege('anon', 'public.prospect_location', 'research_source', 'SELECT'),
  'anon NÃO lê a fonte: é rastro de auditoria, não conteúdo da página'
);

select ok(
  (select bool_and(has_column_privilege('authenticated', 'public.prospect_location', c, 'SELECT'))
   from unnest(array['researched_daily_brl', 'researched_at']) as c),
  'authenticated lê o preço pelo mesmo caminho do anon'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.manager_prospect_locations(uuid, text, text)',
    'EXECUTE'
  ),
  'anon NÃO executa manager_prospect_locations: recriar a função a reconcede por default privilege'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.manager_prospect_location_save(uuid, text, text, numeric, numeric, uuid, text, text,'
      || ' text, text, text, jsonb, text, boolean, numeric, numeric, numeric, numeric, date, text)',
    'EXECUTE'
  ),
  'anon NÃO executa manager_prospect_location_save'
);

-- ── 12 a 16. a validade ─────────────────────────────────────────────────────────────
select is(public.preco_pesquisado_fresco('2026-06-05', '2026-09-02'), true,
  'preço de 89 dias ainda vale');
select is(public.preco_pesquisado_fresco('2026-06-04', '2026-09-02'), false,
  'preço de 90 dias vence: é o mesmo limite do isPesquisaFresca em TS');
select is(public.preco_pesquisado_fresco(null, '2026-09-02'), false,
  'sem data não existe validade a conferir');

-- A vitrine devolve a linha, mas sem tarifa: o lote continua na página com endereço e
-- distância. Sumir com a linha inteira seria esconder um estacionamento que existe.
do $$
begin
  update public.prospect_location
     set researched_daily_brl = 22.90,
         researched_at = current_date - 200,
         research_source = 'site do lote'
   where id = '11111111-1111-1111-1111-111111111111';
end $$;

select is(
  (select researched_daily_brl from public.destination_prospect_cards('destino-preco-pgtap')
    where id = '11111111-1111-1111-1111-111111111111'),
  null::numeric,
  'preço vencido não sai da vitrine com valor'
);
select is(
  (select count(*)::int from public.destination_prospect_cards('destino-preco-pgtap')
    where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'mas o lote continua na página: vence o preço, não a ficha'
);

select * from finish();
rollback;
