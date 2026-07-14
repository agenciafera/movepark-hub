-- Backfill: aponta as fotos LOCAIS de location.photos para os arquivos .webp já publicados.
--
-- Contexto: as imagens de public/{Estacionamentos,airports,images} foram convertidas de
-- jpg/png para .webp (mesmas dimensões, ~83% mais leves) e publicadas no Cloudflare Pages.
-- location.photos guarda caminhos locais como "/Estacionamentos/.../foto_001.jpg"; aqui só
-- trocamos a extensão desses caminhos LOCAIS (que começam com "/") para ".webp". As URLs
-- absolutas do Supabase Storage (https://...supabase.co/...) permanecem intactas.
--
-- Idempotente: reexecutar não muda nada (um caminho já ".webp" não casa o filtro). Seguro em
-- ambientes sem essas linhas (no-op). Os arquivos .webp já estão live antes deste backfill.

with rewritten as (
  select l.id,
    jsonb_agg(
      case
        when t.elem like '/%' and t.elem ~* '\.(jpe?g|png)$'
          then regexp_replace(t.elem, '\.(jpe?g|png)$', '.webp', 'i')
        else t.elem
      end
      order by t.ord
    ) as new_photos
  from location l,
       jsonb_array_elements_text(l.photos) with ordinality as t(elem, ord)
  where jsonb_typeof(l.photos) = 'array'
    and l.photos::text ~* '"/[^"]+\.(jpe?g|png)"'
  group by l.id
)
update location l
set photos = r.new_photos
from rewritten r
where l.id = r.id;
