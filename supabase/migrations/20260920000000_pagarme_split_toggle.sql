-- Interruptor do split no gateway (transição para o modelo de custódia).
--
-- Com 'false', as cobranças saem SEM a chave `split` no pedido e o valor cai inteiro na conta da
-- Movepark. O snapshot em `payment.split` continua sendo gravado: ele é o razão de quanto devemos
-- ao parceiro, e é dele que `payout_statement` e `payout_balance` derivam. Ou seja, o extrato do
-- parceiro continua correto; o que muda é onde o dinheiro fica.
--
-- Nasce DESLIGADO por decisão de produto (jul/2026): a Pagar.me abriu conta escrow para a Movepark
-- e o repasse passa a ser operação nossa. Reverter é trocar o valor para 'true'.
--
-- ATENÇÃO: a API do Pagar.me não tem rota para creditar um recebedor fora do split. Enquanto esta
-- chave estiver 'false', nenhum valor novo entra no saldo do parceiro no gateway, e o repasse tem
-- que sair por fora (saque da Movepark + PIX/TED). Ver docs/specs/payment-split.md.

insert into public.app_setting (key, value)
values ('pagarme_split_enabled', 'false')
on conflict (key) do nothing;
