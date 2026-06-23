-- E2.5.2 · Agenda os jobs de sincronização WL↔Hub via pg_cron + pg_net.
-- A chave interna (x-wl-deliver-key) vem do Vault (sem segredo no repo).
--   • wl-deliver  (1 min): entrega a outbox wl_delivery (reserve/release) ao WL com retry.
--   • wl-reconcile (15 min): puxa sold_wl do WL → external_booked_count (anti-overbooking + reconciliação).

select cron.schedule(
  'wl-deliver', '* * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-deliver',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);

select cron.schedule(
  'wl-reconcile', '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
