-- GEO-07 / ADR-002 — FAQ em camadas: + escopo `destination`.
-- A FAQ é resolvida por escopo (global → destination → location) e mesclada na
-- renderização — nunca duplicada. Aqui adicionamos a camada que faltava: a do
-- aeroporto/destino. Ver ADR-002 no CLAUDE.md e docs/specs/destinations.md.
--
-- Não usamos o literal `'destination'::faq_scope` no mesmo statement em que o valor
-- é adicionado (Postgres barra "unsafe use of new enum value" dentro da mesma
-- transação) — o CHECK compara `scope::text`, o que dispensa o lookup do enum novo.

-- 1) Novo valor no enum.
alter type public.faq_scope add value if not exists 'destination';

-- 2) FK opcional para o destino + índice (mesmo padrão de faq_location_id_idx).
alter table public.faq
  add column if not exists destination_id uuid references public.destination(id) on delete cascade;

create index if not exists faq_destination_id_idx
  on public.faq (destination_id)
  where (deleted_at is null);

-- 3) Consistência por escopo (substitui o CHECK de 2 escopos):
--    global      → sem location nem destination
--    destination → destination_id obrigatório, sem location
--    location    → location_id obrigatório, sem destination
alter table public.faq drop constraint if exists faq_check;
alter table public.faq add constraint faq_check check (
  (scope::text = 'global'      and location_id is null     and destination_id is null)
  or (scope::text = 'destination' and destination_id is not null and location_id is null)
  or (scope::text = 'location'    and location_id is not null    and destination_id is null)
);

-- RLS: escrita de FAQ `destination` é do hub_admin (já coberto por faq_admin_all);
-- leitura pública continua via faq_public_select (is_published & deleted_at is null).
-- Operadores seguem restritos a location — nada a alterar.
