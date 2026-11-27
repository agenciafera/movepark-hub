-- Uma cobrança do gateway vira no máximo UM pagamento (27/11/2026).
--
-- Depois do 500 da Pagar.me em 25/11/2026 (MP-F00991), o webhook passou a ligar a cobrança que
-- apareceu atrasada ao pagamento que ficou sem ids (`attachUnconfirmedPayment`). A Pagar.me entrega
-- o mesmo aviso mais de uma vez (a ch_QOXZKxhm0cyjdKeR chegou quatro vezes em 15 minutos), e nada no
-- banco impedia que a mesma cobrança acabasse em duas linhas, contando o dinheiro em dobro no razão
-- do parceiro. Com o índice único, a segunda escrita falha (23505) em vez de duplicar.
--
-- Conferido antes de aplicar: nenhuma cobrança repetida em `payment` (provider, provider_charge_id).
-- O índice antigo, só por provider_charge_id, fica: há consultas que filtram a cobrança sem o provider.

create unique index if not exists payment_provider_charge_unico
  on public.payment (provider, provider_charge_id)
  where provider_charge_id is not null;

comment on index public.payment_provider_charge_unico is
  'Uma cobrança do gateway = no máximo um pagamento. O webhook da Pagar.me entrega o mesmo aviso mais de uma vez (27/11/2026).';
