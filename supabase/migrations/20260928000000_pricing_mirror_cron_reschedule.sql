-- E0.13 · O espelho de preço passa a rodar de 3 em 3 horas, em lotes.
-- Spec: docs/specs/espelhamento-preco-wl.md
--
-- Em 10/08/2026 as unidades externas foram de 1 para 6 (Abbapark, Nationpark, Plenty, Garageinn,
-- Aeroparking, além do Virapark), e as vagas de 1 para 12. Uma passada com 12 vagas leva uns 9
-- minutos, e a Edge derruba a invocação em 150s: o job tomou IDLE_TIMEOUT no meio e deixou 7
-- vagas com a tabela velha do Hub apontando para o checkout do parceiro.
--
-- A função passou a processar a vaga MAIS VELHA primeiro e a parar de pegar vaga nova quando
-- estoura o orçamento de tempo, devolvendo quantas ficaram (`skipped`). O que sobra volta no topo
-- da passada seguinte. Com ~2 vagas por passada e 8 passadas por dia, a fila de 12 gira inteira
-- todo dia, e o tráfego contra o parceiro é o mesmo de antes, só distribuído.
--
-- O minuto 7 fica igual ao de antes (07:00 UTC = 04:00 em São Paulo), então a passada da
-- madrugada segue existindo para alguém olhar o alarme de divergência antes do movimento do dia.

select cron.unschedule('wl-price-mirror');

select cron.schedule(
  'wl-price-mirror', '0 1,4,7,10,13,16,19,22 * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-price-mirror',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $job$
);
