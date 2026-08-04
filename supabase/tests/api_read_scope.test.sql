-- pgTAP: recorte por empresa nas LEITURAS da Public API. Ver public-api.md §9 e ADR-005.
--
-- O `api_isolation.test.sql` cobre os helpers (`api_assert_lpt_company`,
-- `api_key_assert_company_access`). Este cobre o efeito deles onde o parceiro
-- realmente encosta: as funções de listar e buscar.
--
-- O caso que importa não é o estranho sem chave, é a empresa VIZINHA: um parceiro
-- legítimo, com chave válida, pedindo um id que não é dele. Se o recorte afrouxar, a
-- resposta continua 200 e o dado do vizinho sai pela porta da frente.

begin;
select plan(8);

-- ── fixture: uma unidade viva, a empresa dona e uma empresa vizinha ──────────
do $$
declare v_loc uuid; v_dona uuid; v_outra uuid;
begin
  select l.id, l.company_id into v_loc, v_dona
  from public.location l
  where l.deleted_at is null
  limit 1;
  select c.id into v_outra from public.company c where c.id <> v_dona limit 1;
  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.dona', v_dona::text, false);
  perform set_config('test.outra', v_outra::text, false);
end $$;

select ok(
  nullif(current_setting('test.loc', true), '') is not null
    and nullif(current_setting('test.outra', true), '') is not null,
  'a fixture resolveu uma unidade viva e duas empresas distintas'
);

-- ── listar: cada empresa vê a própria unidade, e só ela ──────────────────────
select ok(
  public.api_list_locations(current_setting('test.dona')::uuid, 100, 0)::text
    like '%' || current_setting('test.loc') || '%',
  'a empresa dona encontra a própria unidade na listagem'
);

-- A asserção central do arquivo. Vale a pena ler o par junto com a de cima: sem a
-- primeira, esta passaria por a listagem estar simplesmente vazia ou quebrada.
select ok(
  public.api_list_locations(current_setting('test.outra')::uuid, 100, 0)::text
    not like '%' || current_setting('test.loc') || '%',
  'a empresa vizinha NÃO encontra a unidade alheia na listagem'
);

-- ── buscar por id: a dona passa, a vizinha leva erro de domínio ──────────────
select lives_ok(
  format(
    $q$ select public.api_get_location(%L::uuid, %L::uuid) $q$,
    current_setting('test.dona'), current_setting('test.loc')
  ),
  'a empresa dona busca a própria unidade por id'
);

-- P0001 e não 42501 de propósito: para quem está de fora, "não é sua" e "não existe"
-- precisam ser a mesma resposta. Um erro de permissão distinto confirmaria a
-- existência do id para quem estivesse varrendo.
select throws_ok(
  format(
    $q$ select public.api_get_location(%L::uuid, %L::uuid) $q$,
    current_setting('test.outra'), current_setting('test.loc')
  ),
  'P0001',
  null::text,
  'a empresa vizinha NÃO busca a unidade alheia por id'
);

-- ── forma da resposta: lista é sempre array, mesmo sem nada para listar ──────
-- Um null aqui viraria `null` no corpo do JSON e quebraria o cliente que itera,
-- num caso que acontece o tempo todo: parceiro novo, sem cupom nem serviço.
select is(
  jsonb_typeof(public.api_list_coupons(current_setting('test.outra')::uuid)),
  'array',
  'api_list_coupons devolve array, nunca null'
);

select is(
  jsonb_typeof(public.api_list_addons(current_setting('test.outra')::uuid)),
  'array',
  'api_list_addons devolve array, nunca null'
);

select is(
  jsonb_typeof(public.api_list_locations(current_setting('test.outra')::uuid, 100, 0)),
  'array',
  'api_list_locations devolve array, nunca null'
);

select * from finish();
rollback;
