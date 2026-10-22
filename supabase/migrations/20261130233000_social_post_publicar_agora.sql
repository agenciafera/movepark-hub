-- "Publicar agora" na fila do Instagram (E3.6, extensão de 21/10/2026).
--
-- Além do agendamento, o Manager ganha um botão que publica o post na hora. Decisões do Kallef
-- (21/10/2026):
--   1. funciona mesmo com `social_dispatch_enabled` desligada: a chave segura o agendador
--      automático, e "Publicar agora" é um clique humano, post a post, com confirmação;
--   2. ignora a regra de um post por dia, mas a confirmação na tela avisa quando já saiu post hoje.
--
-- O que não muda: só sai post sem bloqueio da conferência, a aprovação vale só para a versão que a
-- pessoa viu (`updated_at`), o mesmo post nunca sai duas vezes e tudo fica no rastro.
--
-- Esta RPC NÃO publica. Ela deixa o post `approved` com a hora de agora e registra o pedido
-- (evento `publish_now`). Quem publica continua sendo só a Edge `social-dispatch`, que o Manager
-- chama logo depois no modo forçado, com a mesma pega atômica e a mesma reconciliação da rodada.
-- Se essa segunda chamada não chegar, o post fica aprovado para agora: com a chave desligada o
-- agendador não o publica, e o botão continua lá para tentar de novo.
--
-- Ver docs/specs/instagram-fila-de-publicacao.md.

-- O rastro ganha o evento do pedido. A lista é a da constraint viva, mais `publish_now`.
alter table public.social_post_event drop constraint social_post_event_kind_check;
alter table public.social_post_event add constraint social_post_event_kind_check check (kind in (
  'draft_received', 'caption_edited', 'approved', 'rejected', 'rescheduled', 'dry_run',
  'container_child', 'container_parent', 'container_status', 'media_publish', 'permalink',
  'consulta', 'reconciled', 'overdue', 'failed', 'publish_now'
));

create function public.social_post_publish_now(p_id uuid, p_expected_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.social_post;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a fila do Instagram.' using errcode = '42501';
  end if;

  select * into p from public.social_post where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Post não encontrado.' using errcode = 'P0001';
  end if;
  if p.updated_at is distinct from p_expected_updated_at then
    raise exception 'O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.'
      using errcode = 'P0001';
  end if;
  if p.status = 'published' then
    raise exception 'Este post já foi publicado.' using errcode = 'P0001';
  end if;
  if p.status = 'publishing' then
    raise exception 'Este post já está sendo publicado.' using errcode = 'P0001';
  end if;
  if p.status = 'rejected' then
    raise exception 'Post recusado não pode ser publicado.' using errcode = 'P0001';
  end if;
  if p.status not in ('pending_review', 'approved', 'overdue', 'failed') then
    raise exception 'Este post não pode ser publicado agora (está %).', p.status using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p.validation -> 'blockers', '[]'::jsonb)) > 0 then
    raise exception 'O post tem bloqueios da conferência e não pode ser publicado.' using errcode = 'P0001';
  end if;
  -- Sem `social_post_day_taken` e sem exigir data futura: as duas regras são do agendamento.

  -- Vindo de `pending_review`, este clique é a aprovação. Nos outros estados alguém já aprovou, e
  -- essa aprovação fica; só se preenche o que estiver vazio. `ig_container_id` fica como está: é
  -- ele que faz a Edge consultar a Meta antes de criar outro envio.
  update public.social_post
     set status = 'approved',
         scheduled_at = now(),
         approved_by = case when p.status = 'pending_review' then auth.uid()
                            else coalesce(p.approved_by, auth.uid()) end,
         approved_at = case when p.status = 'pending_review' then now()
                            else coalesce(p.approved_at, now()) end,
         last_error = null
   where id = p_id;

  insert into public.social_post_event (social_post_id, kind, request, actor)
  values (p_id, 'publish_now',
          jsonb_build_object('status_anterior', p.status, 'de', p.scheduled_at, 'para', now()),
          auth.uid());
end;
$$;

revoke all on function public.social_post_publish_now(uuid, timestamptz) from public, anon;
grant execute on function public.social_post_publish_now(uuid, timestamptz) to authenticated, service_role;
