-- Taxa de antecipação prevista na cobrança (23/11/2026). Spec: docs/specs/antecipacao-do-parceiro.md
--
-- Com o estacionamento pagando a antecipação, a Movepark não cede nada no split
-- (`anticipation_comp_cents` fica nulo) e a taxa só aparece nos recebíveis quando a Pagar.me
-- antecipa, por volta do D+29. Sem esta coluna a reserva diria "ainda não antecipado" até lá. A Edge
-- create-card-charge grava aqui a estimativa (base da perna do parceiro, taxa ao mês do
-- app_setting, dias antecipados de cada parcela) para a tela mostrar a taxa desde a venda. Não vai
-- ao split nem ao gateway: é só previsão, e a releitura grava a real em
-- `anticipation_fee_partner_cents`.

alter table public.payment
  add column if not exists anticipation_estimate_cents integer;

comment on column public.payment.anticipation_estimate_cents is
  'Taxa de antecipação prevista na perna do parceiro quando ele mesmo paga (sem folga). Só exibição; a real vem na releitura. Spec: docs/specs/antecipacao-do-parceiro.md';
