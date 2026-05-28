-- Seed: pricing_rule + pricing_tier para as empresas do seed inicial
-- Dados baseados na análise das 41 classes PHP do legado movepark-whitelabel
-- Padrão de insert: regra → faixas via subquery no mesmo lpt_id

-- =====================================================================
-- ABBAPARK — Aeroporto Afonso Pena
-- Padrão: tiered_progressive, fractional=threshold_with_minutes
-- =====================================================================

-- covered: 1-6 dias × 19.90 | 7-14 × 21.90 | 15+ × 23.90
insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy)
values ('b19a4ecc-a201-4574-b662-b03e36127efd', 'tiered_progressive', 'threshold_with_minutes');

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1,  6,    19.90::numeric),
  (7,  14,   21.90::numeric),
  (15, null::integer, 23.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = 'b19a4ecc-a201-4574-b662-b03e36127efd';

-- uncovered: mesma política, diárias menores
insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy)
values ('b2839617-413d-40e8-87fc-39c2bec7431f', 'tiered_progressive', 'threshold_with_minutes');

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1,  6,    16.90::numeric),
  (7,  14,   18.90::numeric),
  (15, null::integer, 20.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = 'b2839617-413d-40e8-87fc-39c2bec7431f';

-- premium: surcharge 1.30× sobre covered
insert into public.pricing_rule
  (location_parking_type_id, strategy, fractional_day_policy, surcharge_source_id, surcharge_multiplier)
values
  ('64f3ee49-3924-456c-902e-d3f884cf49aa', 'surcharge', 'none',
   'b19a4ecc-a201-4574-b662-b03e36127efd', 1.30);

-- =====================================================================
-- AEROPARK — Aeroporto Guarulhos
-- =====================================================================

-- covered: uniform_by_duration | old_price=multiplier×1.20
-- Tiers online: 1-5 × 27.90 | 6-15 × 23.90 | 16+ × 20.90
insert into public.pricing_rule
  (location_parking_type_id, strategy, fractional_day_policy, old_price_strategy, old_price_multiplier)
values
  ('d4408204-da31-4d82-ba4a-d0e273e7eab7', 'uniform_by_duration', 'any_extra', 'multiplier', 1.20);

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1,  5,    27.90::numeric),
  (6,  15,   23.90::numeric),
  (16, null::integer, 20.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = 'd4408204-da31-4d82-ba4a-d0e273e7eab7';

-- uncovered: uniform_by_duration | old_price=multiplier×1.20
-- Tiers online: 1-5 × 23.90 | 6-15 × 19.90 | 16+ × 16.90
insert into public.pricing_rule
  (location_parking_type_id, strategy, fractional_day_policy, old_price_strategy, old_price_multiplier)
values
  ('ec92b4c0-6355-4e6a-a813-0bebe12439a4', 'uniform_by_duration', 'any_extra', 'multiplier', 1.20);

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1,  5,    23.90::numeric),
  (6,  15,   19.90::numeric),
  (16, null::integer, 16.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = 'ec92b4c0-6355-4e6a-a813-0bebe12439a4';

-- valet: fixed_bracket — valores extraídos da classe AeroparkValet do legado
insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy)
values ('7be9ac1f-cc8d-4a79-839e-85ce11fd6992', 'fixed_bracket', 'any_extra');

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, total_price, unit_price)
select pr.id, t.from_day, t.to_day, t.total_price, t.unit_price
from public.pricing_rule pr
cross join (values
  (1,  1,           149.00::numeric, null::numeric),
  (2,  2,           198.00,          null),
  (3,  3,           297.00,          null),
  (4,  4,           396.00,          null),
  (5,  5,           495.00,          null),
  (6,  10,          594.00,          null),
  (11, 17,          693.00,          null),
  (18, 30,          792.00,          null),
  (31, null::integer, null,          26.40)
) t(from_day, to_day, total_price, unit_price)
where pr.location_parking_type_id = '7be9ac1f-cc8d-4a79-839e-85ce11fd6992';

-- =====================================================================
-- AEROVALET — Congonhas / Guarulhos / Terminal Tietê
-- Padrão: tiered_progressive, any_extra
-- =====================================================================

