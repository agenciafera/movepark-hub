-- O pré-voo do checkout externo passa a valer também no INSERT.
-- Spec: docs/specs/checkout-externo-por-local.md
--
-- `location_checkout_mode_guard` é BEFORE INSERT OR UPDATE. No INSERT com `checkout_mode`
-- 'external' ele chamava `location_external_readiness(new.id)`, que procura a unidade em
-- `public.location`. Só que em BEFORE INSERT a linha ainda não existe: o select não acha nada,
-- `v_missing` fica null e o pré-voo cai no ramo de unidade inexistente.
--
--   ERROR:  location_external_readiness: unidade 32fb5ee6-... não encontrada  (P0002)
--
-- Dois estragos. Criar unidade já em 'external' era impossível, por construção. E o erro mentia
-- sobre o motivo: a unidade não sumiu, ela ainda não nasceu, então quem lesse a mensagem iria
-- procurar dado apagado em vez de olhar o gatilho.
--
-- Passou em branco porque o caminho do Manager é o toggle, que é UPDATE, e o pgTAP
-- `checkout_mode_external.test.sql` só exercitava UPDATE. Quem pagou a conta foi o
-- `external_exit_click.test.sql`, cujo fixture cria a unidade externa direto no INSERT: o arquivo
-- abortava antes do primeiro teste ("planned 15 tests but ran 0") e mantinha o job `db` do CI
-- vermelho.
--
-- Quem responde o pré-voo é a EMPRESA (wl_public_domain, wl_domain, wl_tenant_key), e essa o
-- INSERT já tem na mão, em `new.company_id`. O De/Para depende das vagas, que no INSERT ainda não
-- existem: o conjunto sai vazio e o pré-voo aprova, que é a leitura certa. Unidade recém-criada
-- não tem tipo de vaga para mapear, e exigir mapeamento do que não existe travaria para sempre.
--
-- A regra não afrouxa em lugar nenhum: INSERT em 'external' com empresa incompleta continua
-- recusado, agora com o 23514 de sempre (violação de regra) no lugar do P0002 enganoso.

-- ─────────────── 1. O miolo do pré-voo, endereçável pela empresa ───────────────

-- Separado de `location_external_readiness` por um motivo só: no BEFORE INSERT não existe id de
-- unidade que se possa consultar, e existe id de empresa. A função pública continua sendo a porta
-- do Manager e não muda de assinatura nem de formato de resposta.
create or replace function public._external_readiness(
  p_company_id uuid,
  p_location_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_missing text[];
  v_unmapped_names text[];
begin
  -- Mesma régua da função pública: sem JWT é backend (service role, migration, seed); com JWT,
  -- só hub_admin. O gatilho já barrou antes de chegar aqui, e repetir custa nada.
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception '_external_readiness: apenas hub_admin' using errcode = '42501';
  end if;

  select array_remove(
    array[
      case when public.wl_public_host(c.wl_public_domain) is null then 'wl_public_domain' end,
      case when nullif(btrim(coalesce(c.wl_domain, '')), '') is null then 'wl_domain' end,
      case when nullif(btrim(coalesce(c.wl_tenant_key, '')), '') is null then 'wl_tenant_key' end
    ],
    null
  )
  into v_missing
  from public.company c
  where c.id = p_company_id;

  if v_missing is null then
    raise exception '_external_readiness: empresa % não encontrada', p_company_id
      using errcode = 'P0002';
  end if;

  -- No INSERT este select não devolve nada, e é o esperado: a unidade ainda não tem vaga.
  select coalesce(array_agg(pt.name order by pt.name), '{}'::text[])
  into v_unmapped_names
  from public.location_parking_type lpt
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.location_id = p_location_id
    and lpt.is_active
    and not (
      public.wl_slug_safe(lpt.wl_category_slug) and public.wl_slug_safe(lpt.wl_product_slug)
    );

  return jsonb_build_object(
    'ready', cardinality(v_missing) = 0 and cardinality(v_unmapped_names) = 0,
    'missing_company', to_jsonb(v_missing),
    'unmapped_count', cardinality(v_unmapped_names),
    'unmapped_names', to_jsonb(v_unmapped_names)
  );
end;
$$;

comment on function public._external_readiness(uuid, uuid) is
  'Miolo do pré-voo do checkout externo, endereçado pela empresa. Existe para o BEFORE INSERT de location, onde ainda não há linha em public.location para consultar. Use location_external_readiness(uuid) fora do gatilho.';

-- Função nova no schema public nasce executável por anon (default privilege). O revoke é nominal
-- de propósito: `from public` sozinho não tira o que anon já herdou.
revoke all on function public._external_readiness(uuid, uuid) from public, anon;
grant execute on function public._external_readiness(uuid, uuid) to authenticated, service_role;

-- ─────────────── 2. A porta do Manager, agora sobre o miolo ───────────────

-- Contrato intacto: mesma assinatura, mesmo jsonb de resposta, mesmo erro quando a unidade não
-- existe de verdade. É o que src/features/locations/api.ts consome.
create or replace function public.location_external_readiness(p_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'location_external_readiness: apenas hub_admin' using errcode = '42501';
  end if;

  select l.company_id into v_company_id
  from public.location l
  where l.id = p_location_id;

  if v_company_id is null then
    raise exception 'location_external_readiness: unidade % não encontrada', p_location_id
      using errcode = 'P0002';
  end if;

  return public._external_readiness(v_company_id, p_location_id);
end;
$$;

comment on function public.location_external_readiness(uuid) is
  'Pré-voo do checkout externo: o que falta na empresa (wl_public_domain/wl_domain/wl_tenant_key) e quais tipos de vaga ativos estão sem De/Para.';

revoke all on function public.location_external_readiness(uuid) from public, anon;
grant execute on function public.location_external_readiness(uuid) to authenticated, service_role;

-- ─────────────── 3. O gatilho pergunta pela empresa, não pela linha ───────────────

create or replace function public.location_checkout_mode_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_readiness jsonb;
begin
  if tg_op = 'INSERT' and new.checkout_mode = 'hub' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.checkout_mode is not distinct from old.checkout_mode then
    return new;
  end if;

  -- Sem JWT = backend (service role, migration, seed). Com JWT, só hub_admin.
  -- O anônimo não tem policy de escrita em location, então não chega aqui.
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'checkout_mode só pode ser alterado por hub_admin' using errcode = '42501';
  end if;

  if new.checkout_mode = 'external' then
    -- `new.company_id` em vez de `new.id`: no INSERT a linha ainda não está em public.location,
    -- e perguntar pelo id devolveria "unidade não encontrada". Ver o cabeçalho desta migration.
    v_readiness := public._external_readiness(new.company_id, new.id);
    if not (v_readiness ->> 'ready')::boolean then
      raise exception
        'unidade não está pronta para checkout externo: %', v_readiness::text
        using errcode = '23514';
    end if;
  end if;

  new.checkout_mode_changed_at := now();
  new.checkout_mode_changed_by := auth.uid();
  return new;
end;
$$;
