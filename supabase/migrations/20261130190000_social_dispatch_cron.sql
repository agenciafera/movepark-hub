-- Cron da publicação agendada do Instagram (E3.6).
--
-- A chave nasce aqui dentro, no Vault, e a Edge pergunta ao banco se bate (cron_key_matches):
-- o valor nunca passa por terminal, CLI nem secret de Edge, e rotacionar é um UPDATE no Vault.
-- Mesmo padrão do robô de pesquisa de preço (20261112090000).
--
-- A cada 15 minutos. A rodada é inofensiva com a chave `social_dispatch_enabled` desligada: só
-- grava `dry_run`. Ver docs/specs/instagram-fila-de-publicacao.md, seção 3.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'social_dispatch_key',
  'Header x-social-dispatch-key do cron da fila do Instagram'
) where not exists (select 1 from vault.secrets where name = 'social_dispatch_key');

select cron.unschedule('social-dispatch')
 where exists (select 1 from cron.job where jobname = 'social-dispatch');

select cron.schedule(
  'social-dispatch',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/social-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-social-dispatch-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'social_dispatch_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
