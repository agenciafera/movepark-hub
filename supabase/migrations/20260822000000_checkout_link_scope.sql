-- Mitigação da session fixation do handoff (agent-booking.md §9 item 6).
--
-- O link de checkout loga o browser na conta que o gerou (propriedade de magic link). Com o MCP
-- /customer público, qualquer agente podia gerar um link da PRÓPRIA conta e enviá-lo a uma vítima,
-- que passaria a navegar (e eventualmente pagar) logada como o atacante.
--
-- Decisão: gerar o link passa a exigir CHAMADOR CONFIÁVEL. A tool `create_checkout_link` ganha o
-- escopo `checkout:link`, verificado por chave `mp_` (header X-API-Key) na superfície /customer.
-- A identidade do usuário continua vindo do JWT (Authorization); a chave só atesta QUEM é o agente.
-- Na prática o escopo é concedido apenas à chave interna da Movepark (o nosso bot); agentes de
-- terceiros seguem podendo buscar e reservar, mas não geram link de pagamento.

insert into public.api_scope (scope, module, description, assignable_to_api_key) values
  ('checkout:link', 'checkout',
   'Gerar link de checkout que autentica o usuário (uso interno do bot da Movepark)', true)
on conflict (scope) do update set
  module = excluded.module,
  description = excluded.description,
  assignable_to_api_key = excluded.assignable_to_api_key;
