-- pgTAP: invariantes do catálogo `amenity`.
--
-- O catálogo é dado, não código: as quatro superfícies (checklist do parceiro,
-- filtro da busca, lista da unidade, formulário de lote mapeado) leem direto da
-- tabela. Então o que precisa de teste é a linha, não o componente: um código sem
-- nome vira caixinha em branco no checklist, e um código sem ícone cai no
-- fallback `Sparkle` na página da unidade.
--
-- Transação + rollback.

begin;
select plan(6);

-- Invariantes que valem pra toda linha, hoje e nas próximas.
select is(
  (select count(*)::int from public.amenity where coalesce(nullif(trim(name), ''), null) is null),
  0, 'toda comodidade do catálogo tem nome');

select is(
  (select count(*)::int from public.amenity where coalesce(nullif(trim(icon), ''), null) is null),
  0, 'toda comodidade do catálogo tem ícone');

select is(
  (select count(*)::int from public.amenity
    where category not in ('security', 'service', 'access', 'extras')),
  0, 'toda comodidade está numa das 4 categorias');

-- Máquina de snacks e bebidas (20260819195850): a linha tem que existir, porque é
-- ela que habilita o parceiro a marcar o benefício. Sem ela, a RPC
-- `operator_set_location_amenities` rejeita o código como desconhecido.
select is(
  (select category from public.amenity where code = 'vending_machine'),
  'extras', 'vending_machine existe e está em extras');

select is(
  (select name from public.amenity where code = 'vending_machine'),
  'Máquina de snacks e bebidas', 'o rótulo é o que vai pra tela');

-- Posição no grupo: depois da área de espera, antes do seguro voo. É onde o
-- parceiro procura, junto das outras conveniências de quem espera.
select is(
  (select string_agg(code, ',' order by sort_order)
     from public.amenity
    where category = 'extras' and sort_order between 30 and 40),
  'lounge,vending_machine,flight_insurance',
  'entra entre lounge e flight_insurance sem renumerar o grupo');

select * from finish();
rollback;
