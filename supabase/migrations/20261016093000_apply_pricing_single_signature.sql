-- O motor de preço passa a ter UMA assinatura, porque a segunda nunca foi chamável.
-- Spec: docs/specs/pricing-engine.md
--
-- `_apply_pricing` tinha duas sobrecargas: a de 6 argumentos, herdada do baseline, e a de 13,
-- que tem default em tudo a partir do terceiro. O default é o detalhe que mata. Uma chamada com
-- 6 argumentos casa com as DUAS candidatas (a de 13 preenche o resto sozinha) e o Postgres se
-- recusa a escolher:
--
--   ERROR:  function public._apply_pricing(unknown, jsonb, unknown, unknown, unknown, integer)
--           is not unique
--   HINT:   Could not choose a best candidate function.
--
-- Ou seja, a de 6 não era a outra porta de entrada: era código morto. Toda chamada de 2 a 6
-- argumentos aborta, inclusive a que a própria função de 6 faz em si mesma no ramo `surcharge`.
-- Quem cota preço de verdade (`simulate_price`, `simulate_price_draft`, o motor de desconto)
-- sempre passou os 13, e por isso nada disso apareceu em produção.
--
-- O cabeçalho da 20260927000000 dizia que "a de 6 continua exposta e chamável", e foi por essa
-- crença que o laço do piso de estadia mínima foi duplicado nas duas. A crença estava errada, e
-- o pgTAP cobrou: o caso que chamava a de 6 derrubava o arquivo inteiro
-- (`pricing_minimum_stay.test.sql`, "planned 15 tests but ran 7") e mantinha o job `db` do CI
-- vermelho desde então.
--
-- Sobra uma assinatura. A de 13 atende a chamada de 6 argumentos pelos próprios defaults, com o
-- MESMO resultado (o laço é o mesmo, o piso é o mesmo), e ainda cobre as estratégias que a de 6
-- nem conhecia: `incremental_formula`, `monthly_remainder` e `hourly_capped`. Some também a
-- armadilha de manutenção que a 20260927000000 documentou: corrigir o motor em um lugar só.

drop function if exists public._apply_pricing(
  text, jsonb, text, jsonb, double precision, integer
);
