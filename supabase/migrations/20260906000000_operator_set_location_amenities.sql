-- Amenidades editáveis pelo parceiro (ClickUp 86ajnetje).
--
-- Até aqui não existia NENHUMA escrita em `location_amenity` no app: o único
-- caminho era o seed vindo do dump do legado. O parceiro não conseguia dizer
-- quais comodidades a unidade dele oferece, mesmo com esses benefícios
-- aparecendo no card da busca e no detalhe.
--
-- DOIS PROBLEMAS, NÃO UM:
--
-- 1. Faltava a RPC. Resolvida abaixo, com escopo `locations:write` (ADR-005),
--    que é o mesmo escopo de editar a unidade: amenidade é atributo dela.
--
-- 2. A policy `location_amenity_write` deixava QUALQUER membro da empresa
--    escrever, sem checagem de escopo. Ou seja, um papel `operator` (que não
--    tem `locations:write`) podia gravar direto pelo PostgREST, contornando a
--    RPC. É o mesmo padrão de furo do plano de cancelamento. A policy passa a
--    exigir o escopo, alinhando com a RPC.

create or replace function public.operator_set_location_amenities(
  p_location_id uuid,
  p_codes text[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_codes text[] := coalesce(p_codes, '{}');
  v_invalid text;
begin
  select company_id into v_company_id
  from public.location
  where id = p_location_id and deleted_at is null;

  if v_company_id is null then
    raise exception 'Unidade não encontrada.' using errcode = 'P0001';
  end if;

  if not public.is_hub_admin() and v_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão para editar esta unidade.' using errcode = '42501';
  end if;

  if not public.member_has_scope(v_company_id, 'locations:write') then
    raise exception 'Seu papel não permite editar a unidade (locations:write).' using errcode = '42501';
  end if;

  -- Código fora do catálogo é erro, não silêncio: gravar lixo aqui vira
  -- benefício fantasma no card da busca.
  select c into v_invalid
  from unnest(v_codes) as c
  where c not in (select code from public.amenity)
  limit 1;

  if v_invalid is not null then
    raise exception 'Comodidade desconhecida: %', v_invalid using errcode = 'P0001';
  end if;

  -- Substituição do conjunto inteiro, numa transação: a tela manda a lista
  -- final, e não um diff. Desmarcar tem que apagar de verdade.
  delete from public.location_amenity
  where location_id = p_location_id
    and amenity_code <> all (v_codes);

  insert into public.location_amenity (location_id, amenity_code)
  select p_location_id, c from unnest(v_codes) as c
  on conflict (location_id, amenity_code) do nothing;
end; $function$;

comment on function public.operator_set_location_amenities(uuid, text[]) is
  'Substitui o conjunto de comodidades de uma unidade. Exige locations:write na empresa dona (ADR-005). Valida os códigos contra o catálogo amenity.';

revoke all on function public.operator_set_location_amenities(uuid, text[]) from public, anon;
grant execute on function public.operator_set_location_amenities(uuid, text[]) to authenticated;

-- Fecha o furo: a policy aceitava qualquer membro da empresa, sem escopo.
drop policy if exists location_amenity_write on public.location_amenity;
create policy location_amenity_write on public.location_amenity
  for all
  using (
    public.is_hub_admin()
    or location_id in (
      select l.id from public.location l
      where public.member_has_scope(l.company_id, 'locations:write')
    )
  )
  with check (
    public.is_hub_admin()
    or location_id in (
      select l.id from public.location l
      where public.member_has_scope(l.company_id, 'locations:write')
    )
  );
