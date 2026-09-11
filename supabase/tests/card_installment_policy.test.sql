-- pgTAP: a política de parcelamento guardada não pode ser incoerente consigo mesma.
--
-- `app_setting.card_installment_policy` diz até quantas parcelas ofertar, até quantas são sem juros
-- e quem paga o juros acima disso. A combinação "oferece 12x, sem juros até 3x, quem paga é o
-- cliente, taxa 0%" é contraditória: promete cobrar juros do cliente e não cobra de ninguém. O
-- custo de parcelamento do gateway cai na Movepark, em silêncio, e nenhum relatório acusa.
--
-- O motor (`_shared/payments/installments.ts` + espelho em `src/lib/installments.ts`) tem o mesmo
-- guarda sobre a política DEFAULT; este aqui cobre o valor que está gravado no banco, que é o que
-- a Edge `create-card-charge` de fato lê.
--
-- Transação com rollback.

begin;
select plan(3);

select ok(
  (select value from public.app_setting where key = 'card_installment_policy') is not null,
  'card_installment_policy está gravada'
);

select ok(
  (select (value::jsonb ? 'monthlyInterestPct')
     from public.app_setting where key = 'card_installment_policy'),
  'a política declara monthlyInterestPct'
);

select ok(
  (
    select case
      when p->>'absorb' = 'customer'
       and (p->>'maxInstallments')::int > (p->>'interestFreeUpTo')::int
        then (p->>'monthlyInterestPct')::numeric > 0
      else true
    end
    from (
      select value::jsonb as p from public.app_setting where key = 'card_installment_policy'
    ) s
  ),
  'oferecendo parcela acima do teto sem juros com absorb=customer, a taxa tem que ser > 0'
);

select * from finish();
rollback;
