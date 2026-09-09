-- Distância em texto de FAQ passa a ser a MEDIDA (PostGIS, ADR-001).
--
-- Aplicada no banco em 08/09/2026 pelo carimbo
-- `faq_distancia_medida_substitui_a_escrita_a_mao`. Este arquivo é o conteúdo
-- consolidado, e é ele que vale num `db reset`.
--
-- A varredura das 27 praças achou oito afirmações de distância escritas à mão que
-- não batiam com a medição, e a página publicava as duas ao mesmo tempo: a FAQ dizia
-- um número e a seção "Distância até o terminal" dizia outro, com fator de até 9x.
--
--   praça  unidade      escrito à mão   medido
--   CWB    Nationpark   510 m           1.441 m
--   CWB    Abbapark     580 m           2.567 m
--   GRU    Aerovalet    480 m           4.549 m
--   GRU    Aeropark     720 m           2.672 m
--   CGH    Aerovalet    290 m             738 m
--   CGH    Plenty Park  280 m             863 m
--   VCP    Garageinn    330 m             979 m
--   VCP    Virapark     1,3 km          3.695 m
--
-- Distância declarada é o campo que um comparador força a favor de quem quer
-- destacar. Medir é o nosso diferencial, e um número que nós mesmos desmentimos na
-- mesma página custa mais credibilidade do que o número bonito compra.
--
-- Algumas frases mudam junto com o algarismo, porque a moldura ficou falsa: "colados
-- no aeroporto" não se sustenta a 2,6 km, nem "pertinho do terminal" a 4,5 km.
--
-- O guarda que impede a volta da divergência é `scripts/check-distancias-faq.mjs`,
-- ligado em `bun run lint:distancias` e no job `quality` do CI.

update public.faq set body_md = replace(body_md,
  'Perto do Afonso Pena os parceiros Movepark ficam colados no aeroporto (Nationpark a 510 m e Abbapark a 580 m), com traslado 24h; os demais lotes ficam a uns 3 km, coisa de 5 minutos de van.',
  'Perto do Afonso Pena os parceiros Movepark ficam a poucos minutos de van: Nationpark a 1,4 km e Abbapark a 2,6 km, os dois com traslado 24h. Os demais lotes da região ficam em distância parecida.')
where scope='destination' and question = 'O estacionamento no Aeroporto Afonso Pena oferece traslado até o terminal?'
  and destination_id = (select id from public.destination where slug='aeroporto-afonso-pena');

update public.faq set body_md = replace(body_md,
  'Em Guarulhos os parceiros Movepark ficam pertinho do terminal: a Aerovalet a 480 m e a Aeropark a 720 m.',
  'Em Guarulhos os parceiros Movepark ficam a alguns quilômetros do terminal: a Aeropark a 2,7 km e a Aerovalet a 4,5 km, as duas com van incluída na diária.')
where scope='destination' and question = 'O estacionamento em Guarulhos oferece traslado até o terminal?'
  and destination_id = (select id from public.destination where slug='aeroporto-internacional-de-sao-paulo-guarulhos');

update public.faq set answer = replace(answer,
  'R$ 18,90 na vaga descoberta, a 480 m do terminal,',
  'R$ 18,90 na vaga descoberta, a 4,5 km do terminal,')
where scope='destination' and question = 'Qual o estacionamento mais barato perto do Aeroporto de Guarulhos?'
  and destination_id = (select id from public.destination where slug='aeroporto-internacional-de-sao-paulo-guarulhos');

update public.faq set body_md = replace(body_md,
  'Vaga descoberta a 480 m do terminal; coberta por R$ 26,90',
  'Vaga descoberta a 4,5 km do terminal; coberta por R$ 26,90')
where scope='destination' and question = 'Quanto custa estacionar no Aeroporto de Guarulhos?'
  and destination_id = (select id from public.destination where slug='aeroporto-internacional-de-sao-paulo-guarulhos');

update public.faq set body_md = replace(body_md,
  'Em Congonhas os parceiros Movepark ficam a menos de 300 m do terminal (Plenty Park a 280 m e Aerovalet a 290 m)',
  'Em Congonhas os parceiros Movepark ficam a menos de 900 m do terminal (Aerovalet a 738 m e Plenty Park a 863 m)')
where scope='destination' and question = 'O estacionamento em Congonhas oferece traslado até o terminal?'
  and destination_id = (select id from public.destination where slug='aeroporto-de-congonhas');

update public.faq set answer = replace(answer,
  'R$ 26,90 por dia em vaga coberta a 280 m do terminal',
  'R$ 26,90 por dia em vaga coberta a 863 m do terminal')
where scope='destination' and question = 'Qual o estacionamento mais barato perto do Aeroporto de Congonhas?'
  and destination_id = (select id from public.destination where slug='aeroporto-de-congonhas');

update public.faq set answer = replace(answer,
  'R$ 43,90 na Aerovalet, os dois a menos de 300 m do terminal',
  'R$ 43,90 na Aerovalet, os dois a menos de 900 m do terminal')
where scope='destination' and question = 'Quanto custa estacionar no Aeroporto de Congonhas?'
  and destination_id = (select id from public.destination where slug='aeroporto-de-congonhas');

update public.faq set body_md = replace(
  replace(body_md, 'Vaga coberta a 280 m do terminal, mínimo de 3 diárias', 'Vaga coberta a 863 m do terminal, mínimo de 3 diárias'),
  'Vaga coberta a 290 m do terminal', 'Vaga coberta a 738 m do terminal')
where scope='destination' and question = 'Quanto custa estacionar no Aeroporto de Congonhas?'
  and destination_id = (select id from public.destination where slug='aeroporto-de-congonhas');

update public.faq set body_md = replace(body_md,
  'Em Viracopos o parceiro Movepark Virapark inclui traslado 24h na diária, a 1,3 km do terminal; o Garageinn fica a 330 m, distância de ir a pé;',
  'Em Viracopos o parceiro Movepark Virapark inclui traslado 24h na diária, a 3,7 km do terminal; o Garageinn fica a 979 m, dentro do complexo do aeroporto, com van de 3 minutos;')
where scope='destination' and question = 'O estacionamento em Viracopos oferece traslado até o terminal?'
  and destination_id = (select id from public.destination where slug='aeroporto-de-viracopos');

update public.faq set body_md = replace(body_md,
  'A 330 m do terminal, preço fechado na reserva online',
  'A 979 m do terminal, preço fechado na reserva online')
where scope='destination' and question = 'Quanto custa estacionar no Aeroporto de Viracopos?'
  and destination_id = (select id from public.destination where slug='aeroporto-de-viracopos');

update public.faq set answer = replace(answer,
  'dentro do complexo do aeroporto, a 1,0 km do terminal',
  'dentro do complexo do aeroporto, a 979 m do terminal')
where scope='destination' and question = 'Tem estacionamento dentro do aeroporto de Viracopos?'
  and destination_id = (select id from public.destination where slug='aeroporto-de-viracopos');

update public.faq set answer = replace(answer,
  'o mais próximo é o Garageinn, a 1,0 km, dentro do complexo',
  'o mais próximo é o Garageinn, a 979 m, dentro do complexo')
where scope='destination' and question = 'Qual o estacionamento mais próximo do Aeroporto de Viracopos?'
  and destination_id = (select id from public.destination where slug='aeroporto-de-viracopos');
