-- Nome público e slug público do estacionamento: uma gramática só para as duas famílias.
--
-- Hoje a mesma coisa (um estacionamento perto de um destino) tem dois endereços e dois
-- jeitos de se chamar:
--
--   parceiro       /p/<empresa>/<unidade>/<tipo>     nome = company.name + location.name
--   lote mapeado   /estacionamentos/<destino>/<slug> nome = prospect_location.name
--
-- O parceiro, que é quem fatura, ficou com a URL sem palavra-chave e com o tipo de vaga
-- como terceiro segmento, o que quebra um lote físico em até três páginas quase idênticas
-- (17 URLs para 9 estacionamentos). O lote mapeado ficou com a URL boa, e repete o
-- aeroporto até três vezes no slug ("econopark-aeroporto-de-guarulhos-aeroporto-guarulhos").
-- Pior: quando o dono reivindica a ficha, o 301 joga a página que ganhou posição fora e
-- começa do zero numa URL nova.
--
-- Esta migration grava o nome e o slug canônicos das duas famílias, no mesmo formato, sem
-- mexer em rota nenhuma. As colunas nascem inertes de propósito: a virada das URLs é um
-- evento único, com mapa de 301 e atualização de link interno, e ela precisa que o dado já
-- exista e esteja revisado antes. Ver docs/specs/url-estacionamentos.md.
--
-- Formato do nome, aprovado em 27/08/2026:
--
--   {marca} - Estacionamento {destino}
--   "Virapark - Estacionamento Aeroporto Viracopos"
--
-- O destino sai do `seo_label` (a mesma fonte do <title> e do H1, ver src/lib/seo.ts), então
-- Curitiba entra como "Aeroporto Curitiba" e não "Afonso Pena", e o Tietê como "Rodoviária
-- Tietê". A marca é editorial: razão social entre parênteses sai, aeroporto que já está no
-- nome sai, e "Estacionamento" genérico sai, porque o padrão já traz os três.

-- ---------------------------------------------------------------------------------------
-- 1. Os sete destinos que ficaram sem rótulo de SEO
-- ---------------------------------------------------------------------------------------
-- A migration 20261019090000 escreveu `seo_label` só onde havia volume medido no Search
-- Console. Sem rótulo, a regra de slug cai para `short_name` e produz "salvador" e
-- "fortaleza", sem a palavra "aeroporto", que é o que 40,6% dos cliques do site trazem.

update public.destination set seo_label = case code
  when 'CGR' then 'Aeroporto Campo Grande (CGR)'
  when 'FLN' then 'Aeroporto Florianópolis (FLN)'
  when 'FOR' then 'Aeroporto Fortaleza (FOR)'
  when 'GYN' then 'Aeroporto Goiânia (GYN)'
  when 'SSA' then 'Aeroporto Salvador (SSA)'
  when 'THE' then 'Aeroporto Teresina (THE)'
  when 'VIX' then 'Aeroporto Vitória (VIX)'
  else seo_label
end
where seo_label is null or btrim(seo_label) = '';

-- ---------------------------------------------------------------------------------------
-- 2. Rótulo primário, a peça que os dois lados compartilham
-- ---------------------------------------------------------------------------------------
-- "Aeroporto Curitiba, Afonso Pena (CWB)" vira "Aeroporto Curitiba": sem o código, que já
-- está no título, e sem a variante secundária, que estouraria o nome da unidade e o slug.
-- É o mesmo recorte de `seoLabelPrimary` em src/lib/seo.ts, e as duas implementações
-- precisam continuar dando o mesmo resultado.

