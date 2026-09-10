-- Carimbo da última tentativa de resolver o `google_place_id` por Text Search.
--
-- Contexto: ficha sem `google_place_id` nunca entra no cron do `google-place-refresh`, porque
-- ele só olha quem já tem a chave. O resultado é que ela nasce sem selo do Google e fica sem
-- para sempre. A Edge passou a resolver esse id sozinha (docs/specs/place-id-lote-mapeado.md),
-- e este carimbo é o que impede a resolução de virar consulta infinita.
--
-- Por que carimbar também a tentativa que falha: na rodada manual de 14/08/2026, 10 das 63
-- fichas não casaram com nenhum lugar, e não vão casar na semana seguinte. Sem o carimbo elas
-- pagariam Places API toda passada do cron por uma resposta já conhecida. Com ele, a Edge só
-- volta a tentar depois de RETRY_LOOKUP_AFTER_DAYS (30 dias), quando o lugar pode ter passado
-- a existir no Google.
--
-- Nulo significa "nunca tentado", que é o estado de toda ficha existente hoje: a primeira
-- passada depois deste deploy tenta todas elas.

alter table public.location
  add column if not exists google_place_lookup_at timestamptz;

alter table public.prospect_location
  add column if not exists google_place_lookup_at timestamptz;

comment on column public.location.google_place_lookup_at is
  'Última tentativa de resolver google_place_id por Text Search. Nulo = nunca tentado. Carimba mesmo quando não há match, para não reconsultar a Places API toda semana.';

comment on column public.prospect_location.google_place_lookup_at is
  'Última tentativa de resolver google_place_id por Text Search. Nulo = nunca tentado. Carimba mesmo quando não há match, para não reconsultar a Places API toda semana.';

-- Índice parcial: a Edge varre exatamente este recorte (sem place_id, viva) a cada passada.
create index if not exists location_sem_place_id_idx
  on public.location (google_place_lookup_at)
  where google_place_id is null and deleted_at is null and is_listed = true;

create index if not exists prospect_location_sem_place_id_idx
  on public.prospect_location (google_place_lookup_at)
  where google_place_id is null and is_published = true and converted_at is null;
