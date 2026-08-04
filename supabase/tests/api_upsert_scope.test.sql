-- pgTAP: os `upsert` da Public API. Ver public-api.md §9 e ADR-005.
--
-- Completa a trinca com `api_read_scope` e `api_write_scope`. Os upsert são o caso mais
-- delicado das escritas porque o MESMO endpoint cria e edita, distinguindo os dois pelo
-- `p_id`. Duas coisas podem dar errado aí, e só uma delas aparece como erro:
--
--   1. o id vaza numa criação  → sobrescreve um registro que já existia
--   2. o id alheio é aceito    → a empresa vizinha edita o que não é dela
--
-- O caso 2 é o que este arquivo persegue, e o caso 1 está coberto no lado do cliente
-- (`src/features/coupons/api.test.tsx` e vizinhos).

begin;
select plan(12);

-- ── fixture: duas empresas e uma unidade da primeira ─────────────────────────
do $$
declare v_dona uuid; v_outra uuid; v_loc uuid;
begin
  select l.company_id, l.id into v_dona, v_loc
  from public.location l where l.deleted_at is null limit 1;
  select c.id into v_outra from public.company c where c.id <> v_dona limit 1;
  perform set_config('test.dona', v_dona::text, false);
  perform set_config('test.outra', v_outra::text, false);
  perform set_config('test.loc', v_loc::text, false);
end $$;

select ok(
  nullif(current_setting('test.outra', true), '') is not null,
  'a fixture resolveu duas empresas distintas e uma unidade'
);

-- ── cupom: cria, edita, e a vizinha não encosta ──────────────────────────────
do $$
declare v_cup uuid;
begin
  v_cup := public.api_upsert_coupon(
    current_setting('test.dona')::uuid, null, 'PGTAP-W', 'desc', 'percent', 10,
    null, null, null, true, 0, null, null, null, null
  );
  perform set_config('test.cup', v_cup::text, false);
end $$;

select ok(
  nullif(current_setting('test.cup', true), '') is not null,
  'api_upsert_coupon com p_id nulo CRIA e devolve o id'
);

select is(
  (select code from public.coupon where id = current_setting('test.cup')::uuid),
  'PGTAP-W',
  'o cupom criado tem o código que foi pedido'
);

-- Mesmo endpoint, agora com id: tem que editar a linha existente, não criar outra.
do $$
begin
  perform public.api_upsert_coupon(
    current_setting('test.dona')::uuid, current_setting('test.cup')::uuid,
    'PGTAP-W2', 'desc', 'percent', 20,
    null, null, null, true, 0, null, null, null, null
  );
end $$;

select is(
  (select count(*)::int from public.coupon
    where company_id = current_setting('test.dona')::uuid and code like 'PGTAP-W%'),
  1,
  'api_upsert_coupon com p_id EDITA a linha existente, não cria outra'
);

select is(
  (select code from public.coupon where id = current_setting('test.cup')::uuid),
  'PGTAP-W2',
  'a edição da dona chegou ao banco'
);

select throws_ok(
  format(
    $q$ select public.api_upsert_coupon(%L::uuid, %L::uuid, 'INVADIDO', 'x', 'percent', 99,
        null, null, null, true, 0, null, null, null, null) $q$,
    current_setting('test.outra'), current_setting('test.cup')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO edita o cupom alheio pelo upsert'
);

-- Levantar não basta: o upsert poderia ter gravado antes de conferir.
select is(
  (select code from public.coupon where id = current_setting('test.cup')::uuid),
  'PGTAP-W2',
  'o cupom continua com o código da dona depois da tentativa da vizinha'
);

-- ── serviço adicional: cria, liga na unidade, e a vizinha não encosta ────────
do $$
declare v_add uuid;
begin
  v_add := public.api_upsert_addon(
    current_setting('test.dona')::uuid, null, 'pgtap-w', 'Addon W', null, 25, true, 0
  );
  perform set_config('test.add', v_add::text, false);
end $$;

select ok(
  nullif(current_setting('test.add', true), '') is not null,
  'api_upsert_addon com p_id nulo CRIA e devolve o id'
);

select throws_ok(
  format(
    $q$ select public.api_upsert_addon(%L::uuid, %L::uuid, 'hack', 'Hack', null, 1, true, 0) $q$,
    current_setting('test.outra'), current_setting('test.add')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO edita o serviço alheio pelo upsert'
);

select lives_ok(
  format(
    $q$ select public.api_set_location_addon(%L::uuid, %L::uuid, %L::uuid, true, 30) $q$,
    current_setting('test.dona'), current_setting('test.add'), current_setting('test.loc')
  ),
  'a empresa dona liga o serviço na própria unidade'
);

select throws_ok(
  format(
    $q$ select public.api_set_location_addon(%L::uuid, %L::uuid, %L::uuid, true, 1) $q$,
    current_setting('test.outra'), current_setting('test.add'), current_setting('test.loc')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO liga serviço na unidade alheia'
);

-- ── desconto: criado pela dona, intocável pela vizinha ───────────────────────
do $$
declare v_dsc uuid;
begin
  v_dsc := public.api_upsert_discount(
    current_setting('test.dona')::uuid, null, current_setting('test.loc')::uuid,
    'Promo W', null, 'percent', 15,
    null, null, null, null, null, false, 0, true, 0, null
  );
  perform set_config('test.dsc', v_dsc::text, false);
end $$;

select throws_ok(
  format(
    $q$ select public.api_delete_discount(%L::uuid, %L::uuid) $q$,
    current_setting('test.outra'), current_setting('test.dsc')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO exclui a regra de desconto alheia'
);

select * from finish();
rollback;