create or replace function public.seo_label_primary(p_label text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $function$
  select btrim(split_part(
    regexp_replace(coalesce(p_label, ''), '\s*\([^)]*\)\s*$', ''),
    ',', 1));
$function$;

comment on function public.seo_label_primary(text) is
  'Primeira forma de chamar o destino, sem código IATA e sem variante secundária. Espelha seoLabelPrimary de src/lib/seo.ts.';

-- ---------------------------------------------------------------------------------------
-- 3. Slug público do destino
-- ---------------------------------------------------------------------------------------
-- `slug` continua sendo o contrato de URL em produção e não é tocado aqui. `public_slug` é
-- o alvo: sai do rótulo de busca, então `aeroporto-internacional-de-sao-paulo-guarulhos`
-- vira `aeroporto-guarulhos`, que é como as pessoas digitam e como o título já fala.

alter table public.destination
  add column if not exists public_slug text;

comment on column public.destination.public_slug is
  'Slug alvo da URL pública (/estacionamentos/<public_slug>), derivado do seo_label. Inerte até a virada de rotas; `slug` segue valendo.';

update public.destination
set public_slug = public.slugify(
  public.seo_label_primary(coalesce(nullif(btrim(seo_label), ''), short_name, name))
)
where public_slug is null;

create unique index if not exists destination_public_slug_key
  on public.destination (public_slug)
  where public_slug is not null;

create or replace function public.destination_set_public_slug()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.public_slug is null or new.public_slug = '' then
    new.public_slug := public.slugify(
      public.seo_label_primary(coalesce(nullif(btrim(new.seo_label), ''), new.short_name, new.name))
    );
  end if;
  return new;
end $function$;

revoke all on function public.destination_set_public_slug() from public, anon, authenticated;

drop trigger if exists destination_set_public_slug on public.destination;
create trigger destination_set_public_slug
  before insert or update of seo_label, short_name, name, public_slug on public.destination
  for each row execute function public.destination_set_public_slug();

-- ---------------------------------------------------------------------------------------
-- 4. O compositor do nome
-- ---------------------------------------------------------------------------------------
-- O padrão mora aqui, e não espalhado por 87 linhas de backfill: se um destino mudar de
-- rótulo, um único UPDATE recompõe os nomes de todas as fichas dele.

create or replace function public.unit_public_name(p_brand text, p_destination_id uuid)
returns text
language sql
stable
set search_path to 'public'
as $function$
  select btrim(p_brand) || ' - Estacionamento ' ||
         public.seo_label_primary(coalesce(nullif(btrim(d.seo_label), ''), d.short_name, d.name))
  from public.destination d
  where d.id = p_destination_id;
$function$;

comment on function public.unit_public_name(text, uuid) is
  'Compõe "{marca} - Estacionamento {destino}", o nome canônico da ficha de estacionamento. Nulo quando o destino não existe.';

revoke all on function public.unit_public_name(text, uuid) from public, anon;

-- ---------------------------------------------------------------------------------------
-- 5. As colunas das duas famílias
-- ---------------------------------------------------------------------------------------

alter table public.location
  add column if not exists public_name text,
  add column if not exists public_slug text;

comment on column public.location.public_name is
  'Nome canônico da ficha pública, no formato "{marca} - Estacionamento {destino}". `name` segue sendo o rótulo interno que o parceiro edita.';
comment on column public.location.public_slug is
  'Último segmento da URL pública (/estacionamentos/<destino>/<public_slug>). Único por destino, compartilhando o namespace com prospect_location.';

alter table public.prospect_location
  add column if not exists public_name text,
  add column if not exists public_slug text;

comment on column public.prospect_location.public_name is
  'Nome canônico da ficha pública, no formato "{marca} - Estacionamento {destino}".';
comment on column public.prospect_location.public_slug is
  'Último segmento da URL pública. Único por destino, no mesmo namespace de location: reivindicar a ficha passa a manter a URL em vez de redirecionar.';

-- ---------------------------------------------------------------------------------------
-- 6. Unicidade por destino, nas duas tabelas e entre elas
-- ---------------------------------------------------------------------------------------
-- Dentro de cada tabela um índice parcial resolve. Entre as duas não existe constraint que
-- atravesse tabela, então vale a mesma guarda que `prospect_location_guard_slug` já usa
-- para o slug antigo: trigger dos dois lados. Ficha convertida sai dos dois checks, porque
-- é exatamente ela que empresta o slug para a unidade que nasceu da conversão.

create unique index if not exists location_destination_public_slug_key
  on public.location (destination_id, public_slug)
  where public_slug is not null and destination_id is not null and deleted_at is null;

create unique index if not exists prospect_location_destination_public_slug_key
  on public.prospect_location (destination_id, public_slug)
  where public_slug is not null and converted_at is null;

create or replace function public.location_guard_public_slug()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.public_slug is null or new.destination_id is null or new.deleted_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.prospect_location p
    where p.destination_id = new.destination_id
      and p.public_slug = new.public_slug
      and p.converted_at is null
  ) then
    raise exception
      'public_slug "%" já pertence a um lote mapeado neste destino; as duas famílias dividem a mesma URL',
      new.public_slug
      using errcode = '23505';
  end if;

  return new;
