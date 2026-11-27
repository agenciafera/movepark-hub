-- Viracopos: a página do destino passa a listar todos os estacionamentos da região e o preço
-- de todas as durações que o próprio estacionamento publica. Conferido em 27/11/2026.
--
-- O que faltava, medido contra o Google Maps ("estacionamento aeroporto viracopos") e o site de
-- cada operador:
--
--   JF Parking        R. Waldemar Amstalden, 250. 355 avaliações no Google e nenhuma linha no
--                     banco. Não publica tarifa: reserva e cota pelo WhatsApp. Entra sem preço,
--                     como Eco22, Aero Viracopos e Pórtico.
--   Ouro Park         R. Laviere Pereira da Silva, 1305, o MESMO endereço do KM64. O site do KM64
--                     não resolve desde 26/11 e a ficha dele no Google (cid 11536972427762145365)
--                     não abre mais nada; no lugar, o Google mostra o Ouro Park. O KM64 sai do ar
--                     (is_published = false, a linha fica) e a URL antiga vai para o Ouro Park
--                     por 301 no worker. Tarifa do site: descoberta R$ 13,99 por diária de 24h,
--                     sem mínimo nem faixa por duração (promoção de R$ 9,99 até 29/11, que não
--                     entra por vencer em dois dias); coberta R$ 25,99.
--
-- Durações que estavam vazias e que o operador publica:
--
--   Viracopos         Simulador do sistema de reserva, vaga descoberta, entrada 01/12 10h: 1 dia
--   Aeroparking       R$ 29,70, 7 R$ 207,90, 15 R$ 445,50, 30 R$ 891,00 online (10% sobre R$ 33,00
--                     por dia no local). A diária não cai com a duração. A ficha tinha só o
--                     R$ 33,00 do local; passa ao online, que é o critério das outras linhas
--                     (Bandeira e BR Parking também estão no online).
--   Estapar oficial   Bolsão F, R$ 31,00 a diária no balcão, sem faixa por duração (a tabela do
--                     edifício garagem no mesmo site também é linear: R$ 83,00 por diária).
--   Yellow Parking    Diária R$ 24,99 até 12 dias, pacote só a partir de 13: 7 = R$ 174,93.
--
-- Mapeados e deixados de fora de propósito:
--   Multipark e Aerovalet Viracopos anunciam o mesmo endereço do Bandeira Park (R. Antônio
--   Luchiari, 1100) e a mesma tabela (R$ 18,49 / 13,31 / 10,18 / 7,98): é o mesmo pátio vendido
--   por três marcas, e uma linha só evita três pinos no mesmo lugar.
--   "Estacionamento Aeroporto" (R. Maria Franceliana Braz, 81) não tem site nem marca.
--   Bolsão F, edifício garagem e Estacionamento B são o oficial, que já é uma linha.
--
-- A FAQ "quanto custa" troca o KM64 pelo Ouro Park na tabela, com trava de md5.
-- Idempotente: insert com `on conflict (slug) do nothing`, update com valor fixo.

do $vcp$
declare
  v_dest uuid;
