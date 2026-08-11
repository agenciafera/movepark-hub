-- Chave de API da Movepark (sem empresa dona).
--
-- `api_key.company_id` era NOT NULL, então uma chave de plataforma teria que ser
-- pendurada em algum parceiro. Duas consequências ruins: ela apareceria na tela
-- de chaves daquele parceiro (`operator_list_api_keys` filtra por empresa), e ele
-- poderia revogar ou rotacionar a chave que a Movepark usa.
--
-- Chave de plataforma agora tem `company_id is null`. Nenhum código precisou
-- mudar para isso funcionar: `api_key_verify` já devolve o campo como veio, o
-- gateway só usa `company_id` nas rotas tenant-scoped, e a listagem do operador
-- compara com igualdade, então nula nunca casa.

alter table public.api_key alter column company_id drop not null;

-- A regra "sem empresa ⇒ só escopo de plataforma" precisa consultar o catálogo,
-- e CHECK não faz subconsulta. Trigger, então.
create or replace function public.api_key_assert_ownership()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_bad text;
begin
  if new.company_id is not null then
    -- Chave de parceiro nunca carrega escopo de plataforma. `api_assert_scopes`
    -- já barra na RPC; aqui é a trava de tabela, que pega escrita por qualquer
    -- caminho, inclusive service_role.
    select s.scope into v_bad
    from public.api_scope s
    where s.scope = any(new.scopes) and s.is_platform_scope limit 1;
    if v_bad is not null then
      raise exception 'Chave de empresa não pode ter escopo de plataforma: %', v_bad
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Sem empresa: é chave da Movepark, e só escopo de plataforma justifica isso.
  select s.scope into v_bad
  from public.api_scope s
  where s.scope = any(new.scopes) and not s.is_platform_scope limit 1;
  if v_bad is not null then
    raise exception 'Chave da Movepark só aceita escopo de plataforma: %', v_bad
      using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.api_key_assert_ownership() from public, anon, authenticated;

drop trigger if exists api_key_assert_ownership on public.api_key;
create trigger api_key_assert_ownership
  before insert or update of company_id, scopes on public.api_key
  for each row execute function public.api_key_assert_ownership();

-- ── RPCs da Movepark ────────────────────────────────────────────────────────

create or replace function public.hub_create_platform_api_key(
  p_name text,
  p_environment text,
  p_scopes text[],
  p_expires_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_secret text; v_key text; v_prefix text; v_hash text; v_id uuid; v_name text;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a equipe Movepark emite chave de plataforma.' using errcode = '42501';
  end if;
  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'Nome da chave é obrigatório.' using errcode = 'P0001';
  end if;
  if coalesce(p_environment, '') not in ('live','test') then
    raise exception 'Ambiente inválido (use live ou test).' using errcode = 'P0001';
  end if;
  if p_scopes is null or array_length(p_scopes, 1) is null then
    raise exception 'Selecione ao menos um escopo.' using errcode = 'P0001';
  end if;
  perform public.api_assert_scopes(p_scopes);

  v_secret := translate(encode(extensions.gen_random_bytes(30), 'base64'), '+/=', '-_');
  v_key    := 'mp_' || p_environment || '_' || v_secret;
  v_prefix := left(v_key, 16);
  v_hash   := encode(extensions.digest(v_key::bytea, 'sha256'), 'hex');

  insert into public.api_key
    (company_id, name, key_prefix, key_hash, environment, scopes, expires_at, created_by)
  values
    (null, v_name, v_prefix, v_hash, p_environment, p_scopes, p_expires_at, auth.uid())
  returning id into v_id;

  -- O segredo aparece uma vez só, igual à chave de parceiro.
  return jsonb_build_object('id', v_id, 'key', v_key, 'key_prefix', v_prefix);
end $$;

create or replace function public.hub_list_platform_api_keys()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Acesso restrito à equipe Movepark.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', k.id,
      'name', k.name,
      'key_prefix', k.key_prefix,
      'environment', k.environment,
      'scopes', k.scopes,
      'last_used_at', k.last_used_at,
      'expires_at', k.expires_at,
      'created_at', k.created_at,
      'status', case
        when k.revoked_at is not null then 'revoked'
        when k.expires_at is not null and k.expires_at < now() then 'expired'
        else 'active' end
    ) order by k.created_at desc)
    from public.api_key k
    where k.company_id is null and k.deleted_at is null
  ), '[]'::jsonb);
end $$;

create or replace function public.hub_revoke_platform_api_key(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Acesso restrito à equipe Movepark.' using errcode = '42501';
  end if;
  update public.api_key
     set revoked_at = now()
   where id = p_id and company_id is null and revoked_at is null;
end $$;

-- Default privilege do Supabase deixa função nova executável por anon; revoga
-- nominalmente, não só de public (ver docs/specs/permissions.md).
revoke all on function public.hub_create_platform_api_key(text, text, text[], timestamptz)
  from public, anon;
revoke all on function public.hub_list_platform_api_keys() from public, anon;
revoke all on function public.hub_revoke_platform_api_key(uuid) from public, anon;
grant execute on function public.hub_create_platform_api_key(text, text, text[], timestamptz)
  to authenticated;
grant execute on function public.hub_list_platform_api_keys() to authenticated;
grant execute on function public.hub_revoke_platform_api_key(uuid) to authenticated;
