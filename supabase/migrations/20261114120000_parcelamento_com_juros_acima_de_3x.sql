-- Parcelamento: juros de 2,99% a.m. acima de 3x.
--
-- A política estava em `monthlyInterestPct: 0` com `maxInstallments: 12`, `interestFreeUpTo: 3` e
-- `absorb: 'customer'`. Combinação contraditória: dizia que quem paga o juros é o cliente, e não
-- cobrava de ninguém. Na prática eram 12x sem juros, com o custo de parcelamento do gateway caindo
-- na Movepark, em silêncio, e com o `interestFreeUpTo: 3` como config morta. Nunca doeu porque
-- nunca houve venda no cartão (zero pagamentos com `method = 'card'` até 11/09/2026), mas era o que
-- estava armado para o dia da primeira.
--
-- Decidido em 11/09/2026: mantém 12x no teto e 1x a 3x sem juros; acima disso o cliente paga
-- 2,99% a.m. pela tabela Price, que o `computeInstallmentPlan` já calcula. O excedente vai para a
-- perna da Movepark no `buildSplit`, então o parceiro continua recebendo sobre o preço da vaga.
--
-- A taxa segue editável no Manager (Configurações › Pagamentos) sem code change: esta migration
-- conserta o valor gravado, não congela a decisão. O default do código (as duas cópias de
-- `installments.ts`) subiu junto, para a política sumir do banco e o comportamento não regredir.
--
-- `jsonb_set` em vez de reescrever o JSON inteiro: o que mais estiver na chave é preservado.

update public.app_setting
set value = jsonb_set(value::jsonb, '{monthlyInterestPct}', '2.99'::jsonb, true)::text
where key = 'card_installment_policy'
  and value is not null
  and (value::jsonb ->> 'monthlyInterestPct') is distinct from '2.99';

-- Se a chave nunca existiu, nasce coerente (mesmos valores do DEFAULT_INSTALLMENT_POLICY).
insert into public.app_setting (key, value)
select 'card_installment_policy',
       '{"version":1,"enabled":true,"maxInstallments":12,"interestFreeUpTo":3,'
       || '"monthlyInterestPct":2.99,"minInstallmentCents":500,"absorb":"customer"}'
where not exists (select 1 from public.app_setting where key = 'card_installment_policy');
