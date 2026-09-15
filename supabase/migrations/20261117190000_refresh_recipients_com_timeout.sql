-- O cron de recebedores ganha timeout explícito.
--
-- Ele foi agendado quando só relia ficha em análise, que costuma ser zero linha e responde na hora.
-- Agora a mesma volta lê o saldo dos recebedores ativos e, quando o saldo dá 404, ainda pergunta se
-- o recebedor existe. São até uma dúzia de chamadas sequenciais ao gateway, e o default de 5 s do
-- pg_net desiste antes. A Edge continua rodando até o fim, mas a resposta se perde, e junto com ela
-- a única forma de saber se a volta deu certo. Mesmo motivo dos outros crons de conciliação.

select cron.unschedule('refresh-recipients')
where exists (select 1 from cron.job where jobname = 'refresh-recipients');

select cron.schedule(
  'refresh-recipients',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/refresh-recipients',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-recipients-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_recipients_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
