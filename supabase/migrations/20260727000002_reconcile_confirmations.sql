-- E0.3.1-a · Layer 4 — rede de segurança simétrica ao reconcile-refunds: quando o webhook `paid`
-- nunca chega, o pagamento fica `paid` mas a reserva segue `cancelled`/expirada (pago sem vaga).
-- Este poll (*/15) chama a Edge `reconcile-confirmations`, que reconcilia via confirm_or_refund_booking
-- (reconfirma se há vaga, senão estorna). Mesmo padrão do reconcile-refunds: chave no Vault, o cron
-- envia no header e a Edge a lê via RPC service-role-only. Sem env var.

-- Chave interna do cron (valor gerado aqui, nunca exposto).
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'reconcile_confirmations_key',
  'Chave interna do cron reconcile-confirmations (cron envia no header; Edge lê via RPC).'
);

-- A Edge (service role) lê a chave esperada daqui. Restrito ao service_role.
create or replace function public.reconcile_confirmations_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_confirmations_key' limit 1;
$$;
revoke all on function public.reconcile_confirmations_expected_key() from public, anon, authenticated;
grant execute on function public.reconcile_confirmations_expected_key() to service_role;

-- Cron a cada 15 min (upsert por jobname).
select cron.schedule(
  'reconcile-confirmations',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/reconcile-confirmations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reconcile-confirmations-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_confirmations_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
