-- Chave interna do cron review-request.
--
-- A função é `verify_jwt = false` (como todas as chamadas por pg_cron) e era a ÚNICA das doze
-- funções internas sem gate próprio: o cron a chamava com a anon key no `Authorization`, e anon key
-- é pública por design. Na prática, qualquer um podia disparar o envio dos e-mails de avaliação.
--
-- O estrago era limitado, e vale registrar por quê: a função é idempotente por
-- `booking.review_request_sent_at`, então ninguém consegue mandar o mesmo e-mail duas vezes para o
-- mesmo cliente. O que dava para fazer era ANTECIPAR o envio (antes da hora que a operação
-- escolheu) e queimar cota de e-mail, com `limit` até 200 por chamada. É a mesma classe do abuso de
-- OTP: alavanca de custo aberta, não vazamento de dado.
--
-- Segue o padrão das irmãs (`reconcile_refunds_key`, `wl_deliver_key`, `wps_deliver_key`): o valor
-- nasce aqui, mora só no Vault, e a Edge o lê por RPC restrita ao service_role. Sem env var e sem
-- sincronizar segredo entre lugares.

select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'review_request_key',
  'Chave interna do cron review-request (cron envia no header; Edge lê via RPC).'
);

create or replace function public.review_request_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'review_request_key' limit 1;
$$;
revoke all on function public.review_request_expected_key() from public, anon, authenticated;
grant execute on function public.review_request_expected_key() to service_role;

-- O cron passa a mandar o header, e para de mandar a anon key como se fosse credencial.
select cron.unschedule('review-request-hourly');
select cron.schedule(
  'review-request-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/review-request',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-review-request-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'review_request_key')
    ),
    body := '{"limit":100}'::jsonb
  );
  $$
);
