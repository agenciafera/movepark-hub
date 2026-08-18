-- O domínio canônico sai do banco.
--
-- Em 18/08/2026 o site saiu de `hub.movepark.co` para `movepark.co`, e o host estava
-- escrito à mão em 399 pontos do repo. Dois deles eram SQL, que é o pior lugar possível
-- para guardar host: exige migration para trocar, não aparece em nenhuma busca do front e
-- não é coberto pelo teste de contrato que vigia o resto.
--
-- 1) `get_my_referrals()` montava `'https://hub.movepark.co/r/' || v_code`. Agora devolve só
--    o código; quem monta a URL é o front, com o mesmo `siteUrl()` de todas as outras telas.
-- 2) Os documentos legais citavam o host no corpo do texto. `legal_document_version` é
--    append-only de propósito (é prova de qual texto o usuário aceitou), então a correção
--    entra como VERSÃO NOVA, sem reescrever o que já foi aceito.

-- ── 1) A RPC de indicação para de emitir URL ─────────────────────────────────────────────
create or replace function public.get_my_referrals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_list jsonb;
  v_counts jsonb;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;

  v_code := public.get_or_create_referral_code(v_uid);

  select coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id,
            'status', r.status,
            'referred_email', r.referred_email,
            'reward_amount', r.reward_amount,
            'created_at', r.created_at,
            'qualified_at', r.qualified_at
          ) order by r.created_at desc), '[]'::jsonb)
    into v_list
    from public.referral r
   where r.referrer_profile_id = v_uid;

  select jsonb_build_object(
      'pending',   count(*) filter (where status = 'pending'),
      'qualified', count(*) filter (where status = 'qualified'),
      'rewarded',  count(*) filter (where status = 'rewarded')
    ) into v_counts
    from public.referral where referrer_profile_id = v_uid;

  -- Sem `link`: o host do site não é assunto do banco. Ver src/features/growth/api.ts.
  return jsonb_build_object(
    'code', v_code,
    'counts', v_counts,
    'reward_amount', public.referral_reward_amount(),
    'referrals', v_list
  );
end;
$$;

comment on function public.get_my_referrals() is
  'Código de indicação, contagens e recompensa do usuário logado. NÃO devolve URL: o host do site vive em src/lib/site-host.mjs, não aqui.';

-- `create or replace` preserva o ACL, mas a garantia é barata e o histórico desta função já
-- teve um revoke corretivo (20260923000000). Reafirmado de propósito.
revoke execute on function public.get_my_referrals() from public, anon;
grant  execute on function public.get_my_referrals() to authenticated;

-- ── 2) Documentos legais: versão nova, histórico intacto ─────────────────────────────────
do $$
declare
  v_slug text;
  v_atual text;
  v_novo text;
  v_next integer;
  v_id uuid;
begin
  foreach v_slug in array array['terms', 'privacy'] loop
    select v.content into v_atual
      from public.legal_document d
      join public.legal_document_version v on v.id = d.current_version_id
     where d.slug = v_slug;

    if v_atual is null then
      raise notice 'documento legal % sem versão vigente; nada a fazer', v_slug;
      continue;
    end if;

    v_novo := replace(v_atual, 'hub.movepark.co', 'movepark.co');

    if v_novo = v_atual then
      raise notice 'documento legal % já cita o host canônico', v_slug;
      continue;
    end if;

    select coalesce(max(version), 0) + 1 into v_next
      from public.legal_document_version where document_slug = v_slug;

    insert into public.legal_document_version (document_slug, version, content)
      values (v_slug, v_next, v_novo)
      returning id into v_id;

    update public.legal_document
       set current_version_id = v_id, updated_at = now()
     where slug = v_slug;
  end loop;
end $$;
