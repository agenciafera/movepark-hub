-- E2.6.1 · Agenda a entrega outbound do WPS: chama a Edge `wps-deliver` a cada minuto.
-- pg_net faz o POST async; a chave interna (x-wps-deliver-key) vem do Vault (sem segredo no repo).
-- A Edge processa a outbox `wps_delivery` (pendentes vencidas) com HMAC + retry/backoff.

select cron.schedule(
  'wps-deliver',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wps-deliver',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-wps-deliver-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'wps_deliver_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
