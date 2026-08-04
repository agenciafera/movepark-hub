-- pgTAP: as três funções que sustentam o isolamento da Public API. Ver public-api.md
-- §2/§12, permissions.md e ADR-005.
--
-- `api_key_assert_company_access`, `api_assert_lpt_company` e `api_assert_scopes` são
-- chamadas por praticamente toda `api_*`, e não tinham nenhuma asserção. Elas são o
-- ponto onde "a chave da empresa A alcança o recurso da empresa B" é recusado: se uma
-- delas afrouxar, o vazamento é entre inquilinos e silencioso, porque a resposta
-- continua 200 com o dado do vizinho.
--
-- Os erros são asseridos pelo `errcode`, não pela mensagem: mensagem é copy e pode ser
-- reescrita; o código é contrato com o gateway, que o traduz em 403/404 para o parceiro.

begin;
select plan(13);

-- ── existência ───────────────────────────────────────────────────────────────
select has_function('public', 'api_assert_lpt_company', 'api_assert_lpt_company existe');
select has_function('public', 'api_assert_scopes', 'api_assert_scopes existe');
select has_function(
  'public', 'api_key_assert_company_access', 'api_key_assert_company_access existe'
);

-- ── fixture: um tipo de vaga vivo do seed, sua empresa e uma empresa vizinha ──
do $$
declare v_lpt uuid; v_dona uuid; v_outra uuid;
begin
  select lpt.id, l.company_id into v_lpt, v_dona
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where l.deleted_at is null
  limit 1;
  select c.id into v_outra from public.company c where c.id <> v_dona limit 1;
  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.dona', v_dona::text, false);
  perform set_config('test.outra', v_outra::text, false);
end $$;

-- Sem esta checagem, um seed sem tipo de vaga faria as próximas asserções
-- estourarem num cast de string vazia para uuid, e a mensagem não diria o motivo.
select ok(
  nullif(current_setting('test.lpt', true), '') is not null,
  'a fixture resolveu um tipo de vaga vivo do seed'
);

-- ── isolamento por empresa: a dona passa, a vizinha não ──────────────────────
select lives_ok(
  format(
    $q$ select public.api_assert_lpt_company(%L::uuid, %L::uuid) $q$,
    current_setting('test.dona'), current_setting('test.lpt')
  ),
  'a empresa dona alcança o próprio tipo de vaga'
);

-- O caso que dá nome ao arquivo. A vizinha não é um estranho sem chave: é um parceiro
-- legítimo, com chave válida, pedindo um id que não é dele.
select throws_ok(
  format(
    $q$ select public.api_assert_lpt_company(%L::uuid, %L::uuid) $q$,
    current_setting('test.outra'), current_setting('test.lpt')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO alcança o tipo de vaga alheio'
);

-- ── catálogo de escopos ──────────────────────────────────────────────────────
select throws_ok(
  $q$ select public.api_assert_scopes(array['escopo:inexistente']) $q$,
  'P0001',
  null::text,
  'escopo fora do catálogo é recusado'
);

-- ADR-005: escopo interno não pode ir para uma chave de API. `payouts:write` é o caso
-- extremo (saque e KYC, exclusivo do Dono): numa chave, viraria dinheiro por HTTP.
select throws_ok(
  $q$ select public.api_assert_scopes(array['payouts:write']) $q$,
  'P0001',
  null::text,
  'escopo interno (payouts:write) é recusado numa chave de API'
);

-- O dado que sustenta a asserção acima. Sem ele, um flip do catálogo passaria calado.
select is(
  (select assignable_to_api_key from public.api_scope where scope = 'payouts:write'),
  false,
  'payouts:write não é atribuível a chave de API'
);

select lives_ok(
  $q$ select public.api_assert_scopes(array['bookings:read']) $q$,
  'escopo atribuível passa'
);

-- Nulo é ausência de restrição, não escopo inválido: a chamada precisa passar limpa.
select lives_ok(
  $q$ select public.api_assert_scopes(null) $q$,
  'lista de escopos nula não levanta'
);

-- ── acesso a chaves de API: sem sessão, ninguém entra ────────────────────────
-- Aqui `auth.uid()` é nulo (pgTAP roda sem JWT) e `is_hub_admin()` é falso, então o
-- caminho exercitado é o de quem não tem vínculo nenhum com a empresa. O errcode é
-- 42501 (insufficient_privilege), diferente do P0001 das validações de domínio.
select throws_ok(
  format(
    $q$ select public.api_key_assert_company_access(%L::uuid) $q$,
    current_setting('test.dona')
  ),
  '42501',
  null::text,
  'sem vínculo com a empresa, gerir chaves é recusado com 42501'
);

-- ── as três são SECURITY DEFINER e fora do alcance de anon ───────────────────
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'api_assert_lpt_company', 'api_assert_scopes', 'api_key_assert_company_access'
      )
      and (not p.prosecdef or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  0,
  'as três são SECURITY DEFINER e nenhuma é executável por anon'
);

select * from finish();
rollback;
