-- Distância de cada unidade parceira até cada ponto do destino, medida no banco.
--
-- Por que existe. O conteúdo já publica distância POR TERMINAL em Guarulhos ("o Aeropark
-- fica a 1,88 km do Terminal 1"), mas o único número que saía por RPC era o do
-- `destination_price_index`, que mede até o ponto do destino (2,67 km no mesmo pátio).
-- Quem escrevia o texto media à mão por SQL e quem conferia não tinha como: o bloco de
-- fato do Conteúdo 22 precisa afirmar a mesma distância que o post, e um guarda sem acesso
-- ao número por terminal só saberia comparar contra o número errado.
--
-- Publicar dois números de distância na mesma praça é exatamente o defeito que a varredura
-- de 08/09/2026 apontou no acervo, e ADR-001 manda medir no Postgres, nunca no TS. Então a
-- medição por ponto vira RPC, em vez de virar haversine em script.
--
-- Destino sem ponto cadastrado devolve uma linha com `point_name = null` e a distância até
-- o próprio destino, para o chamador não precisar de dois caminhos.
--
-- SECURITY INVOKER (o padrão): respeita a RLS de `location` e `destination_point`, que já
-- expõem só o que é público. Nada aqui inventa acesso.

create or replace function public.destination_unit_distances(p_destination_slug text)
returns table (
  location_public_slug text,
  location_public_name text,
  company_name text,
  point_name text,
  distance_m integer
)
language sql
stable
set search_path = public, extensions
as $$
  with destino as (
    select d.id, d.geog
    from public.destination d
    where d.slug = p_destination_slug and d.is_published
  ),
  unidades as (
    select l.public_slug, l.public_name, c.name as company_name, l.geog
    from public.location l
    join public.company c on c.id = l.company_id
    join destino d on d.id = l.destination_id
    where l.is_listed and l.deleted_at is null and l.status = 'active' and l.geog is not null
  )
  select u.public_slug,
         u.public_name,
         u.company_name,
         dp.name,
         round(st_distance(u.geog, dp.geog))::integer
  from unidades u
  join destino d on true
  join public.destination_point dp on dp.destination_id = d.id
  union all
  select u.public_slug,
         u.public_name,
         u.company_name,
         null::text,
         round(st_distance(u.geog, d.geog))::integer
  from unidades u
  join destino d on true
  where not exists (select 1 from public.destination_point dp where dp.destination_id = d.id)
  order by 1, 5;
$$;

comment on function public.destination_unit_distances(text) is
  'Distância em metros de cada unidade parceira listada até cada ponto do destino (terminal), por ST_Distance em geography (ADR-001). Destino sem ponto cadastrado devolve uma linha com point_name nulo e a distância até o destino. É a fonte do número por terminal que o bloco de fato do blog afirma e que o guarda scripts/bloco-de-fato.mjs confere.';

grant execute on function public.destination_unit_distances(text) to anon, authenticated, service_role;
