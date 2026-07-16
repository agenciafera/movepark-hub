-- Foto obrigatória para vender (regra de produto: "sem foto nenhuma, a unidade não sobe em produção").
--
-- Reforça o gate de listagem pública (is_listed): além do recebedor ativo (ADR-004), a unidade só
-- entra na busca / URL pública se tiver PELO MENOS 1 foto. Sem foto é um PISO ABSOLUTO: is_listed
-- nunca fica true. Com foto + empresa apta a receber, a unidade lista (inclusive quando a 1ª foto
-- entra depois da aprovação do recebedor).
--
-- Preserva a demo: as unidades grandfathered (listadas sem recebedor real, mas com foto) continuam
-- no ar. O único efeito retroativo é desligar as que estão listadas SEM foto. Ver
-- docs/specs/partner-onboarding-redesign.md e o gate original (20260816000000_public_listing_gate.sql).

-- 1. Helpers.
create or replace function public.location_has_photo(p_photos jsonb)
  returns boolean
  language sql
  immutable
  set search_path to ''
as $$
  select p_photos is not null
     and jsonb_typeof(p_photos) = 'array'
     and jsonb_array_length(p_photos) >= 1;
$$;

comment on function public.location_has_photo(jsonb) is
  'True se o jsonb de fotos da location tem ao menos 1 item. Piso da regra "sem foto não vende".';

create or replace function public.company_can_receive(p_company_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select exists (
    select 1 from public.payout_recipient pr
    where pr.company_id = p_company_id
      and pr.status = 'active'
      and pr.deleted_at is null
  );
$$;

alter function public.company_can_receive(uuid) owner to postgres;

-- 2. Gate na própria location: piso de foto (desliga sem foto) e liga quando foto + recebedor ativo.
--    Dispara só em mudança de photos/status/deleted_at, então o UPDATE de is_listed feito pelo
--    trigger do recebedor não recursa aqui.
create or replace function public.enforce_photo_gate_on_location()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  -- Piso absoluto: sem foto, nunca listada.
  if not public.location_has_photo(new.photos) then
    new.is_listed := false;
    return new;
  end if;
  -- Com foto: se a empresa já pode receber e a unidade está ativa, liga a listagem.
  -- Cobre "subiu a 1ª foto depois do recebimento aprovado". Não desliga o que já estava listado.
  if new.status = 'active'
     and new.deleted_at is null
     and not new.is_listed
     and public.company_can_receive(new.company_id) then
    new.is_listed := true;
  end if;
  return new;
end;
$$;

alter function public.enforce_photo_gate_on_location() owner to postgres;

drop trigger if exists trg_photo_gate_location on public.location;
create trigger trg_photo_gate_location
  before insert or update of photos, status, deleted_at on public.location
  for each row execute function public.enforce_photo_gate_on_location();

-- 3. Recebedor ativo agora só lista unidades COM foto (mantém o resto do comportamento monotônico).
create or replace function public.list_locations_on_recipient_active()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if new.status = 'active'
     and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    update public.location
      set is_listed = true
      where company_id = new.company_id
        and status = 'active'
        and deleted_at is null
        and public.location_has_photo(photos)
        and not is_listed;
  end if;
  return new;
end;
$$;

-- 4. Backfill: desliga só as unidades listadas SEM foto (as com foto ficam como estão).
update public.location
  set is_listed = false
  where deleted_at is null
    and is_listed
    and not public.location_has_photo(photos);

-- 5. Superfície mínima: helpers/triggers não são chamáveis por anon (rodam via trigger, como owner).
revoke all on function public.location_has_photo(jsonb) from public, anon;
revoke all on function public.company_can_receive(uuid) from public, anon, authenticated;
revoke all on function public.enforce_photo_gate_on_location() from public, anon, authenticated;
revoke all on function public.list_locations_on_recipient_active() from public, anon, authenticated;
