-- Saúde da publicação automática: o silêncio deixa de ser silencioso.
--
-- Por que existe. O mecanismo de publicação automática (20261030140000) entrou no ar em
-- 19/08/2026 e ficou 13 dias inerte sem ninguém perceber: o segredo
-- `cloudflare_deploy_hook_url` nunca foi cadastrado no Vault, então
-- `cron_dispatch_site_rebuild()` caía todo minuto no ramo `sem_deploy_hook` e voltava sem
-- carimbar nada. O cron reportava `succeeded` (ele de fato não falhou), a fila passou de 3.700
-- pedidos e toda edição de conteúdo no Manager continuou dependendo de um push na `main` para
-- ir ao ar. O defeito não foi a lógica, foi a falta de alguém para reclamar.
--
-- O que esta migration acrescenta é só a pergunta "isto está de pé?", numa função separada da
-- decisão de publicar. Quem responde por ela é uma checagem diária no GitHub Actions
-- (.github/workflows/site-rebuild-health.yml), que abre issue quando a resposta é não. De
-- propósito NÃO existe cron novo no banco só para escrever um aviso no log do Postgres: um
-- alarme que ninguém lê é exatamente o que falhou aqui.
--
-- Ver docs/specs/deploy-automatico.md.

-- ── Limites do alarme, no mesmo app_setting da política ───────────────────────
--
-- Merge, não sobrescrita: quem já ajustou as janelas de publicação não pode perder o ajuste
-- ao ganhar os limites de alarme.
update public.app_setting
   set value = (
         value::jsonb || jsonb_build_object('alert_max_pending', 250, 'alert_max_age_hours', 6)
       )::text
 where key = 'site_rebuild_policy'
   and not (value::jsonb ? 'alert_max_pending');

-- ── A pergunta ───────────────────────────────────────────────────────────────
--
-- Separada de `site_rebuild_decision()` porque responde outra coisa. A decisão diz "publico
-- agora?", e responder "não" é o comportamento normal dela na maior parte dos minutos. A saúde
-- diz "este mecanismo consegue publicar?", e responder "não" é sempre notícia.
--
-- `p_now` existe pelo mesmo motivo da decisão: dá para testar a passagem do tempo sem esperar
-- o relógio.
create or replace function public.site_rebuild_health(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer -- lê vault.decrypted_secrets; devolve só o booleano, nunca a URL
set search_path = public, pg_temp
as $$
declare
  v_cfg jsonb;
  v_ligado boolean;
  v_max_pendentes integer;
  v_max_horas numeric;
  v_pendentes integer;
  v_mais_antigo timestamptz;
  v_horas numeric;
  v_ultimo_build timestamptz;
  v_tem_hook boolean;
  v_motivo text;
begin
  v_cfg := coalesce(
    (select nullif(value, '')::jsonb from public.app_setting where key = 'site_rebuild_policy'),
    '{}'::jsonb
  );
  v_ligado        := coalesce((v_cfg->>'enabled')::boolean, true);
  v_max_pendentes := coalesce((v_cfg->>'alert_max_pending')::integer, 250);
  v_max_horas     := coalesce((v_cfg->>'alert_max_age_hours')::numeric, 6);

  select count(*), min(requested_at)
    into v_pendentes, v_mais_antigo
    from public.site_rebuild_request
   where dispatched_at is null;

  select max(dispatched_at) into v_ultimo_build from public.site_rebuild_request;

  v_tem_hook := exists (
    select 1 from vault.decrypted_secrets
     where name = 'cloudflare_deploy_hook_url'
       and coalesce(decrypted_secret, '') <> ''
  );

  v_horas := case
    when v_mais_antigo is null then 0
    else round((extract(epoch from (p_now - v_mais_antigo)) / 3600)::numeric, 1)
  end;

  v_motivo := case
    -- Invariante de configuração: sem o hook o mecanismo é inerte, com fila ou sem fila.
    -- É o caso que passou 13 dias despercebido, e ele reclama mesmo com a fila zerada.
    when not v_tem_hook then 'sem_deploy_hook'
    when v_pendentes = 0 then null
    -- O desligamento de emergência é legítimo, mas não pode virar estado permanente:
    -- ele só aparece como motivo quando já segurou conteúdo além do limite.
    when not v_ligado and v_horas > v_max_horas then 'desligado'
    when not v_ligado then null
    when v_horas > v_max_horas then 'fila_parada'
    when v_pendentes > v_max_pendentes then 'fila_grande'
    else null
  end;

  return jsonb_build_object(
    'ok', v_motivo is null,
    'motivo', v_motivo,
    'pendentes', v_pendentes,
    'mais_antigo', v_mais_antigo,
    'horas_esperando', v_horas,
    'ultimo_build', v_ultimo_build,
    'tem_deploy_hook', v_tem_hook,
    'ligado', v_ligado,
    'limites', jsonb_build_object('pendentes', v_max_pendentes, 'horas', v_max_horas)
  );
end;
$$;

comment on function public.site_rebuild_health(timestamptz) is
  'Diz se a publicação automática consegue publicar. Retorna {ok, motivo, pendentes, horas_esperando, tem_deploy_hook}. Motivos: sem_deploy_hook, desligado, fila_parada, fila_grande.';

-- Função nova no schema public nasce executável por anon/authenticated (default privilege do
-- Supabase). Revogação nominal, não só `from public`.
revoke all on function public.site_rebuild_health(timestamptz) from public, anon, authenticated;
grant execute on function public.site_rebuild_health(timestamptz) to service_role;
