-- Auditoria de endereço: agendamento.
-- Spec: docs/specs/auditoria-enderecos.md
--
-- Duas frequências, porque as duas camadas custam coisas diferentes:
--
--   Triagem (SQL puro, custo zero)  -> toda segunda, 05:00 UTC. Chama a função direto, sem
--                                      HTTP. Pega unidade nova ou editada na semana.
--   Verificação no Google (paga)    -> dia 5 de cada mês, 06:00 UTC. Passa pela Edge, que só
--                                      consulta quem nunca foi verificado ou venceu os 90
--                                      dias de `verify_after_days`.
--
-- Endereço de estacionamento muda pouco, e o que muda é o nosso registro, não o mundo. Rodar
-- a parte paga toda semana gastaria chamada para reconfirmar o mesmo lugar. O que pega
-- correção errada no dia seguinte é o gatilho de invalidação (a auditoria da unidade editada
-- volta para pendente na hora) somado ao botão "Verificar no Google" da tela.
--
-- A chave nasce aqui, no vault. Ela precisa do par do outro lado: o mesmo valor tem que ser
-- gravado como secret `LOCATION_AUDIT_KEY` da Edge Function, senão o job bate na porta e leva
-- 401. O valor está em vault.decrypted_secrets (painel do Supabase, Vault).

-- vault.create_secret e não INSERT: a escrita direta em vault.secrets esbarra em
-- "permission denied for function _crypto_aead_det_noncegen", porque a cifra é feita pela
-- própria função.
select vault.create_secret(
  encode(extensions.gen_random_bytes(24), 'hex'),
  'location_audit_key',
  'Chave da Edge location-address-audit. O mesmo valor tem que estar no secret LOCATION_AUDIT_KEY da Edge Function.'
)
where not exists (select 1 from vault.secrets where name = 'location_audit_key');

-- Triagem semanal, direto no banco.
select cron.schedule(
  'location-address-scan',
  '0 5 * * 1',
  $job$
  select public.location_address_scan();
  $job$
);

-- Verificação mensal no Google, pela Edge.
select cron.schedule(
  'location-address-audit',
  '0 6 5 * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/location-address-audit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-location-audit-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'location_audit_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
