-- Campos de curadoria editorial para a seção "Estacionamentos populares" na home.
-- Similar ao is_popular/sort_order já existente em destination.
ALTER TABLE location
  ADD COLUMN IF NOT EXISTS is_popular          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS popular_sort_order  integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_location_popular
  ON location (popular_sort_order)
  WHERE is_popular = true AND status = 'active' AND deleted_at IS NULL;

COMMENT ON COLUMN location.is_popular         IS 'Aparece na seção "Estacionamentos populares" da home quando true.';
COMMENT ON COLUMN location.popular_sort_order IS 'Ordem de exibição na home (menor = primeiro).';
