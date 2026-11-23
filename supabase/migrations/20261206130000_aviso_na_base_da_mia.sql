-- O aviso do estacionamento entra na base de conhecimento da Mia (23/11/2026).
-- Spec: docs/specs/aviso-do-estacionamento.md e docs/specs/knowledge-base.md.
--
-- A fila de frescor (`location_enqueue_knowledge`) só ouvia `directions_text`, `notice` e
-- `reservation_policy`. Sem esta migration a Mia responderia sobre a política de reembolso e
-- ignoraria a regra de bagagem da Pare Seguro, que é o que o cliente pergunta antes de chegar.
-- Fonte nova: `location_partner_notice` (coluna `partner_notice_md`); o worker `knowledge-embed`
-- lê o Markdown restrito como texto puro. Idempotente; o backfill enfileira quem já tem aviso.

create or replace function public.location_enqueue_knowledge()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    perform public.enqueue_knowledge_resync('location_directions',     new.id, 'delete');
    perform public.enqueue_knowledge_resync('location_notice',         new.id, 'delete');
    perform public.enqueue_knowledge_resync('location_policy',         new.id, 'delete');
    perform public.enqueue_knowledge_resync('location_partner_notice', new.id, 'delete');
    perform public.enqueue_knowledge_resync('location_amenity',        new.id, 'delete');
    return new;
  end if;
  if new.directions_text is distinct from old.directions_text then
    perform public.enqueue_knowledge_resync('location_directions', new.id, 'upsert');
  end if;
  if new.notice is distinct from old.notice then
    perform public.enqueue_knowledge_resync('location_notice', new.id, 'upsert');
  end if;
  if new.reservation_policy is distinct from old.reservation_policy then
    perform public.enqueue_knowledge_resync('location_policy', new.id, 'upsert');
  end if;
  if new.partner_notice_md is distinct from old.partner_notice_md then
    perform public.enqueue_knowledge_resync('location_partner_notice', new.id, 'upsert');
  end if;
  return new;
end; $fn$;

drop trigger if exists location_knowledge_enqueue on public.location;
create trigger location_knowledge_enqueue
  after update of directions_text, notice, reservation_policy, partner_notice_md, deleted_at
  on public.location for each row execute function public.location_enqueue_knowledge();

-- Backfill: quem já tem aviso entra na fila agora (a Pare Seguro, no dia da migration).
select public.enqueue_knowledge_resync('location_partner_notice', id, 'upsert')
  from public.location
 where partner_notice_md is not null and deleted_at is null;
