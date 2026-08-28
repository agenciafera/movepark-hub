-- ATALHO ERRADO, revertido na migration seguinte (20260828140735). Fica no histórico
-- por paridade com o banco vivo. O permission denied do anon na destination_prospect_cards
-- foi "resolvido" promovendo a função a DEFINER, o que contorna o corte de colunas do
-- Q-021; o pgTAP de prospect_cards trava a função como INVOKER de propósito.
alter function public.destination_prospect_cards(text) security definer;
