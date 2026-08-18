-- E0.13 · Gatilho manual do espelho de preço white-label, para emergências (hub_admin).
-- Spec: docs/specs/espelhamento-preco-wl.md
--
-- O espelho (wl-price-mirror) já roda sozinho de 3 em 3h (ver
-- 20260928000000_pricing_mirror_cron_reschedule.sql). Esta RPC dá ao hub_admin um jeito de forçar
-- a passada de UMA vaga fora do ciclo, sem esperar a vez dela na fila por antiguidade (ex: o
-- parceiro avisou que mudou preço, ou a vitrine caiu para "a partir de" e alguém quer reverificar
-- na hora).
--
-- Mesmo mecanismo que o cron.schedule já usa (net.http_post + secret wl_deliver_key do vault), só
-- que gatilhado por RPC (usuário autenticado) em vez de cron.schedule (sem usuário). net.http_post é
-- ASSÍNCRONO: só enfileira e devolve um request_id, não o resultado do espelho. Esta RPC não espera
-- a Edge terminar; quem chamou vê o efeito em pricing_rule.mirror_status/mirror_verified_at depois
-- de uns 40 segundos, o mesmo tempo que uma vaga leva para passar pelo job (ver o comentário de
-- custo em supabase/functions/wl-price-mirror/index.ts).
--
-- Não muda o Edge Function: wl-price-mirror já aceita { location_parking_type_id } no body para
-- limitar a passada a uma vaga só (comentário "útil pra rodar na mão" no próprio arquivo).
--
-- Nota (ver docs/specs/espelhamento-preco-wl.md): wl_sync_enabled da empresa NÃO entra no gate
-- aqui, de propósito. Esse campo liga/desliga só a sincronização de DISPONIBILIDADE
-- (wl-reconcile/wl-deliver); o espelho de PREÇO já roda independente dele (é o mesmo
-- comportamento do cron), e o botão manual segue a mesma regra pra não surpreender.

create or replace function public.wl_mirror_trigger(p_location_parking_type_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_checkout_mode text;
  v_wl_mapped boolean;
  v_request_id bigint;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark dispara o espelho de preço.' using errcode = '42501';
  end if;

  select l.checkout_mode, (lpt.wl_category_slug is not null and lpt.wl_product_slug is not null)
    into v_checkout_mode, v_wl_mapped
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.id = p_location_parking_type_id;

  if v_checkout_mode is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if v_checkout_mode <> 'external' then
    raise exception 'Só vaga externa (checkout no parceiro) usa o espelho de preço.' using errcode = 'P0001';
  end if;
  if not v_wl_mapped then
    raise exception 'Esta vaga não tem mapeamento white-label (category/product slug).' using errcode = 'P0001';
  end if;

  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-price-mirror',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')
    ),
    body := jsonb_build_object('location_parking_type_id', p_location_parking_type_id),
    timeout_milliseconds := 180000
  ) into v_request_id;

  return jsonb_build_object('ok', true, 'queued', true, 'request_id', v_request_id);
end;
$$;

-- `from public, anon`: o Supabase concede EXECUTE a anon por default privilege, e revoke de
-- public sozinho não tira. Disparo do espelho nunca é anônimo; só authenticated + is_hub_admin.
revoke all on function public.wl_mirror_trigger(uuid) from public, anon;
grant execute on function public.wl_mirror_trigger(uuid) to authenticated;
