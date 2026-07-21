-- Assistente (E3.3): o prompt passa a declarar os limites, achado rodando os roteiros de teste.
--
-- Cenário C7 de docs/specs/customer/agent-test-scenarios.md: pedimos para remarcar uma reserva e o
-- bot respondeu que ajudaria com "a remarcação" e "as novas datas" depois do login. Remarcar NÃO
-- existe em nenhuma superfície de consumidor, então ele estava prometendo o que não faz. Mesmo risco
-- para cobrança e link de pagamento, que também não são dele.
--
-- Idempotente pelo `not like`: não duplica o trecho se a migration rodar de novo.

update public.app_setting
set value = value ||
  ' Você NÃO remarca nem troca as datas de uma reserva existente, e não gera cobrança nem link de pagamento.' ||
  ' Se pedirem isso, diga que não faz por aqui: para mudar datas, o caminho é cancelar e reservar de novo;' ||
  ' para pagar, é no checkout do site. Nunca prometa uma dessas coisas para depois do login.'
where key = 'chatbot_system_prompt'
  and value not like '%NÃO remarca%';
