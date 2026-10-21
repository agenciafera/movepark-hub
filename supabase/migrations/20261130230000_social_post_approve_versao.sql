-- Aprovar a versão que a pessoa viu (E3.6, revisão final).
--
-- Antes: `social_post_approve(p_id)` aprovava o que estivesse na linha na hora do clique. Se a
-- legenda era corrigida, ou o rascunho era reenviado, entre a pessoa abrir o post e clicar em
-- Aprovar, ela aprovava um texto que nunca leu, e o post ia ao ar com a marca da Movepark.
--
-- Agora o clique carrega o `updated_at` da versão aberta. Se a linha mudou desde então, a RPC
-- recusa e pede para abrir de novo. `updated_at` muda em toda escrita (trigger set_updated_at),
-- então cobre legenda, slides, data e conferência de uma vez.
--
-- A assinatura muda, então a função antiga cai e a nova nasce com os grants por nome.
-- Ver docs/specs/instagram-fila-de-publicacao.md.

drop function public.social_post_approve(uuid);

create function public.social_post_approve(p_id uuid, p_expected_updated_at timestamptz)
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
  if p.status <> 'pending_review' then
    raise exception 'Só post aguardando aprovação pode ser aprovado (está %).', p.status using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p.validation -> 'blockers', '[]'::jsonb)) > 0 then
    raise exception 'O post tem bloqueios da conferência e não pode ser aprovado.' using errcode = 'P0001';
  end if;
  if p.scheduled_at <= now() then
    raise exception 'A data do post já passou. Reagende antes de aprovar.' using errcode = 'P0001';
  end if;
  if public.social_post_day_taken(p.id, p.scheduled_at) then
    raise exception 'Já existe post agendado ou publicado nesse dia.' using errcode = 'P0001';
  end if;

  update public.social_post
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_id;

  insert into public.social_post_event (social_post_id, kind, actor)
  values (p_id, 'approved', auth.uid());
end;
$$;

revoke all on function public.social_post_approve(uuid, timestamptz) from public, anon;
grant execute on function public.social_post_approve(uuid, timestamptz) to authenticated, service_role;
