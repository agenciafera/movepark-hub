-- O purge deixa de apagar a decisão de moderação junto com o conteúdo do Google
-- (§4 e §6 de docs/specs/avaliacoes-google.md).
--
-- O buraco que isto fecha: `is_hidden` é coluna da linha que o purge apaga. A sequência que
-- devolvia o bloco ao ar sem ninguém agir era esta: o hub_admin esconde o lote, o refresh
-- fica parado um mês (é o estado de hoje, a Edge nem foi publicada), o purge apaga a linha
-- vencida, o refresh volta e insere uma linha nova com `is_hidden` no default `false`. O
-- bloco reaparece calado, e a única prova de que alguém mandou escondê-lo tinha ido embora.
--
-- A regra nova, por linha vencida:
--   * escondida  → esvazia o conteúdo do Google e PRESERVA a linha com o `is_hidden`;
--   * visível    → apaga, igual a antes.
-- Nos dois casos nenhum conteúdo do Google sobrevive aos 30 dias, então o limite de cache
-- continua cumprido. O que sobra na linha escondida é decisão nossa: um `place_id` (que
-- pode ser guardado indefinidamente) e um booleano.
--
-- A linha esvaziada segue vencida (`fetched_at` não é tocado), então continua invisível para
-- o público pela policy e continua candidata do refresh, que a sobrescreve inteira no
-- próximo `upsert` sem mexer no `is_hidden`.

create or replace function public.purge_google_place_snapshots()
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_deleted integer;
  v_stripped integer;
begin
  -- Vencida e escondida: fica a linha e o flag, sai o conteúdo do Google. A condição
  -- final deixa a função idempotente: linha já esvaziada não conta de novo na próxima
  -- passada, e o `set_updated_at` não dispara à toa todo dia.
  update public.google_place_snapshot
     set rating = null,
         user_rating_count = 0,
         maps_uri = null,
         reviews = '[]'::jsonb
   where fetched_at < now() - interval '30 days'
     and is_hidden
     and (
       rating is not null
       or user_rating_count <> 0
       or maps_uri is not null
       or reviews <> '[]'::jsonb
     );
  get diagnostics v_stripped = row_count;

  -- Vencida e visível: não há decisão a preservar, some inteira.
  delete from public.google_place_snapshot
   where fetched_at < now() - interval '30 days'
     and not is_hidden;
  get diagnostics v_deleted = row_count;

  return v_deleted + v_stripped;
end; $fn$;

comment on function public.purge_google_place_snapshots() is
  'Cumpre o limite de cache de 30 dias do Google. Devolve quantas linhas deixaram de carregar conteúdo do Google nesta passada: as vencidas e visíveis, que são apagadas, mais as vencidas e escondidas, que perdem nota, contagem, link e avaliações mas mantêm a linha e o `is_hidden`. Preservar o flag é o que impede o bloco de um lote escondido voltar ao ar sozinho quando o refresh reinsere a linha (§6 de avaliacoes-google.md).';

-- Default privilege do Supabase deixa função nova executável por anon/authenticated.
-- Isto aqui é manutenção interna, então revoga nominal e não só `from public`.
revoke all on function public.purge_google_place_snapshots() from public, anon, authenticated;
