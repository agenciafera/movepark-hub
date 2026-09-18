-- E3.3. As quatro campanhas de cupom que a Movepark sobe no lançamento.
--
-- Audiência determinística, e não segmento de RFM, pelo motivo que a marketing-rfm.md já fixou: o
-- score é quintil sobre a própria base, e a base de hoje tem uma reserva. "Campeão" seria o melhor
-- entre um. Contagem de reservas pagas e dias parado são verdade em qualquer tamanho de base.
--
-- Todas são `funded_by = 'platform'`: a Movepark banca a campanha dela e o parceiro recebe o mesmo
-- repasse que receberia sem o cupom. Por isso todo percentual tem teto: sem ele, 30% de uma estadia
-- de 20 diárias passa da comissão e a reserva sai no prejuízo da Movepark.
--
-- Os textos de `title` e `terms` são o que o cliente lê no cartão da carteira.

insert into public.coupon (
  company_id, code, title, description, terms,
  discount_type, discount_value, max_discount_amount,
  funded_by, audience, audience_inactive_days,
  per_user_limit, min_days, is_active, sort_order)
values
  -- Ativação. `per_user_limit = 1` é redundante com a audiência (quem usou deixa de ser primeira
  -- compra), mas fecha a janela entre reservar e pagar, quando a contagem ainda é zero.
  (null, 'BEMVINDO30', 'Primeira reserva',
   'Ativação: primeira reserva paga. Campanha de lançamento.',
   'Vale na sua primeira reserva. 30% de desconto, até R$ 40.',
   'percent', 30, 40, 'platform', 'first_purchase', null, 1, null, true, 10),

  -- A taxa de 1ª para 2ª reserva é a métrica que a apresentação nomeia (pág. 14) e o gargalo de LTV.
  -- Valor fixo de propósito: na segunda reserva o cliente já sabe o preço, e R$ 15 lê mais concreto
  -- que um percentual.
  (null, 'SEGUNDA15', 'Sua segunda reserva',
   'Recompra: quem tem exatamente uma reserva paga.',
   'Para quem já reservou uma vez com a Movepark. R$ 15 de desconto.',
   'fixed', 15, null, 'platform', 'second_purchase', null, 1, null, true, 20),

  -- Recuperação. Sem `per_user_limit`: quem sumiu de novo e voltou de novo merece o mesmo convite.
  (null, 'VOLTA20', 'Bom te ver de volta',
   'Recuperação: reserva paga e mais de 60 dias sem voltar.',
   'Para quem está há mais de 60 dias sem reservar. 20% de desconto, até R$ 30.',
   'percent', 20, 30, 'platform', 'winback', 60, null, null, true, 30),

  -- Ticket. Sem recorte de audiência: vale para qualquer cliente logado, o que a torna a única das
  -- quatro que aparece na carteira de todo mundo.
  (null, 'LONGA25', 'Viagem longa',
   'Ticket médio: estadia a partir de 7 diárias.',
   'A partir de 7 diárias. R$ 25 de desconto.',
   'fixed', 25, null, 'platform', 'public', null, null, 7, true, 40)
on conflict do nothing;
