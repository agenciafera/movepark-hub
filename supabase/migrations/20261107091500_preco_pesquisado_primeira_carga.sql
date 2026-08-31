-- Primeira carga de preço pesquisado, só o que tem data recente e fonte nomeada.
--
-- O acervo do blog tem preço de concorrente em 20 posts, mas a maior parte é de 2023 a 2025.
-- Preço de terceiro com 18 meses publicado como se fosse atual é o risco que a coluna existe
-- para evitar, então entrou só o que foi conferido em agosto de 2026:
--
--   · Confins, do guia publicado em 29/08/2026 ("valores consultados nos canais oficiais de
--     cada estacionamento em agosto de 2026"): Park Confins, Central Park e Multipark.
--   · Viracopos, do guia de preços: bolsão econômico F do pátio oficial, "conferido no site
--     do aeroporto em 28 de agosto de 2026".
--
-- O que ficou de fora, e por quê:
--   · Pátio oficial de Confins. O post separa Econômico (R$ 26,90 com 72h de antecedência) e
--     Premium (R$ 60,00 a R$ 105,00 no balcão), e o Places devolve P1, P3 e Premium como
--     fichas distintas. Uma linha só não representa os dois, e escolher no chute publicaria
--     um preço que o leitor não encontra no guichê.
--   · Navegantes. O único valor publicado do comparativo é o da LocaPark, e o que o Places
--     tem com esse nome é locadora, não pátio. O Dummont Park é pátio de verdade e não
--     publica tabela.
--   · Congonhas e Guarulhos. Os valores de concorrente nesses posts são de 2024 e fev/2025.
--
-- Multipark tem os quatro períodos porque a tarifa dele é publicada e a conta fecha exata:
-- 4 x R$ 34,90 mais 3 x R$ 9,90 = R$ 169,30 na semana, 11 x R$ 9,90 a mais = R$ 248,50 em
-- quinze, 26 x R$ 9,90 a mais = R$ 397,00 em trinta.
--
-- Ver docs/specs/lote-mapeado-vitrine.md.

-- ── 1. Os dois lotes que o guia de Confins precifica e não estavam mapeados ──────────
with novo(destino, marca, slug, public_slug, endereco, lat, lng, place_id, maps) as (values
  ('aeroporto-confins', 'Central Park', 'central-park-aeroporto-confins', 'central-park',
   'R. Milton Teodoro, 115, Confins - MG, 33500-000, Brasil',
   -19.623142899999998, -43.994522599999996, 'ChIJvRIB1y5jpgARxugrCdhAdvs',
   'https://maps.google.com/?cid=17687857527066936566'),
  ('aeroporto-confins', 'Multipark', 'multipark-aeroporto-confins', 'multipark',
   'Av. Adélia Issa, 999 - Santo Antônio, Lagoa Santa - MG, 33400-000, Brasil',
   -19.6971514, -43.913171, 'ChIJb91Z6nWHpgARaC9GqAn6d64',
   'https://maps.google.com/?cid=12571124894270971752')
)
insert into public.prospect_location
  (destination_id, name, slug, public_slug, public_name, address, latitude, longitude,
   google_place_id, google_maps_url, data_source, is_published)
select d.id, n.marca, n.slug, n.public_slug,
       public.unit_public_name(n.marca, d.id),
       n.endereco, n.lat, n.lng, n.place_id, n.maps, 'google_places', true
from novo n
join public.destination d on d.public_slug = n.destino
on conflict (google_place_id) do nothing;

-- ── 2. Os preços ────────────────────────────────────────────────────────────────────
with preco(destino, public_slug, diaria, semana, quinzena, mes, dia, fonte) as (values
  ('aeroporto-confins', 'park-confins', 35.00, 149.00, null::numeric, null::numeric,
   date '2026-08-29',
   'Tarifa coberta e semanal do operador, conferida para o guia de Confins de 29/08/2026.'),
  ('aeroporto-confins', 'central-park', 22.90, 168.00, null::numeric, null::numeric,
   date '2026-08-29',
   'Tarifa coberta e pacote de 7 dias do operador, conferidos para o guia de Confins de 29/08/2026.'),
  ('aeroporto-confins', 'multipark', 34.90, 169.30, 248.50, 397.00,
   date '2026-08-29',
   'Tarifa publicada do operador (4 primeiras a R$ 34,90, R$ 9,90 da quinta em diante), conferida em 29/08/2026.'),
  ('aeroporto-viracopos', 'estapar-oficial', 31.00, 217.00, null::numeric, null::numeric,
   date '2026-08-28',
   'Bolsão econômico F, conferido no site do Aeroporto de Viracopos em 28/08/2026.')
)
update public.prospect_location p
set researched_daily_brl    = preco.diaria,
    researched_weekly_brl   = preco.semana,
    researched_biweekly_brl = preco.quinzena,
    researched_monthly_brl  = preco.mes,
    researched_at           = preco.dia,
    research_source         = preco.fonte
from preco
join public.destination d on d.public_slug = preco.destino
where p.destination_id = d.id
  and p.public_slug = preco.public_slug
  and p.converted_at is null;
