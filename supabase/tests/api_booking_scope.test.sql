-- pgTAP: as escritas de RESERVA da Public API. Ver public-api.md §9, booking-flow.md e ADR-005.
--
-- Último pedaço do recorte por empresa, junto com `api_read_scope`, `api_write_scope` e
-- `api_upsert_scope`. Estas cinco são as de maior consequência do conjunto: mexem numa
-- reserva já vendida, com um cliente do outro lado.
--
-- Se a vizinha alcançar uma reserva alheia, ela cancela a viagem de alguém, muda a data
-- de um voo ou registra entrada de um carro que não chegou. Nada disso gera erro para o
-- parceiro dono nem para o cliente: só o resultado errado, silencioso.
--
-- A fixture nasce e morre na transação. Uma reserva exige um ATOR (`booking_actor_check`:
-- `profile_id` ou `created_via_api_key_id`), e usar a chave de API é o caminho mais curto,
-- porque não precisa criar usuário em `auth.users` só para isso.

begin;
select plan(9);

-- ── fixture: duas empresas, e uma reserva confirmada da PRIMEIRA ─────────────
do $$
declare v_dona uuid; v_outra uuid; v_loc uuid; v_key uuid; v_bk uuid;
begin
  select l.company_id, l.id into v_dona, v_loc
  from public.location l where l.deleted_at is null limit 1;
  select c.id into v_outra from public.company c where c.id <> v_dona limit 1;

  insert into public.api_key (company_id, name, key_prefix, key_hash, environment)
  values (v_dona, 'pgtap', 'mp_pgtap', 'hash-pgtap', 'test')
  returning id into v_key;

  insert into public.booking (
    code, location_id, check_in_at, check_out_at, status, total_amount, created_via_api_key_id
  )
  values (
    'PGTAPBK', v_loc, now() + interval '2 days', now() + interval '5 days',
    'confirmed', 100, v_key
  )
  returning id into v_bk;

  perform set_config('test.dona', v_dona::text, false);
  perform set_config('test.outra', v_outra::text, false);
  perform set_config('test.bk', v_bk::text, false);
end $$;

select ok(
  nullif(current_setting('test.bk', true), '') is not null,
  'a fixture criou uma reserva confirmada e resolveu duas empresas'
);

-- ── a dona opera: sem isto, as recusas abaixo passariam por a função estar
--    simplesmente quebrada ─────────────────────────────────────────────────
select lives_ok(
  format(
    $q$ select public.api_checkin_booking(%L::uuid, %L::uuid) $q$,
    current_setting('test.dona'), current_setting('test.bk')
  ),
  'a empresa dona registra a entrada da própria reserva'
);

select is(
  (select status::text from public.booking where id = current_setting('test.bk')::uuid),
  'checked_in',
  'o check-in da dona chegou ao banco'
);

-- ── a vizinha não opera, em nenhuma das quatro ──────────────────────────────
select throws_ok(
  format(
    $q$ select public.api_checkout_booking(%L::uuid, %L::uuid) $q$,
    current_setting('test.outra'), current_setting('test.bk')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO registra a saída da reserva alheia'
);

-- Levantar não basta. Um check-out que gravasse antes de conferir liberaria a vaga e
-- encerraria a estadia de um carro que continua no pátio do outro parceiro.
select is(
  (select status::text from public.booking where id = current_setting('test.bk')::uuid),
  'checked_in',
  'a reserva continua em checked_in depois da tentativa da vizinha'
);

select throws_ok(
  format(
    $q$ select public.api_cancel_booking(%L::uuid, %L::uuid, 'motivo') $q$,
    current_setting('test.outra'), current_setting('test.bk')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO cancela a reserva alheia'
);

select is(
  (select status::text from public.booking where id = current_setting('test.bk')::uuid),
  'checked_in',
  'a reserva continua viva depois da tentativa de cancelamento'
);

select throws_ok(
  format(
    $q$ select public.api_change_booking_dates(%L::uuid, %L::uuid, now() + interval '9 days', now() + interval '11 days') $q$,
    current_setting('test.outra'), current_setting('test.bk')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO muda as datas da reserva alheia'
);

select throws_ok(
  format(
    $q$ select public.api_change_booking_vehicle(%L::uuid, %L::uuid, null, 'ABC1D23') $q$,
    current_setting('test.outra'), current_setting('test.bk')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO troca o veículo da reserva alheia'
);

select * from finish();
rollback;
