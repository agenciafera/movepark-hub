-- Plano de cancelamento (Básica/Flex/Superflex) é produto da Movepark, não do
-- parceiro: quem define preço e disponibilidade é a equipe interna.
--
-- O RLS de `location_fare` e `fare` já exigia `is_hub_admin()` para escrita. O
-- furo era esta RPC: sendo SECURITY DEFINER, ela passa por cima do RLS, e
-- aceitava qualquer membro da empresa que tivesse `pricing:write`. Agora exige
-- hub_admin, alinhando a RPC com o RLS das tabelas que ela escreve.
--
-- `is_hub_admin()` olha o papel real do usuário, então o hub_admin continua
-- editando mesmo enquanto impersona uma empresa (que é como ele chega na tela).

create or replace function public.operator_set_unit_fare(
  p_location_parking_type_id uuid,
  p_tier fare_tier,
  p_enabled boolean,
  p_price_cents integer default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_company_id uuid;
begin
  select l.company_id into v_company_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.id = p_location_parking_type_id;

  if v_company_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;

  if not public.is_hub_admin() then
    raise exception 'Plano de cancelamento é definido pela equipe Movepark.' using errcode = '42501';
  end if;

  if p_price_cents is not null and p_price_cents < 0 then
    raise exception 'Preço inválido.' using errcode = 'P0001';
  end if;

  insert into public.location_fare (location_parking_type_id, tier, enabled, price_cents_override)
  values (p_location_parking_type_id, p_tier, coalesce(p_enabled, true), p_price_cents)
  on conflict (location_parking_type_id, tier) do update
    set enabled = excluded.enabled,
        price_cents_override = excluded.price_cents_override,
        updated_at = now();
end; $function$;

comment on function public.operator_set_unit_fare(uuid, fare_tier, boolean, integer) is
  'Define plano de cancelamento por tipo de vaga. Exclusivo de hub_admin: o plano é produto da Movepark, não do parceiro. Mantém o nome operator_* por compatibilidade com o front.';
