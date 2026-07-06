-- Rede de segurança do estorno (A3): a cada 15 min chama a Edge `reconcile-refunds`, que reavalia
-- no gateway estornos iniciados (payment `paid` + `refunded_at`) cujo webhook `charge.refunded`
-- nunca chegou, e reflete `refunded`. Complementa o webhook (push) com um poll — mesmo padrão do
-- refresh-recipients. A chave interna (x-reconcile-refunds-key) vem do Vault.
--
-- ⚠️ SETUP ÚNICO (fora do repo, como os outros crons de chave interna): o segredo do Vault
-- `reconcile_refunds_key` deve ter o MESMO valor do secret RECONCILE_REFUNDS_KEY da Edge. Ex.:
--   select vault.create_secret('<mesmo valor de RECONCILE_REFUNDS_KEY>', 'reconcile_refunds_key',
--     'chave interna do cron reconcile-refunds');
-- Enquanto o segredo não existir, o cron dispara mas a Edge responde 401 (inofensivo).

select cron.schedule(
  'reconcile-refunds',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/reconcile-refunds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reconcile-refunds-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_refunds_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
