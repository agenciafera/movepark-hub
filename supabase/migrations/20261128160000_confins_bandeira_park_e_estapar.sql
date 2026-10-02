-- Confins ganha os dois pátios que o Modo IA do Google cita e que o nosso mapa não tinha
-- (Conteúdo 42, docs/specs/ataque-cnf-bepark.md §2.3).
--
-- Os dois entram como lote mapeado (ADR-010): sem preço transacional, sem Offer e sem link
-- para o site do lote. A distância NÃO vai para o banco, sai do `geog` no PostGIS (ADR-001).
-- Coordenada, endereço, telefone e `google_place_id` vieram da Places API (New) em
-- 02/10/2026, com viés de 20 km no aeroporto.
--
-- Bandeira Park Confins
--   Abriu em 01/10/2026 em Vespasiano. Pela coordenada do Google fica a 9,8 km do ponto do
--   aeroporto (a coordenada que o próprio site publica dava 9,47 km); é mais longe que a
--   BePark. Os dois domínios dele divergem no preço. Registramos o que o sistema de
--   reserva (bandeirapark.online) cobra SEM cupom, na vaga descoberta, e a condição vai na
--   fonte: "tarifa de abertura", diária por faixa de estadia.
--     1 a 6 dias R$ 24,99/dia · 7 a 12 R$ 17,99 · 13 a 17 R$ 15,59 · 18 a 30 R$ 10,79
--   Os totais abaixo são diárias x faixa: 7 = R$ 125,93, 15 = R$ 233,85, 30 = R$ 323,70.
--   O telefone que o Google devolve é de São Paulo; guardado e não exibido (Q-021).
--
-- Estapar Aeroporto (o antigo Minas Park)
--   O Zul+ declara "menos de 1 km" do terminal. Pelas duas fichas do Google no endereço
--   (Rua das Goiabeiras, km 03 da MG-10, Lagoa Santa) a distância medida é de 5,0 km, e é
--   ela que a página mostra. Usamos a ficha principal (1.281 avaliações); a outra, com 122,
--   é duplicata do mesmo pátio. A diária só aparece dentro do app; o que é público é o
--   "a partir de R$ 26,90" do blog do Zul+, e a fonte diz isso.
--
-- Idempotente: um `db push` posterior reaplica o arquivo (o carimbo local não bate com o
-- remoto) e não pode duplicar nem sobrescrever edição feita no painel.

insert into public.prospect_location (
  destination_id, name, public_name, slug, public_slug, address, phone,
  latitude, longitude, google_place_id, google_maps_url, data_source,
  is_published, last_reviewed_at,
  researched_daily_brl, researched_weekly_brl, researched_biweekly_brl, researched_monthly_brl,
  researched_at, research_source
)
select d.id, v.name, v.public_name, v.slug, v.public_slug, v.address, v.phone,
       v.lat, v.lng, v.place_id, 'https://www.google.com/maps/place/?q=place_id:' || v.place_id,
       'google_places', true, now(),
       v.d1, v.d7, v.d15, v.d30, date '2026-10-02', v.fonte
from public.destination d
cross join (values
  (
    'Bandeira Park',
    'Bandeira Park - Estacionamento Aeroporto Confins',
    'bandeira-park-aeroporto-confins',
    'bandeira-park',
    'Rodovia MG-010, Km 26,5 - Zona Rural, Vespasiano - MG, 33200-000',
    '(11) 3017-5808',
    -19.7118305::numeric, -43.9251191::numeric,
    'ChIJg6cmBSqHpgARlgUHVsanKFk',
    24.99::numeric, 125.93::numeric, 233.85::numeric, 323.70::numeric,
    'https://bandeirapark.online/estacionamento-aeroporto-confins (sistema onde a reserva fecha), consultado em 02/10/2026. Vaga descoberta, sem cupom, "tarifas de abertura, sujeitas a ajuste": R$ 24,99 por dia de 1 a 6 dias, R$ 17,99 de 7 a 12, R$ 15,59 de 13 a 17 e R$ 10,79 de 18 a 30; os totais são diária x dias. Coberta: R$ 29,99, R$ 21,59, R$ 18,71 e R$ 12,95. O R$ 7,98 que o site anuncia depende do cupom BP26, e o bandeirapark.com.br anuncia R$ 18,49 de 1 a 6 dias, valor que o sistema de reserva não cobra. Van gratuita com saída a cada 30 min. Abriu em 01/10/2026.'
  ),
  (
    'Estapar Aeroporto',
    'Estapar - Estacionamento Aeroporto Confins',
    'estapar-aeroporto-confins',
    'estapar',
    'Rodovia MG-10, 800 - R. das Goiabeiras, S/N, Km 03 - Estância das Amendoeiras, Lagoa Santa - MG, 33400-000',
    '(31) 99610-0265',
    -19.6633105::numeric, -43.9324907::numeric,
    'ChIJKbfvFRhjpgAROi9o_Rbc8g0',
    26.90::numeric, null::numeric, null::numeric, null::numeric,
    'https://www.zuldigital.com.br/blog/estacionamento-aeroporto-confins/ (blog do Zul+, app da Estapar, post de 21/07/2026), consultado em 02/10/2026: "diárias de carro partem de R$ 26,90" no Estapar Reserva. A tarifa por período só aparece dentro do app Zul+, então não registramos semana nem mês. O Zul+ declara "menos de 1 km" do terminal e van a cada 5 min; a distância medida no PostGIS a partir da ficha do Google é de 5,0 km. É o antigo Minas Park.'
  )
) as v(name, public_name, slug, public_slug, address, phone, lat, lng, place_id,
       d1, d7, d15, d30, fonte)
where d.slug = 'aeroporto-de-confins'
on conflict do nothing;
