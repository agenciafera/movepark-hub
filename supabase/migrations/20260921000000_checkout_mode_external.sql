-- E0.14 · Modo de checkout por local e relação silenciosa com o parceiro
-- Spec: docs/specs/checkout-externo-por-local.md
--
-- Dois eixos, dois níveis, duas perguntas:
--   company.hub_relationship  → "o parceiro sabe que existe no Hub?"  (silent | onboarded)
--   location.checkout_mode    → "onde a reserva fecha?"               (hub | external)
--
-- Nada muda para quem já está no ar: os defaults ('onboarded' + 'hub') mantêm o
-- comportamento atual. Virar uma unidade para 'external' é ato de hub_admin, com
-- validação de pré-voo, e fica carimbado (quem e quando).

-- ─────────────────────────────── 1. Colunas ───────────────────────────────

alter table public.location
  add column if not exists checkout_mode text not null default 'hub',
  add column if not exists checkout_mode_changed_at timestamptz,
  add column if not exists checkout_mode_changed_by uuid references public.profiles(id);

alter table public.location
  drop constraint if exists location_checkout_mode_check;
alter table public.location
  add constraint location_checkout_mode_check check (checkout_mode in ('hub', 'external'));

comment on column public.location.checkout_mode is
  'Onde a reserva desta unidade fecha: hub (checkout da Movepark) ou external (white-label do parceiro). Gravável só por hub_admin (trigger location_checkout_mode_guard).';

alter table public.company
  add column if not exists hub_relationship text not null default 'onboarded',
  add column if not exists wl_public_domain text;

alter table public.company
  drop constraint if exists company_hub_relationship_check;
alter table public.company
  add constraint company_hub_relationship_check check (hub_relationship in ('silent', 'onboarded'));

comment on column public.company.hub_relationship is
  'silent = o parceiro não sabe que existe no Hub (sem e-mail, sem onboarding, sem recebedor, sem usuário). onboarded = relação ativa.';
comment on column public.company.wl_public_domain is
  'Domínio do FRONTEND do white-label (ex.: virapark.movepark.co). NÃO derivar de wl_domain, que é o backend (virapark-app.movepark.co): quebra no dia em que o parceiro usar domínio próprio.';

-- Índice parcial: a vitrine e os relatórios perguntam "quais unidades saem para fora?".
create index if not exists location_checkout_mode_external_idx
  on public.location (company_id)
  where checkout_mode = 'external';

-- ───────────────────────── 2. Host público do white-label ─────────────────────────

