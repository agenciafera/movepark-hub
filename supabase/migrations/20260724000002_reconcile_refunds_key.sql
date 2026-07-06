-- Chave interna do cron reconcile-refunds (A3). Fica só no Vault (valor gerado aqui, nunca exposto):
-- o cron a envia no header e a Edge a lê via RPC service-role-only — sem env var, sem sincronizar
-- segredo entre lugares.
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'reconcile_refunds_key',
  'Chave interna do cron reconcile-refunds (cron envia no header; Edge lê via RPC).'
);

-- A Edge (service role) lê a chave esperada daqui. Restrito ao service_role — anon/authenticated
-- não podem ler segredo do Vault.
create or replace function public.reconcile_refunds_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_refunds_key' limit 1;
$$;
revoke all on function public.reconcile_refunds_expected_key() from public, anon, authenticated;
grant execute on function public.reconcile_refunds_expected_key() to service_role;
