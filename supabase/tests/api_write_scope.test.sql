-- pgTAP: recorte por empresa nas ESCRITAS da Public API. Ver public-api.md §9 e ADR-005.
--
-- Fecha o par do `api_read_scope.test.sql`. Ler dado alheio é vazamento; escrever é pior:
-- a empresa vizinha desativaria o cupom de outra, apagaria o serviço de outra, renomearia
-- a unidade de outra. Nada disso apareceria como erro para quem sofreu.
--
-- Todas as funções aqui recebem `p_company_id` já resolvido pelo gateway e filtram por ele
-- na própria consulta, então a chamada com empresa errada não toca linha nenhuma antes de
-- levantar. É essa invariante que o arquivo prende.
--
-- As fixtures nascem e morrem dentro da transação: o seed não tem cupom nem serviço, e
-- depender de dado de produção deixaria o teste verde por acaso.

begin;
select plan(9);

-- ── fixture: duas empresas, e um cupom + um serviço da PRIMEIRA ──────────────
do $$
declare v_dona uuid; v_outra uuid; v_loc uuid; v_lpt uuid; v_cup uuid; v_add uuid;
begin
  select l.company_id, l.id into v_dona, v_loc
  from public.location l where l.deleted_at is null limit 1;
  select c.id into v_outra from public.company c where c.id <> v_dona limit 1;
  select lpt.id into v_lpt
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where l.company_id = v_dona limit 1;

  insert into public.coupon (company_id, code, discount_type, discount_value, is_active)
  values (v_dona, 'PGTAP-SCOPE', 'percent', 10, true)
  returning id into v_cup;

  insert into public.add_on_service (company_id, code, name, base_price, is_active)
  values (v_dona, 'pgtap-scope', 'Serviço pgTAP', 10, true)
  returning id into v_add;

  perform set_config('test.dona', v_dona::text, false);
  perform set_config('test.outra', v_outra::text, false);
  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.lpt', coalesce(v_lpt::text, ''), false);
  perform set_config('test.cup', v_cup::text, false);
  perform set_config('test.add', v_add::text, false);
end $$;

select ok(
  nullif(current_setting('test.cup', true), '') is not null
    and nullif(current_setting('test.outra', true), '') is not null,
  'a fixture criou o cupom e resolveu duas empresas distintas'
);

-- ── a dona escreve: o caminho feliz precisa existir, senão as recusas abaixo
--    passariam por a função estar simplesmente quebrada ─────────────────────
select lives_ok(
  format(
    $q$ select public.api_set_coupon_active(%L::uuid, %L::uuid, false) $q$,
    current_setting('test.dona'), current_setting('test.cup')
  ),
  'a empresa dona desativa o próprio cupom'
);

select is(
  (select is_active from public.coupon where id = current_setting('test.cup')::uuid),
  false,
  'a desativação da dona chegou ao banco'
);

-- ── a vizinha não escreve, em nenhuma das funções ────────────────────────────
select throws_ok(
  format(
    $q$ select public.api_set_coupon_active(%L::uuid, %L::uuid, true) $q$,
    current_setting('test.outra'), current_setting('test.cup')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO reativa o cupom alheio'
);

-- A asserção que dá peso à de cima: não basta levantar, tem que não ter mexido. Uma
-- função que atualizasse e só depois checasse deixaria o cupom reativado.
select is(
  (select is_active from public.coupon where id = current_setting('test.cup')::uuid),
  false,
  'o cupom continua desativado depois da tentativa da vizinha'
);

select throws_ok(
  format(
    $q$ select public.api_delete_coupon(%L::uuid, %L::uuid) $q$,
    current_setting('test.outra'), current_setting('test.cup')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO exclui o cupom alheio'
);

select is(
  (select count(*)::int from public.coupon where id = current_setting('test.cup')::uuid),
  1,
  'o cupom continua existindo depois da tentativa de exclusão'
);

select throws_ok(
  format(
    $q$ select public.api_delete_addon(%L::uuid, %L::uuid) $q$,
    current_setting('test.outra'), current_setting('test.add')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO exclui o serviço adicional alheio'
);

select throws_ok(
  format(
    $q$ select public.api_update_location(%L::uuid, %L::uuid, 'Renomeada pela vizinha', null, null, null, null, null, null) $q$,
    current_setting('test.outra'), current_setting('test.loc')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO renomeia a unidade alheia'
);

select * from finish();
rollback;
