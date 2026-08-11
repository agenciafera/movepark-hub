-- Escalação de privilégio: parceiro podia se dar escopo de PLATAFORMA.
--
-- `api_assert_scopes` guardava a criação e a edição de chave de API, mas só
-- recusava `assignable_to_api_key = false`. Nunca olhou `is_platform_scope`.
--
-- Efeito prático, verificado em 11/08/2026: qualquer membro com `api-keys:write`
-- (o papel Dono tem) chamava `operator_create_api_key` pedindo `blog:write` ou
-- `checkout:link`, e a chave saía com o escopo. Com ela o parceiro escrevia,
-- publicava e excluía post do blog da Movepark, ou gerava link de checkout com a
-- marcação do bot interno. O painel ainda listava esses escopos na tela, porque
-- `fetchScopes()` lia `api_scope` sem filtro.
--
-- `fares:write` escapou por acidente, não por desenho: ele tem
-- `assignable_to_api_key = false`, então caía na outra checagem.
--
-- A regra correta: escopo de plataforma pertence à Movepark. Só `is_hub_admin()`
-- pode colocá-lo numa chave, e é assim que a chave do bot interno continua sendo
-- emitida. Para membro de empresa, agora é recusa explícita.
--
-- Ver ADR-005 (permissões por escopo) e docs/specs/permissions.md.

create or replace function public.api_assert_scopes(p_scopes text[])
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_bad text;
begin
  if p_scopes is null then return; end if;

  select s into v_bad from unnest(p_scopes) s
  where s not in (select scope from public.api_scope) limit 1;
  if v_bad is not null then
    raise exception 'Escopo inválido: %', v_bad using errcode = 'P0001';
  end if;

  select s.scope into v_bad
  from public.api_scope s
  where s.scope = any(p_scopes) and s.assignable_to_api_key = false limit 1;
  if v_bad is not null then
    raise exception 'Escopo não disponível para chave de API: %', v_bad using errcode = 'P0001';
  end if;

  -- Escopo de plataforma: só a Movepark emite.
  if not public.is_hub_admin() then
    select s.scope into v_bad
    from public.api_scope s
    where s.scope = any(p_scopes) and s.is_platform_scope limit 1;
    if v_bad is not null then
      raise exception 'Escopo exclusivo da Movepark: %', v_bad using errcode = '42501';
    end if;
  end if;
end; $function$;

comment on function public.api_assert_scopes(text[]) is
  'Valida escopos de chave de API: existe no catálogo, é atribuível, e (se for de plataforma) só para hub_admin.';
