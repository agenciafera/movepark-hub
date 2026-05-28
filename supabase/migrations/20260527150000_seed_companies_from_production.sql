-- ============================================================
-- Alinhar companies/locations/parking-types com os tenants reais
-- de produção (schemas movepark-backoffice-v4).
--
-- Mapping (prod tenant → Hub company slug):
--   abbapark, aerovalet, garageinn, nationpark, plenty,
--   garageinn_virapark → virapark, garageinn_cev → garageinn,
--   airpark, bandeirapark (era aeropark no Hub), ferapark,
--   moveparking, nine, redpark, skypark
-- ============================================================

-- 1. Renomeia 'aeropark' → 'bandeirapark' (Aeropark GRU é brand
--    da bandeirapark em produção). Mantém FKs (locations, cpts).
update public.company
   set name = 'Bandeirapark',
       slug = 'bandeirapark',
       legal_name = coalesce(legal_name, 'Bandeirapark Estacionamentos')
 where slug = 'aeropark';

-- 2. Adiciona empresas que faltavam
insert into public.company (name, slug, legal_name) values
  ('Airpark',     'airpark',     'Airpark Portugal'),
  ('Ferapark',    'ferapark',    'Fera Park'),
  ('Moveparking', 'moveparking', 'Moveparking Estacionamentos'),
  ('Nine',        'nine',        'Nine Estacionamentos'),
  ('Redpark',     'redpark',     'Redpark Portugal'),
  ('Skypark',     'skypark',     'Skypark Portugal')
on conflict (slug) do nothing;

-- 3. Adiciona localizações faltantes (uma por (company_slug, slug))
insert into public.location (company_id, name, slug, address, phone, email, timezone)
select c.id, l.name, l.slug, l.address, l.phone, nullif(l.email, ''), l.timezone
from (values
  ('airpark',     'Faro',                  'faro',
      'Rua José Dias Rato Montenegro - Faro',
      '+351218206188', 'info@airpark.pt', 'Europe/Lisbon'),
  ('airpark',     'Lisboa',                'lisboa',
      'R. Particular 7 Armazém 12, 2685-583 Camarate, Portugal',
      '+351218206188', 'info@airpark.pt', 'Europe/Lisbon'),
  ('ferapark',    'Unidade Aeroporto',     'unidade-aeroporto',
      'Rua Tito 153, Perdizes - São Paulo - SP',
      '+551133333333', 'contato@fera.ag', 'America/Sao_Paulo'),
  ('moveparking', 'Nova Iguaçu',           'nova-iguacu',
      'Av. Gov. Amaral Peixoto, 507 - Centro, Nova Iguaçu - RJ, 26210-060',
      '+5521973212002', 'contato@moveparking.com.br', 'America/Sao_Paulo'),
  ('nine',        'Estacionamento Av. 9 de Julho', 'estacionamento',
      'Av. Nove de Julho, 3186 - Jardim Paulista, São Paulo - SP',
      '+5519991104651', 'nine@garageinn.com.br', 'America/Sao_Paulo'),
  ('redpark',     'Lisboa',                'lisboa',
      'Rua Particular, nº 12 - Camarate, 2680-583',
      '+351966687677', '', 'Europe/Lisbon'),
  ('skypark',     'Lisboa',                'lisboa',
      'R. B 45, Quinta do Carmo - 2685-129 Sacavém',
      '+351962406952', '', 'Europe/Lisbon')
) as l(company_slug, name, slug, address, phone, email, timezone)
join public.company c on c.slug = l.company_slug
on conflict (company_id, slug) do nothing;

-- 4. Habilita company_parking_type para as novas empresas
insert into public.company_parking_type (company_id, parking_type_id, base_price, default_capacity)
select c.id, pt.id, 0, 100
from (values
  ('airpark',     'covered'),
  ('airpark',     'uncovered'),
  ('bandeirapark','uncovered'),
  ('ferapark',    'covered'),
  ('ferapark',    'uncovered'),
  ('moveparking', 'uncovered'),
  ('moveparking', 'motorcycle'),
  ('nine',        'covered'),
  ('redpark',     'covered'),
  ('redpark',     'uncovered'),
  ('skypark',     'covered'),
  ('skypark',     'uncovered')
) as x(company_slug, pt_code)
join public.company c on c.slug = x.company_slug
join public.parking_type pt on pt.code = x.pt_code
on conflict (company_id, parking_type_id) do nothing;

-- 5. Cria location_parking_type para as combinações de prod
insert into public.location_parking_type (location_id, company_parking_type_id, capacity)
select l.id, cpt.id, 100
from (values
  ('airpark',     'faro',              'covered'),
  ('airpark',     'faro',              'uncovered'),
  ('airpark',     'lisboa',            'covered'),
  ('airpark',     'lisboa',            'uncovered'),
  -- bandeirapark/Aeroporto de Guarulhos: covered/valet já vieram de aeropark
  ('bandeirapark','aeroporto-guarulhos','uncovered'),
  ('ferapark',    'unidade-aeroporto', 'covered'),
  ('ferapark',    'unidade-aeroporto', 'uncovered'),
  ('moveparking', 'nova-iguacu',       'uncovered'),
  ('moveparking', 'nova-iguacu',       'motorcycle'),
  ('nine',        'estacionamento',    'covered'),
  ('redpark',     'lisboa',            'covered'),
  ('redpark',     'lisboa',            'uncovered'),
  ('skypark',     'lisboa',            'covered'),
  ('skypark',     'lisboa',            'uncovered')
) as x(company_slug, location_slug, pt_code)
join public.company c on c.slug = x.company_slug
join public.location l on l.company_id = c.id and l.slug = x.location_slug
join public.company_parking_type cpt
  on cpt.company_id = c.id
join public.parking_type pt on pt.id = cpt.parking_type_id and pt.code = x.pt_code
on conflict (location_id, company_parking_type_id) do nothing;

-- 6. Atualiza capacidades zeradas dos seeds antigos para 100
update public.location_parking_type
   set capacity = 100
 where capacity = 0;

update public.company_parking_type
   set default_capacity = 100
 where default_capacity = 0;