begin
  select id into v_dest from public.destination where slug = 'aeroporto-de-viracopos';
  -- Guarda de replay: o banco do CI não tem o acervo.
  if v_dest is null then
    raise notice 'viracopos: destino ausente, nada a fazer';
    return;
  end if;

  -- 1. Lotes que faltavam
  insert into public.prospect_location (
    destination_id, name, slug, public_slug, public_name, address, latitude, longitude,
    google_maps_url, data_source, is_published,
    researched_daily_brl, researched_weekly_brl, researched_biweekly_brl, researched_monthly_brl,
    researched_at, research_source, last_reviewed_at
  ) values
  (v_dest, 'Ouro Park', 'ouro-park-viracopos', 'ouro-park',
   'Ouro Park - Estacionamento Aeroporto Viracopos',
   'R. Laviere Pereira da Silva, 1305 - Km 64, Campinas - SP, 13055-609',
   -23.0444929, -47.1378391,
   'https://maps.google.com/?cid=8698400617316140056', 'manual', true,
   13.99, 97.93, 209.85, 419.70, date '2026-11-27',
   'Site do Ouro Park (ouropark.com), consultado em 27/11/2026. Self park, vaga descoberta R$ 13,99 por diária de 24h, sem mínimo de dias e sem faixa por duração (7 = R$ 97,93, 15 = R$ 209,85, 30 = R$ 419,70); coberta R$ 25,99. Promoção de R$ 9,99 válida até 29/11/2026, não considerada. Ocupa o endereço do antigo KM64.',
   now()),
  (v_dest, 'JF Parking', 'jf-parking-viracopos', 'jf-parking',
   'JF Parking - Estacionamento Aeroporto Viracopos',
   'R. Waldemar Amstalden, 250 - Parque Viracopos, Campinas - SP',
   -23.04937, -47.14426,
   'https://maps.google.com/?cid=6611865020380664570', 'manual', true,
   null, null, null, null, date '2026-11-27',
   'Sem tarifa pública. Conferido em 27/11/2026: o site jfparkingvcp.com.br não publica tabela e a reserva é cotada pelo WhatsApp. Não copiar valor de agregador.',
   now())
  on conflict (slug) do nothing;

  -- 2. KM64 sai: o Ouro Park ocupa o endereço e o KM64 sumiu do Google e da web.
  update public.prospect_location
     set is_published = false,
         last_reviewed_at = now()
   where destination_id = v_dest and public_slug = 'km64' and is_published;

  -- 3. Durações que o operador publica e estavam vazias
  update public.prospect_location
     set researched_daily_brl = 29.70,
         researched_weekly_brl = 207.90,
         researched_biweekly_brl = 445.50,
         researched_monthly_brl = 891.00,
         researched_at = date '2026-11-27',
         research_source = 'Simulador do sistema de reserva do Viracopos Aeroparking, consultado em 27/11/2026, vaga descoberta: R$ 29,70 por dia online (10% sobre R$ 33,00 no local), sem faixa por duração (7 = R$ 207,90, 15 = R$ 445,50, 30 = R$ 891,00). Coberta R$ 38,00 por dia no local.',
         last_reviewed_at = now()
   where destination_id = v_dest and public_slug = 'viracopos-aeroparking';

  update public.prospect_location
     set researched_weekly_brl = 217.00,
         researched_biweekly_brl = 465.00,
         researched_monthly_brl = 930.00,
         researched_at = date '2026-11-27',
         research_source = 'Site do Aeroporto de Viracopos, consultado em 27/11/2026. Bolsão F (econômico): R$ 31,00 por diária no balcão, sem faixa por duração (7 = R$ 217,00, 15 = R$ 465,00, 30 = R$ 930,00); edifício garagem R$ 83,00 por diária.',
         last_reviewed_at = now()
   where destination_id = v_dest and public_slug = 'estapar-oficial'
     and researched_daily_brl = 31.00;

  update public.prospect_location
     set researched_weekly_brl = 174.93,
         researched_at = date '2026-11-27',
         research_source = 'Site do Yellow Parking (Viracopos), consultado em 27/11/2026. Vaga descoberta R$ 24,99 por diária até 12 dias (7 = R$ 174,93) e pacotes fechados de 13 a 17 diárias (R$ 260,00) e de 18 a 30 (R$ 285,00); coberta R$ 29,99, R$ 350,00 e R$ 395,00.',
         last_reviewed_at = now()
   where destination_id = v_dest and public_slug = 'yellow-parking'
     and researched_daily_brl = 24.99;
end
$vcp$;

-- 4. FAQ "quanto custa" de Viracopos: o KM64 sai da tabela e o Ouro Park entra.
update public.faq
set body_md = $faq$Comparativo dos principais estacionamentos perto do Aeroporto de Viracopos (VCP):

| Estacionamento | Diária a partir de | Como é |
|---|---|---|
| **Virapark (parceiro Movepark)** | R$ 40,00 | Vaga coberta com traslado 24h; R$ 29,90 por dia a partir de 7 diárias |
| **Garageinn (parceiro Movepark)** | R$ 59,99 | A 979 m do terminal, preço fechado na reserva online |
| Ouro Park | R$ 13,99 | Descoberta, self park, mesma diária em qualquer duração; a coberta sai R$ 25,99 |
| Bandeira Park | R$ 18,49 | Descoberta com reserva online; a diária cai para R$ 13,31 a partir de 7 dias |
| Yellow Parking | R$ 24,99 | Descoberta; de 13 a 17 diárias, R$ 260,00 fechados |
| Viracopos Aeroparking | R$ 29,70 | Descoberta com reserva online; no local, R$ 33,00 |
| Estacionamento oficial (Estapar) | R$ 31,00 | Bolsão econômico F, descoberto; o edifício garagem sai R$ 83,00 |
| BR Parking | R$ 40,00 | Só vaga coberta, com reserva online; no local, R$ 45,00 |

Os valores dos estacionamentos sem reserva online vêm do site de cada um, conferidos entre 26 e 27 de novembro de 2026, e podem mudar sem aviso. O Ouro Park ocupa o endereço onde funcionava o KM64. Quatro pátios do entorno (JF Parking, Aero Viracopos, Pórtico e Eco22) não divulgam tarifa em canal nenhum, por isso não aparecem com número. O preço do parceiro Movepark sai do motor de reservas e fica sempre atualizado na [tabela de preços de Viracopos](/estacionamentos/aeroporto-viracopos/precos).

Para reservar com preço fechado, veja as vagas na página do [Aeroporto de Viracopos](/estacionamentos/aeroporto-viracopos).$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-viracopos'
  and scope = 'destination'
  and md5(body_md) = 'ab0e5a9c3e9aa23ad52417bb09bc2938';