end $function$;

revoke all on function public.location_guard_public_slug() from public, anon, authenticated;

drop trigger if exists location_guard_public_slug on public.location;
create trigger location_guard_public_slug
  before insert or update of public_slug, destination_id, deleted_at on public.location
  for each row execute function public.location_guard_public_slug();

create or replace function public.prospect_guard_public_slug()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.public_slug is null or new.converted_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.location l
    where l.destination_id = new.destination_id
      and l.public_slug = new.public_slug
      and l.deleted_at is null
      and (new.converted_location_id is null or l.id <> new.converted_location_id)
  ) then
    raise exception
      'public_slug "%" já pertence a uma unidade neste destino; as duas famílias dividem a mesma URL',
      new.public_slug
      using errcode = '23505';
  end if;

  return new;
end $function$;

revoke all on function public.prospect_guard_public_slug() from public, anon, authenticated;

drop trigger if exists prospect_guard_public_slug on public.prospect_location;
create trigger prospect_guard_public_slug
  before insert or update of public_slug, destination_id, converted_at on public.prospect_location
  for each row execute function public.prospect_guard_public_slug();

-- ---------------------------------------------------------------------------------------
-- 7. Backfill das unidades parceiras
-- ---------------------------------------------------------------------------------------
-- A marca é a da empresa, porque nenhuma tem duas unidades no mesmo destino. Quando tiver,
-- o slug precisa de qualificador (bairro ou via) e o índice do passo 6 é quem avisa.
-- A unidade do Peu Park fica de fora: não tem destino, e sem destino não há URL pública.

update public.location l
set public_name = public.unit_public_name(v.brand, l.destination_id),
    public_slug = v.slug
from (values
  ('aeropark',     'aeroporto-guarulhos',          'Aeropark',     'aeropark'),
  ('aerovalet',    'aeroporto-guarulhos',          'Aerovalet',    'aerovalet'),
  ('abbapark',     'aeroporto-afonso-pena',        'Abbapark',     'abbapark'),
  ('nationpark',   'aeroporto-afonso-pena',        'Nationpark',   'nationpark'),
  ('aerovalet',    'aeroporto-congonhas',          'Aerovalet',    'aerovalet'),
  ('plenty',       'aeroporto-congonhas',          'Plenty Park',  'plenty-park'),
  ('virapark',     'virapark',                     'Virapark',     'virapark'),
  ('garageinn',    'aeroporto-viracopos',          'Garageinn',    'garageinn'),
  ('aerovalet',    'terminal-rodoviario-tiete',    'Aerovalet',    'aerovalet'),
  ('lisboa-park',  'lisboa-park',                  'Lisboa Park',  'lisboa-park'),
  ('gaita-park',   'gaita-park',                   'Gaita Park',   'gaita-park'),
  ('motion-park',  'motion-park',                  'Motion Park',  'motion-park'),
  ('moveparking',  'nova-iguacu',                  'Moveparking',  'moveparking'),
  ('agencia-fera', 'agencia-fera',                 'Agência Fera', 'agencia-fera'),
  ('ferapark',     'unidade-aeroporto',            'Ferapark',     'ferapark'),
  ('airpark',      'lisboa',                       'Airpark',      'airpark'),
  ('redpark',      'lisboa',                       'Redpark',      'redpark'),
  ('skypark',      'lisboa',                       'Skypark',      'skypark'),
  ('airpark',      'faro',                         'Airpark',      'airpark')
) as v(company_slug, location_slug, brand, slug),
     public.company c
