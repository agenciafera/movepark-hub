-- Rascunho explícito: `location.is_draft` (16/09/2026).
--
-- O modo rascunho de 15/09 existia por acidente de ordem: a flag `is_listed` foi desligada à mão
-- antes de reativar a empresa, e nada impedia o gatilho de religar. `enforce_photo_gate_on_location`
-- dispara em qualquer update de `photos`/`status`/`deleted_at` e lista sozinho quando há foto, a
-- unidade está ativa e a empresa pode receber. Ou seja, um Salvar em "Editar unidade" publicaria a
-- Agência Fera na vitrine. Rascunho precisa ser uma decisão gravada, não uma coincidência.
--
-- `is_draft = true` significa: nunca listar automaticamente. Os dois gatilhos que listam passam a
-- respeitar a flag, e ligar a flag deslista na hora. Quem marca é hub_admin, no bloco "Catálogo
-- Movepark" do formulário da unidade. Desmarcar devolve o comportamento normal, e o gatilho lista
-- de novo no próximo update que passar pelo gate.

alter table public.location
  add column if not exists is_draft boolean not null default false;

comment on column public.location.is_draft is
  'Rascunho: a unidade nunca é listada automaticamente pelos gatilhos de foto/recebedor. hub_admin testa a unidade de ponta a ponta pelo Manager antes de publicar. Marcar deslista na hora.';

create or replace function public.enforce_photo_gate_on_location()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.location_has_photo(new.photos) then
    new.is_listed := false;
    return new;
  end if;
  -- Rascunho: nunca lista sozinho, e marcar deslista.
  if new.is_draft then
    new.is_listed := false;
    return new;
  end if;
  if new.status = 'active'
     and new.deleted_at is null
     and not new.is_listed
     and public.company_can_receive(new.company_id) then
    new.is_listed := true;
  end if;
  return new;
end;
$function$;

-- O gatilho passa a olhar também `is_draft`, para marcar rascunho deslistar na hora.
drop trigger if exists trg_photo_gate_location on public.location;
create trigger trg_photo_gate_location
  before insert or update of photos, status, deleted_at, is_draft on public.location
  for each row execute function public.enforce_photo_gate_on_location();

create or replace function public.list_locations_on_recipient_active()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'active'
     and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    update public.location
      set is_listed = true
      where company_id = new.company_id
        and status = 'active'
        and deleted_at is null
        and not is_draft
        and public.location_has_photo(photos)
        and not is_listed;
  end if;
  return new;
end;
$function$;

-- A Agência Fera é o rascunho de hoje: grava a decisão que até aqui era só uma flag desligada.
update public.location set is_draft = true
 where company_id = (select id from public.company where slug = 'agencia-fera')
   and deleted_at is null;