-- congonhas — covered
insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy)
values ('6b468aae-d8aa-41cb-9953-898f4b2c22fc', 'tiered_progressive', 'any_extra');

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1, 6, 19.90::numeric), (7, 14, 21.90::numeric), (15, null::integer, 23.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '6b468aae-d8aa-41cb-9953-898f4b2c22fc';

-- guarulhos — covered (base para surcharge do valet/SelfPark)
insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy)
values ('7c9d7b27-51e2-4f97-96cf-5d2cb15d8fbc', 'tiered_progressive', 'any_extra');

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1, 6, 19.90::numeric), (7, 14, 21.90::numeric), (15, null::integer, 23.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '7c9d7b27-51e2-4f97-96cf-5d2cb15d8fbc';

-- guarulhos — uncovered
insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy)
values ('1477579e-9fd6-4134-ac2d-8ca001e1c464', 'tiered_progressive', 'any_extra');

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1, 6, 16.90::numeric), (7, 14, 18.90::numeric), (15, null::integer, 20.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '1477579e-9fd6-4134-ac2d-8ca001e1c464';

-- guarulhos — valet (SelfPark): surcharge 1.40× sobre covered (padrão legado Gruparking)
insert into public.pricing_rule
  (location_parking_type_id, strategy, fractional_day_policy, surcharge_source_id, surcharge_multiplier)
values
  ('e04e65d0-fc1e-4aa1-ad34-2e5905c6785c', 'surcharge', 'none',
   '7c9d7b27-51e2-4f97-96cf-5d2cb15d8fbc', 1.40);

-- terminal tietê — covered
insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy)
values ('0a30a8f3-8a28-4889-982e-c568787cdada', 'tiered_progressive', 'any_extra');

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1, 6, 19.90::numeric), (7, 14, 21.90::numeric), (15, null::integer, 23.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '0a30a8f3-8a28-4889-982e-c568787cdada';

-- =====================================================================
-- GARAGEINN — Aeroporto Viracopos
-- uniform_by_duration | hour_tolerance=1.0h | old_price=own_table (R$40 balcão)
-- =====================================================================

insert into public.pricing_rule
  (location_parking_type_id, strategy, fractional_day_policy, fractional_day_tolerance, old_price_strategy)
values
  ('489fcd06-64a1-4c99-96e4-e255e7d5af68', 'uniform_by_duration', 'hour_tolerance', 1.0, 'own_table');

-- preços online
insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, is_old_price)
select pr.id, t.from_day, t.to_day, t.unit_price, false
from public.pricing_rule pr
cross join (values
  (1,  5,    27.90::numeric),
  (6,  15,   23.90::numeric),
  (16, null::integer, 19.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '489fcd06-64a1-4c99-96e4-e255e7d5af68';

-- preço de balcão único (R$40/dia sem faixas)
insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, is_old_price)
select pr.id, 1, null, 40.00, true
from public.pricing_rule pr
where pr.location_parking_type_id = '489fcd06-64a1-4c99-96e4-e255e7d5af68';

-- =====================================================================
-- NATIONPARK — Aeroporto Afonso Pena
-- Padrão: tiered_progressive, any_extra
-- =====================================================================

-- covered
insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy)
values ('4f9c7601-0a3b-4794-9be9-34705b21930f', 'tiered_progressive', 'any_extra');

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1, 6, 19.90::numeric), (7, 14, 21.90::numeric), (15, null::integer, 23.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '4f9c7601-0a3b-4794-9be9-34705b21930f';

-- uncovered
insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy)
values ('82d0d247-363d-4fe0-bfba-a0eed52ca93c', 'tiered_progressive', 'any_extra');

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1, 6, 16.90::numeric), (7, 14, 18.90::numeric), (15, null::integer, 20.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '82d0d247-363d-4fe0-bfba-a0eed52ca93c';

-- premium: surcharge 1.25× sobre covered
insert into public.pricing_rule
  (location_parking_type_id, strategy, fractional_day_policy, surcharge_source_id, surcharge_multiplier)
values
  ('f1d6debb-456a-4925-96b7-98b654c3ceb4', 'surcharge', 'none',
   '4f9c7601-0a3b-4794-9be9-34705b21930f', 1.25);

-- =====================================================================
-- PLENTY — Aeroporto Congonhas
-- uniform_by_duration | any_extra | old_price=own_table
-- =====================================================================

insert into public.pricing_rule
  (location_parking_type_id, strategy, fractional_day_policy, old_price_strategy)
values
  ('742562fa-3a9c-4690-a610-8d203ed63a70', 'uniform_by_duration', 'any_extra', 'own_table');

-- preços online: 1-6 × 30.00 | 7+ × 25.00
insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, is_old_price)
select pr.id, t.from_day, t.to_day, t.unit_price, false
from public.pricing_rule pr
cross join (values
  (1, 6, 30.00::numeric),
  (7, null::integer, 25.00::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '742562fa-3a9c-4690-a610-8d203ed63a70';

-- preços de balcão: 1-6 × 40.00 | 7+ × 35.00
insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, is_old_price)
select pr.id, t.from_day, t.to_day, t.unit_price, true
from public.pricing_rule pr
cross join (values
  (1, 6, 40.00::numeric),
  (7, null::integer, 35.00::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '742562fa-3a9c-4690-a610-8d203ed63a70';

-- =====================================================================
-- VIRAPARK
-- uniform_by_duration | hour_tolerance=1.0h
-- =====================================================================

insert into public.pricing_rule
  (location_parking_type_id, strategy, fractional_day_policy, fractional_day_tolerance)
values
  ('9c332d01-4d2a-44e1-9785-e6d375745f19', 'uniform_by_duration', 'hour_tolerance', 1.0);

insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
select pr.id, t.from_day, t.to_day, t.unit_price
from public.pricing_rule pr
cross join (values
  (1,  5,    27.90::numeric),
  (6,  15,   23.90::numeric),
  (16, null::integer, 19.90::numeric)
) t(from_day, to_day, unit_price)
where pr.location_parking_type_id = '9c332d01-4d2a-44e1-9785-e6d375745f19';