-- Espelha normalizeWlDomain() do _shared/wl/client.ts: guarda-se o que o operador digitar,
-- normaliza-se na leitura (sem esquema, sem path, minúsculo).
create or replace function public.wl_public_host(p_domain text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select nullif(
    lower(
      regexp_replace(
        regexp_replace(btrim(coalesce(p_domain, '')), '^https?://', '', 'i'),
        '/.*$', ''
      )
    ),
    ''
  );
$$;

-- Slug do De/Para entra numa URL, e quem grava é o parceiro (escopo `parking-types:write`),
-- não a Movepark. Um slug com `?`, `#` ou `&` fecharia a URL antes dos nossos parâmetros e
-- derrubaria a marcação de afiliado sem nenhum relatório acusar. Formato inválido não gera link.
create or replace function public.wl_slug_safe(p_slug text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select btrim(coalesce(p_slug, '')) ~ '^[a-z0-9][a-z0-9._-]*$';
$$;

-- ─────────────────────── 3. URL de saída: compõe no servidor ───────────────────────

-- Campo computado do PostgREST: `select("id, external_checkout_url")` em
-- location_parking_type devolve a URL pronta. O front NUNCA monta essa URL.
--
-- A marcação de afiliado é o que separa 17% de 9% de participação. Se um link sair sem
-- ela, a receita cai quase pela metade naquela venda e nenhum relatório avisa. Por isso
-- ela vive aqui dentro, num lugar só, coberto por teste.
--
-- SECURITY DEFINER de propósito: a unidade externa costuma ser de empresa que não passa
-- no gate de catálogo (catalog_read_company exige onboarding_status = 'active'), e o join
-- voltaria vazio para o anônimo. O retorno é uma URL pública do parceiro, nada sensível.
create or replace function public.external_checkout_url(lpt public.location_parking_type)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when l.checkout_mode <> 'external' then null
    when public.wl_public_host(c.wl_public_domain) is null then null
    when not public.wl_slug_safe(lpt.wl_category_slug) then null
    when not public.wl_slug_safe(lpt.wl_product_slug) then null
    else
      'https://' || public.wl_public_host(c.wl_public_domain)
      || '/' || btrim(lpt.wl_category_slug)
      || '/' || btrim(lpt.wl_product_slug)
      || '?utm_source=movepark&utm_medium=organic&utm_campaign=afiliado-movepark'
  end
  from public.location l
  join public.company c on c.id = l.company_id
  where l.id = lpt.location_id;
$$;

comment on function public.external_checkout_url(public.location_parking_type) is
  'URL de saída para o checkout do white-label, com a marcação de afiliado. Null quando a unidade não é external ou o De/Para está incompleto.';

revoke all on function public.external_checkout_url(public.location_parking_type) from public;
grant execute on function public.external_checkout_url(public.location_parking_type)
  to anon, authenticated, service_role;

-- ───────────────────────── 4. Pré-voo do modo external ─────────────────────────

-- Responde "dá para ligar external nesta unidade?" e, quando não dá, POR QUÊ: o toggle
-- do Manager mostra o motivo na tela, não fica só cinza.
create or replace function public.location_external_readiness(p_location_id uuid)
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
  -- Sem JWT = contexto de backend (service role, migration, seed). Com JWT, só hub_admin.
  -- O anônimo nem chega aqui: o EXECUTE dele está revogado.
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'location_external_readiness: apenas hub_admin' using errcode = '42501';
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
  from public.location l
  join public.company c on c.id = l.company_id
  where l.id = p_location_id;

  if v_missing is null then
    raise exception 'location_external_readiness: unidade % não encontrada', p_location_id
      using errcode = 'P0002';
  end if;

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

comment on function public.location_external_readiness(uuid) is
  'Pré-voo do checkout externo: o que falta na empresa (wl_public_domain/wl_domain/wl_tenant_key) e quais tipos de vaga ativos estão sem De/Para.';

revoke all on function public.location_external_readiness(uuid) from public, anon;
grant execute on function public.location_external_readiness(uuid) to authenticated, service_role;

-- ──────────────────── 5. checkout_mode é regra dura, não escopo ────────────────────

-- Esconder o campo no React não é permissão: sob locations:write um operador mudaria por
-- API sem ver a tela. E não vira escopo em api_scope: chave de parceiro nunca decide onde
-- a reserva acontece. Fica no banco, como trigger.
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
    v_readiness := public.location_external_readiness(new.id);
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

drop trigger if exists location_checkout_mode_guard on public.location;
create trigger location_checkout_mode_guard
  before insert or update of checkout_mode on public.location
  for each row execute function public.location_checkout_mode_guard();

-- hub_relationship segue a mesma régua. A RLS de company já é hub_admin-only, mas a regra
-- mora junto do dado: quem passar por RPC ou security definer esbarra nela do mesmo jeito.
create or replace function public.company_hub_relationship_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.hub_relationship is not distinct from old.hub_relationship then
    return new;
  end if;
  if tg_op = 'INSERT' and new.hub_relationship = 'onboarded' then
    return new;
  end if;

  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'hub_relationship só pode ser alterado por hub_admin' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists company_hub_relationship_guard on public.company;
create trigger company_hub_relationship_guard
  before insert or update of hub_relationship on public.company
  for each row execute function public.company_hub_relationship_guard();

-- ─────────────────────────── 6. Guardas de silêncio ───────────────────────────

create or replace function public.company_is_silent(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.company c
    where c.id = p_company_id and c.hub_relationship = 'silent'
  );
$$;

-- Sem EXECUTE para o cliente: quem consulta é a guarda (SECURITY DEFINER, roda como dona da
-- função) e o backend. Deixar aberto a `authenticated` entregaria de graça um oráculo de quais
-- empresas são silenciosas.
revoke all on function public.company_is_silent(uuid) from public, anon, authenticated;
grant execute on function public.company_is_silent(uuid) to service_role;

-- Um único e-mail automático derruba a estratégia inteira, e é irreversível. As guardas
-- são de entrada: enquanto a empresa é silent, não nasce onboarding, nem recebedor, nem
-- vínculo de usuário. Nada é removido retroativamente; desfazer é decisão de gente.
create or replace function public.assert_company_not_silent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A guarda é de ENTRADA: o que não pode é a linha NASCER numa empresa silenciosa. Atualizar
  -- linha que já existe segue livre, senão o cron `refresh-recipients` (que sincroniza o status
  -- do recebedor com o gateway a cada volta) passaria a estourar justamente na empresa que a
  -- gente silenciou. Só o UPDATE que MUDA de empresa é entrada disfarçada, e esse cai aqui.
  if tg_op = 'UPDATE' and new.company_id is not distinct from old.company_id then
    return new;
  end if;

  if public.company_is_silent(new.company_id) then
    raise exception
      'empresa silenciosa (hub_relationship = silent): % bloqueado em %', tg_op, tg_table_name
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists company_onboarding_silence_guard on public.company_onboarding;
create trigger company_onboarding_silence_guard
  before insert or update on public.company_onboarding
  for each row execute function public.assert_company_not_silent();

drop trigger if exists payout_recipient_silence_guard on public.payout_recipient;
create trigger payout_recipient_silence_guard
  before insert or update on public.payout_recipient
  for each row execute function public.assert_company_not_silent();

drop trigger if exists profile_company_silence_guard on public.profile_company;
create trigger profile_company_silence_guard
  before insert or update on public.profile_company
  for each row execute function public.assert_company_not_silent();

-- Sem fluxo de onboarding também significa não mexer no estado de catálogo da empresa
-- enquanto ela é silenciosa.
create or replace function public.company_silent_onboarding_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.onboarding_status is distinct from old.onboarding_status
     and new.hub_relationship = 'silent'
     and old.hub_relationship = 'silent' then
    raise exception 'empresa silenciosa não muda onboarding_status' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists company_silent_onboarding_guard on public.company;
create trigger company_silent_onboarding_guard
  before update of onboarding_status on public.company
  for each row execute function public.company_silent_onboarding_guard();

-- Função-trigger não é RPC: o grant default (PUBLIC/anon/authenticated) só permitiria chamada
-- direta, que não deve existir. Mesmo hardening de 20260807000001/2, agora para as guardas novas.
-- Existe um teste de invariante (anon_privileged_rpcs) que falha se uma trigger nova nascer aberta.
do $$
declare r record;
begin
  for r in
    select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public'
      and t.typname = 'trigger'
      and p.proname in (
        'location_checkout_mode_guard',
        'company_hub_relationship_guard',
        'assert_company_not_silent',
        'company_silent_onboarding_guard'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
