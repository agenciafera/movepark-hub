-- E0.13 · Agenda o espelhamento de preço e a limpeza dos logs de integração.
--
-- Diário, e não de hora em hora: preço de estacionamento não muda toda hora, e cada passada
-- custa 47 chamadas ao parceiro por vaga. A passada que não acha mudança é barata do lado do
-- banco (não grava linha), mas do lado do parceiro é tráfego real.
--
-- 07:00 UTC = 04:00 em São Paulo. Fora do pico de reserva, e com folga para alguém olhar o
-- alarme de divergência antes do movimento do dia.

select cron.schedule(
  'wl-price-mirror', '0 7 * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-price-mirror',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $job$
);

-- Semanal: a retenção não tem pressa, e rodar todo dia só criaria trabalho de vacuum à toa.
select cron.schedule(
  'prune-integration-logs', '30 7 * * 0',
  $job$ select public.cron_prune_integration_logs(); $job$
);
