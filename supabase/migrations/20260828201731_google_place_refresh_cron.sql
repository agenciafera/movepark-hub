-- Agenda o refresh semanal do espelho do Google (Edge google-place-refresh), fechando o
-- ciclo que faltava: o purge de 30 dias (04:23 diário) drenava a tabela e nunca houve
-- quem repopulasse, então hasMap e o bloco de nota sumiam do site (aconteceu em ago/2026).
-- Semanal contra o prazo de 30 dias dá quatro tentativas antes de o selo cair da vitrine.
-- O token vem do Vault (google_place_refresh_key), mesmo padrão dos demais crons de Edge.
select cron.schedule(
  'google-place-refresh',
  '0 3 * * 0',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/google-place-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-google-place-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'google_place_refresh_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
