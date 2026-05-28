-- Seed: companies
insert into public.company (name, slug) values
  ('Virapark',    'virapark'),
  ('Garageinn',   'garageinn'),
  ('Aeropark',    'aeropark'),
  ('Abbapark',    'abbapark'),
  ('Nationpark',  'nationpark'),
  ('Aerovalet',   'aerovalet'),
  ('Plenty Park', 'plenty')
on conflict (slug) do nothing;

-- Seed: locations
insert into public.location (company_id, name, slug)
select c.id, l.name, l.slug
from (values
  ('virapark',   'Virapark',                  'virapark'),
  ('garageinn',  'Aeroporto de Viracopos',    'aeroporto-viracopos'),
  ('aeropark',   'Aeroporto de Guarulhos',    'aeroporto-guarulhos'),
  ('abbapark',   'Aeroporto Afonso Pena',     'aeroporto-afonso-pena'),
  ('nationpark', 'Aeroporto Afonso Pena',     'aeroporto-afonso-pena'),
  ('aerovalet',  'Aeroporto de Guarulhos',    'aeroporto-guarulhos'),
  ('aerovalet',  'Terminal Rodoviário Tietê', 'terminal-rodoviario-tiete'),
  ('aerovalet',  'Aeroporto de Congonhas',    'aeroporto-congonhas'),
  ('plenty',     'Aeroporto de Congonhas',    'aeroporto-congonhas')
) as l(company_slug, name, slug)
join public.company c on c.slug = l.company_slug
on conflict (company_id, slug) do nothing;

-- Seed: company_parking_type (base_price and default_capacity as placeholder 0)
insert into public.company_parking_type (company_id, parking_type_id, base_price, default_capacity)
select c.id, pt.id, 0, 0
from (values
  ('virapark',   'covered'),
  ('garageinn',  'uncovered'),
  ('aeropark',   'covered'),
  ('aeropark',   'uncovered'),
  ('aeropark',   'valet'),
  ('abbapark',   'covered'),
  ('abbapark',   'uncovered'),
  ('abbapark',   'premium'),
  ('nationpark', 'covered'),
  ('nationpark', 'uncovered'),
  ('nationpark', 'premium'),
  ('aerovalet',  'covered'),
  ('aerovalet',  'uncovered'),
  ('aerovalet',  'valet'),
  ('plenty',     'covered')
) as x(company_slug, pt_code)
join public.company c on c.slug = x.company_slug
join public.parking_type pt on pt.code = x.pt_code
on conflict (company_id, parking_type_id) do nothing;

-- Seed: location_parking_type (capacity as placeholder 0)
insert into public.location_parking_type (location_id, company_parking_type_id, capacity)
select l.id, cpt.id, 0
from (values
  ('virapark',   'virapark',                  'covered'),
  ('garageinn',  'aeroporto-viracopos',       'uncovered'),
  ('aeropark',   'aeroporto-guarulhos',       'covered'),
  ('aeropark',   'aeroporto-guarulhos',       'uncovered'),
  ('aeropark',   'aeroporto-guarulhos',       'valet'),
  ('abbapark',   'aeroporto-afonso-pena',     'covered'),
  ('abbapark',   'aeroporto-afonso-pena',     'uncovered'),
  ('abbapark',   'aeroporto-afonso-pena',     'premium'),
  ('nationpark', 'aeroporto-afonso-pena',     'covered'),
  ('nationpark', 'aeroporto-afonso-pena',     'uncovered'),
  ('nationpark', 'aeroporto-afonso-pena',     'premium'),
  ('aerovalet',  'aeroporto-guarulhos',       'covered'),
  ('aerovalet',  'aeroporto-guarulhos',       'uncovered'),
  ('aerovalet',  'aeroporto-guarulhos',       'valet'),
  ('aerovalet',  'terminal-rodoviario-tiete', 'covered'),
  ('aerovalet',  'aeroporto-congonhas',       'covered'),
  ('plenty',     'aeroporto-congonhas',       'covered')
) as x(company_slug, location_slug, pt_code)
join public.company c on c.slug = x.company_slug
join public.location l on l.company_id = c.id and l.slug = x.location_slug
join public.company_parking_type cpt on cpt.company_id = c.id
join public.parking_type pt on pt.id = cpt.parking_type_id and pt.code = x.pt_code
on conflict (location_id, company_parking_type_id) do nothing;
