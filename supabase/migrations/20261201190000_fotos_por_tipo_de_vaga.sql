-- Fotos por tipo de vaga (05/11/2026).
--
-- A ficha é UMA página por unidade e o tipo de vaga é escolhido dentro dela (`?vaga=`), mas a
-- galeria era a da unidade inteira: quem escolhia Descoberta via primeiro o toldo da Coberta.
-- O Pare Seguro (GRU) mandou fotos separadas do pátio aberto e da área sombreada, e o cliente
-- precisa ver a diferença antes de pagar por ela.
--
-- `location_parking_type.photos` guarda as fotos daquele tipo, no mesmo formato de
-- `location.photos` (array de URL ou caminho `/Estacionamentos/...`). A ficha mostra as fotos do
-- tipo em evidência primeiro e depois as da unidade (fachada, recepção, traslado), que valem para
-- qualquer vaga. Vazio é o padrão: a unidade sem foto por tipo continua com a galeria de sempre.
--
-- Sem grant novo: a tabela já é legível por anon/authenticated e a escrita segue a RLS de UPDATE
-- (`lpt_operator_update`, escopo `parking-types:write`). O trigger `location_parking_type_site_rebuild` já republica a ficha
-- quando a coluna muda. Ver docs/specs/customer/listing-detail.md §3.

alter table public.location_parking_type
  add column if not exists photos jsonb not null default '[]'::jsonb;

alter table public.location_parking_type
  drop constraint if exists location_parking_type_photos_is_array;
alter table public.location_parking_type
  add constraint location_parking_type_photos_is_array check (jsonb_typeof(photos) = 'array');

comment on column public.location_parking_type.photos is
  'Fotos deste tipo de vaga (array de URL/caminho). A ficha mostra estas primeiro e depois location.photos.';
