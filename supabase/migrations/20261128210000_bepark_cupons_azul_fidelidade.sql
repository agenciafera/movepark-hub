-- Cupons Azul Fidelidade da BePark (Confins), que até aqui só existiam no whitelabel legado.
--
-- São cupons DA EMPRESA, não campanha da Movepark: no whitelabel quem banca é o parceiro, então
-- `funded_by = 'company'` e o desconto reduz repasse e comissão na mesma proporção (ver
-- coupon-wallet.md §3). Por isso não precisam de `max_discount_amount`: o teto só é obrigatório
-- em cupom de plataforma, onde o desconto sai inteiro da comissão.
--
-- `audience = 'public'` repete o whitelabel, que lista os cinco níveis na tela de cupons. Cupom de
-- empresa com audiência pública só aparece na carteira quando a reserva é de uma unidade daquela
-- empresa (`customer_coupon_wallet` filtra por `company_id`), então não vaza para o resto da rede.
-- O nível Azul não é conferido, assim como no whitelabel: a escolha é declaração do cliente.
--
-- A empresa é resolvida pelo `wl_domain`, sem id gravado à mão. Idempotente pelo unique
-- `(company_id, code)`.

insert into public.coupon (
  company_id, code, title, description, terms,
  discount_type, discount_value, max_discount_amount,
  funded_by, audience, is_active, sort_order)
select co.id, v.code, v.title, v.description, v.terms,
       'percent', v.pct, null,
       'company', 'public', true, v.sort_order
from public.company co
cross join (values
  ('AZULONE40', 'Azul Fidelidade One / Unique', 'Parceria Azul Fidelidade, nível One e Unique.',
   'Para clientes Azul Fidelidade nível One ou Unique. 40% de desconto.', 40, 110),
  ('AZULDIAMANTE30', 'Azul Fidelidade Diamante', 'Parceria Azul Fidelidade, nível Diamante.',
   'Para clientes Azul Fidelidade nível Diamante. 30% de desconto.', 30, 120),
  ('AZULSAFIRA25', 'Azul Fidelidade Safira', 'Parceria Azul Fidelidade, nível Safira.',
   'Para clientes Azul Fidelidade nível Safira. 25% de desconto.', 25, 130),
  ('AZULTOPAZIO15', 'Azul Fidelidade Topázio', 'Parceria Azul Fidelidade, nível Topázio.',
   'Para clientes Azul Fidelidade nível Topázio. 15% de desconto.', 15, 140),
  ('AZULBASICO10', 'Azul Fidelidade Básico', 'Parceria Azul Fidelidade, nível Básico.',
   'Para clientes Azul Fidelidade nível Básico. 10% de desconto.', 10, 150)
) as v(code, title, description, terms, pct, sort_order)
where co.wl_domain = 'bepark-app.movepark.co'
on conflict (company_id, code) do nothing;
