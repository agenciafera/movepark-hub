-- Bandeira do cartão num vocabulário só (22/09/2026).
-- O checkout gravava `visa` e o webhook `card.updated` da Pagar.me sobrescrevia com `Visa`, então a
-- mesma bandeira aparecia de dois jeitos e a tela de cartões não reconhecia `Visa`. A partir de agora
-- a Edge e o webhook normalizam antes de gravar; aqui acerta o que já existe.
update public.payment_method
   set brand = case
     when lower(brand) in ('visa', 'visa electron') then 'visa'
     when lower(brand) in ('mastercard', 'master', 'maestro') then 'mastercard'
     when lower(brand) in ('amex', 'american express') then 'amex'
     when lower(brand) = 'elo' then 'elo'
     when lower(brand) in ('hipercard', 'hiper') then 'hipercard'
     else 'card' end
 where brand is distinct from case
     when lower(brand) in ('visa', 'visa electron') then 'visa'
     when lower(brand) in ('mastercard', 'master', 'maestro') then 'mastercard'
     when lower(brand) in ('amex', 'american express') then 'amex'
     when lower(brand) = 'elo' then 'elo'
     when lower(brand) in ('hipercard', 'hiper') then 'hipercard'
     else 'card' end;
