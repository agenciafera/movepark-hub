-- pgTAP: matriz Tarifa × ação de alteração (E2.8). Trava o SEED da tabela `fare` contra a spec
-- docs/specs/booking-modifications.md. Se um seed/migration mudar a janela ou um flag de benefício
-- sem atualizar a spec, este teste falha. Espelha o fixture do front
-- (src/features/bookings/booking-modifications.logic.test.ts) e os deno tests dos gates das Edges.
-- Rodar com: supabase test db  (ver README.md).

begin;
select plan(15);

create or replace function pg_temp.b(p_tier text, p_key text)
returns boolean language sql as $$
  select (benefits ->> p_key)::boolean from public.fare where tier::text = p_tier;
$$;
create or replace function pg_temp.win(p_tier text)
returns int language sql as $$
  select cancel_window_minutes from public.fare where tier::text = p_tier;
$$;

-- ── Janela de cancelamento (gate por TEMPO) ───────────────────────────────────
select is(pg_temp.win('basica'), 1440, 'Básica: cancelamento grátis até 24h antes');
select is(pg_temp.win('flex'), 1440, 'Flex: cancelamento grátis até 24h antes');
select is(pg_temp.win('superflex'), 1, 'Superflex: cancelamento grátis até 1 min antes');

-- ── Trocar datas (gate booleano date_change) ──────────────────────────────────
select is(pg_temp.b('basica', 'date_change'), false, 'Básica NÃO permite alterar datas');
select is(pg_temp.b('flex', 'date_change'), true, 'Flex permite alterar datas');
select is(pg_temp.b('superflex', 'date_change'), true, 'Superflex permite alterar datas');

-- ── Trocar veículo/placa (gate booleano plate_change) ─────────────────────────
select is(pg_temp.b('basica', 'plate_change'), false, 'Básica NÃO permite trocar veículo');
select is(pg_temp.b('flex', 'plate_change'), true, 'Flex permite trocar veículo');
select is(pg_temp.b('superflex', 'plate_change'), true, 'Superflex permite trocar veículo');

-- ── Proteção contra atraso de voo (só Superflex) ──────────────────────────────
select is(pg_temp.b('basica', 'flight_delay_protection'), false, 'Básica sem proteção de voo');
select is(pg_temp.b('flex', 'flight_delay_protection'), false, 'Flex sem proteção de voo');
select is(pg_temp.b('superflex', 'flight_delay_protection'), true, 'Superflex com proteção de voo');

-- ── Suporte prioritário (só Superflex) ────────────────────────────────────────
select is(pg_temp.b('basica', 'priority_support'), false, 'Básica sem suporte prioritário');
select is(pg_temp.b('flex', 'priority_support'), false, 'Flex sem suporte prioritário');
select is(pg_temp.b('superflex', 'priority_support'), true, 'Superflex com suporte prioritário');

select * from finish();
rollback;