where c.slug = v.company_slug
  and l.company_id = c.id
  and l.slug = v.location_slug
  and l.destination_id is not null;

-- ---------------------------------------------------------------------------------------
-- 8. Backfill dos lotes mapeados
-- ---------------------------------------------------------------------------------------
-- Chaveado pelo `slug` atual, que é único global. Três casos ficaram de fora da regra de
-- limpeza porque tirar a palavra deixaria o nome sem sentido: "Park Confins" e "Congonhas
-- Park" carregam o aeroporto no nome de batismo, e "Estapar Oficial" precisa do "Oficial",
-- que é o que diferencia o lote do próprio aeroporto dos vizinhos.

update public.prospect_location p
set public_name = public.unit_public_name(v.brand, p.destination_id),
    public_slug = v.slug
from (values
  ('best-park-estacionamentos-aeroporto-afonso-pena',                 'Best Park',           'best-park'),
  ('connect-park-aeroporto-afonso-pena',                              'Connect Park',        'connect-park'),
  ('express-park-aeroporto-aeroporto-afonso-pena',                    'Express Park',        'express-park'),
  ('hangar-vip-aeroporto-afonso-pena',                                'Hangar VIP',          'hangar-vip'),
  ('nikkey-estacionamento-aeroporto-afonso-pena',                     'Nikkey',              'nikkey'),
  ('aero-park-park-way-aeroporto-brasilia',                           'Aero Park',           'aero-park'),
  ('big-estacionamento-aeroporto-brasilia',                           'Big',                 'big'),
  ('df-park-estacionamento-aeroporto-brasilia',                       'DF Park',             'df-park'),
  ('vcm-park-aeroporto-campo-grande',                                 'VCM Park',            'vcm-park'),
  ('aeropark-confins-aeroporto-confins',                              'AeroPark',            'aeropark'),
  ('auto-park-brasil-aeroporto-confins',                              'Auto Park Brasil',    'auto-park-brasil'),
  ('estacionamento-patio-aeroporto-confins',                          'Pátio',               'patio'),
  ('ipo-park-aeroporto-confins',                                      'IPO Park',            'ipo-park'),
  ('park-confins-aeroporto-confins',                                  'Park Confins',        'park-confins'),
  ('space-park-aeroporto-confins',                                    'Space Park',          'space-park'),
  ('arai-park-aeroporto-congonhas',                                   'Arai Park',           'arai-park'),
  ('congonhas-park-aeroporto-congonhas',                              'Congonhas Park',      'congonhas-park'),
  ('express-parking-aeroporto-congonhas',                             'Express Parking',     'express-parking'),
  ('facility-estacionamento-aeroporto-congonhas',                     'Facility',            'facility'),
  ('grand-parking-aeroporto-congonhas',                               'Grand Parking',       'grand-parking'),
  ('multipark-unidade-congonhas-aeroporto-congonhas',                 'MultiPark',           'multipark'),
  ('one-parking-congonhas-aeroporto-congonhas',                       'One Parking',         'one-parking'),
  ('the-parking-estacionamento-aeroporto-congonhas',                  'The Parking',         'the-parking'),
  ('aviacao-park-aeroporto-cuiaba',                                   'Aviação Park',        'aviacao-park'),
  ('ebr-estacionamento-aeroporto-cuiaba',                             'EBr',                 'ebr'),
  ('estacione-aki-aeroporto-cuiaba',                                  'Estacione Aki',       'estacione-aki'),
  ('estet-car-aeroporto-cuiaba',                                      'Estet Car',           'estet-car'),
  ('jr-estacionamento-aeroporto-cuiaba',                              'JR',                  'jr'),
  ('vision-park-aeroporto-cuiaba',                                    'Vision Park',         'vision-park'),
  ('portal-estacionamento-aeroporto-florianopolis',                   'Portal',              'portal'),
  ('confort-park-estacionamento-aeroporto-fortaleza',                 'Confort Park',        'confort-park'),
  ('estacionamento-atacadao-aeroporto-fortaleza',                     'Atacadão',            'atacadao'),
  ('estacionamento-prime-aeroporto-fortaleza',                        'Prime',               'prime'),
  ('estacionamento-aero-parking-aeroporto-goiania',                   'Aero Parking',        'aero-parking'),
  ('estacionamento-bambuzal-aeroporto-salvador',                      'Bambuzal',            'bambuzal'),
  ('executive-park-aeroporto-salvador',                               'Executive Park',      'executive-park'),
  ('estacionamento-forno-brasa-aeroporto-teresina',                   'Forno & Brasa',       'forno-brasa'),
  ('smartpark-teresina-aeroporto-teresina',                           'Smartpark',           'smartpark'),
  ('br-parking-viracopos',                                            'BR Parking',          'br-parking'),
  ('estacionamento-oficial-viracopos-estapar',                        'Estapar Oficial',     'estapar-oficial'),
  ('km64-estacionamento-viracopos',                                   'KM64',                'km64'),
  ('yellow-parking-viracopos',                                        'Yellow Parking',      'yellow-parking'),
  ('braspark-vitoria-aeroporto-vitoria',                              'Braspark',            'braspark'),
  ('market-park-estacionamento-aeroporto-vitoria',                    'Market Park',         'market-park'),
  ('park-day-by-day-aeroporto-vitoria',                               'Day by Day',          'day-by-day'),
  ('peter-park-estacionamento-aeroporto-galeao',                      'Peter Park',          'peter-park'),
  ('rl-estacionamentos-aeroporto-galeao',                             'RL',                  'rl'),
  ('airport-park-supera-park-estacionamento-ltda-aeroporto-guarulhos','Airport Park',        'airport-park'),
  ('bandeira-park-aeroporto-guarulhos',                               'Bandeira Park',       'bandeira-park'),
  ('br-parking-express-aeroporto-guarulhos',                          'BR Parking Express',  'br-parking-express'),
  ('callpark-estacionamentos-aeroporto-guarulhos',                    'CallPark',            'callpark'),
  ('decolar-park-estacionamento-aeroporto-guarulhos',                 'Decolar Park',        'decolar-park'),
  ('econopark-aeroporto-de-guarulhos-aeroporto-guarulhos',            'Econopark',           'econopark'),
  ('flypark-aeroporto-guarulhos',                                     'FlyPark',             'flypark'),
  ('gopark-aeroporto-guarulhos',                                      'GoPark',              'gopark'),
  ('multipark-estacionamentos-aeroporto-guarulhos',                   'MultiPark',           'multipark'),
  ('park-222-aeroporto-guarulhos',                                    'Park 222',            'park-222'),
  ('ponce-park-ponce-park-garagem-ltda-aeroporto-guarulhos',          'Ponce Park',          'ponce-park'),
  ('servparking-aeroporto-guarulhos',                                 'ServParking',         'servparking'),
  ('urban-park-aeroporto-guarulhos',                                  'Urban Park',          'urban-park'),
  ('all-park-estacionamentos-aeroporto-recife',                       'All Park',            'all-park'),
  ('estacionamento-carcara-aeroporto-recife',                         'Carcará',             'carcara'),
  ('estacionamento-recife-grupo-recife-rent-a-car-aeroporto-recife',  'Recife Rent a Car',   'recife-rent-a-car'),
  ('foco-park-estacionamento-aeroporto-recife',                       'Foco Park',           'foco-park'),
  ('talentos-park-aeroporto-recife',                                  'Talentos Park',       'talentos-park'),
  ('keep-parking-aeroporto-porto-alegre',                             'Keep Parking',        'keep-parking'),
  ('ve-parking-estacionamentos-aeroporto-porto-alegre',               'VE Parking',          've-parking')
) as v(slug_atual, brand, slug)
where p.slug = v.slug_atual;
