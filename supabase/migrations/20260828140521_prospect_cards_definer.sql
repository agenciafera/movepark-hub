-- ATALHO ERRADO, revertido na migration seguinte (20260828140735). Fica no histórico
-- por paridade com o banco vivo. O permission denied do anon na destination_prospect_cards
-- foi "resolvido" promovendo a função a DEFINER, o que contorna o corte de colunas do
-- Q-021; o pgTAP de prospect_cards trava a função como INVOKER de propósito.
-- A guarda existe porque a ORDEM do repo não é a ordem em que isso aconteceu em produção: a função
-- só é criada em `20261012000000_destination_prospect_cards.sql`, 40 migrations adiante. Num stack
-- construído do baseline o `alter` quebra com 42883, e o `supabase db reset` para aqui, levando o
-- job `db` do CI junto. Em produção é no-op: a função existe e já passou por aqui.
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'destination_prospect_cards'
  ) then
    alter function public.destination_prospect_cards(text) security definer;
  end if;
end $$;
