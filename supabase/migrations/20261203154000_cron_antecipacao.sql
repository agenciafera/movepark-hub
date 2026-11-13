-- Cron de status da antecipação pontual (E0.3.14). Spec: docs/specs/antecipacao-do-parceiro.md
--
-- A Pagar.me analisa a antecipação pontual uma vez por dia, às 11h, e paga por volta das 14h
-- (horário de Brasília). De segunda a sexta, de hora em hora entre 11h e 15h BRT (14h a 18h UTC),
-- a Edge relê as pontuais abertas e grava status, taxa e data. Sem isto o crédito da taxa paga
-- pela Movepark nunca nasceria, porque ele só conta a antecipação `approved`.

select cron.unschedule('recipient-anticipation-sync')
 where exists (select 1 from cron.job where jobname = 'recipient-anticipation-sync');

select cron.schedule(
  'recipient-anticipation-sync',
  '15 14-18 * * 1-5',
  $$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/recipient-anticipation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-recipient-anticipation-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'recipient_anticipation_key')
    ),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
