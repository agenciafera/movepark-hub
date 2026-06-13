-- pgTAP: PRD-11 — colunas "Como chegar" em location (directions_text + traslado).
-- Cobre a existência das colunas e os CHECKs de minutos positivos do traslado.
-- Roda em transação com rollback.

begin;
select plan(7);

-- ── colunas existem com o tipo certo ─────────────────────────────────────────
select has_column('public', 'location', 'directions_text', 'location.directions_text existe');
select col_type_is('public', 'location', 'directions_text', 'text',
  'directions_text é text (markdown / passo-a-passo)');
select has_column('public', 'location', 'shuttle_frequency_minutes',
  'location.shuttle_frequency_minutes existe');
select has_column('public', 'location', 'shuttle_to_terminal_minutes',
  'location.shuttle_to_terminal_minutes existe');

-- ── CHECK: minutos do traslado precisam ser positivos quando informados ───────
do $$
declare cmp uuid := gen_random_uuid();
begin
  insert into public.company(id, name, slug) values (cmp, 'Co Teste PRD11', 'co-teste-prd11');
  -- null/positivo é aceito
  insert into public.location(company_id, name, slug, shuttle_frequency_minutes, shuttle_to_terminal_minutes)
  values (cmp, 'Lote OK', 'lote-prd11-ok', 15, 6);
  perform set_config('test.cmp', cmp::text, false);
end $$;

select is(
  (select shuttle_frequency_minutes from public.location where slug = 'lote-prd11-ok'),
  15,
  'frequência positiva é aceita');

select throws_ok(
  format($$insert into public.location(company_id, name, slug, shuttle_frequency_minutes)
           values (%L, 'Lote Zero', 'lote-prd11-zero', 0)$$, current_setting('test.cmp')),
  '23514',
  null,
  'frequência 0 viola o CHECK');

select throws_ok(
  format($$insert into public.location(company_id, name, slug, shuttle_to_terminal_minutes)
           values (%L, 'Lote Neg', 'lote-prd11-neg', -3)$$, current_setting('test.cmp')),
  '23514',
  null,
  'tempo até o terminal negativo viola o CHECK');

select * from finish();
rollback;
