-- E2.8 (C) · Poll de segurança do status dos recebedores: chama a Edge `refresh-recipients` a cada
-- 15 min para reavaliar no gateway os recebedores em análise/pendência (complementa o webhook push).
-- A chave interna (x-refresh-recipients-key) vem do Vault (sem segredo no repo).

select cron.schedule(
  'refresh-recipients',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/refresh-recipients',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-recipients-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_recipients_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
