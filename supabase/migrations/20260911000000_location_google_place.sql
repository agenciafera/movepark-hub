-- Google Meu Negócio / Place ID da unidade, apartado do endereço (86ajp6vhh).
--
-- O endereço (coluna `address` + lat/lng, formatado pelo Places) responde "onde fica".
-- O "negócio" do Google é outra coisa: o identificador estável do lugar (`place_id`) e o
-- link do perfil no Google Meu Negócio/Maps que as bases de conhecimento do atendimento
-- entregam por unidade. Hoje o autocomplete do Places descarta o `place_id`
-- (ver 20260907000000_location_address_complement.sql), então o agente não tem como
-- devolver esse link. Estas colunas guardam o componente de negócio, sem tocar no endereço.
--
-- ADR-001 permanece: distância/proximidade continua em PostGIS (coluna gerada `geog` de
-- lat/lng). Aqui guardamos só identificador e link, nunca cálculo de geo.

alter table public.location
  add column if not exists google_place_id text,
  add column if not exists google_maps_url text;

comment on column public.location.google_place_id is
  'Place ID do Google (identificador estável do lugar). Capturado do autocomplete do Places quando disponível; apartado do endereço. Opcional.';

comment on column public.location.google_maps_url is
  'Link do perfil no Google Meu Negócio/Maps da unidade, exibível pro cliente (o get-faq devolve). Pode vir do place_id ou ser colado pelo parceiro. Opcional.';
