-- E3.3. A vitrine pública de campanhas, para quem ainda NÃO tem conta.
--
-- O furo que isto fecha: `BEMVINDO30` é a campanha de aquisição, e ela só era visível dentro da
-- carteira, que exige login. Quem nunca comprou, que é exatamente o alvo, nunca via.
--
-- Duas defesas moram aqui, e não na tela:
--
--   1. `is_advertised` separa "existe" de "é anunciado". Campanha de retenção (a de segunda
--      reserva, a de quem sumiu) pode ficar de fora do cartaz sem deixar de funcionar. O nome não
--      é `is_public` para não colidir com `audience = 'public'`, que é outra coisa: um diz QUEM
--      pode usar, o outro diz se vira propaganda.
--
--   2. O GUARD DE CAPACIDADE (ADR-009). Cupom só vale onde a reserva fecha no Hub, e hoje **zero**
--      unidades `hub` são vendáveis (as 18 com preço são todas `external`). Anunciar "30% OFF" com
--      esse estado seria promessa que nenhuma unidade cumpre. A RPC conta as unidades vendáveis
--      pelos MESMOS filtros do `get_pricing_data` e devolve lista vazia quando não há nenhuma.
--      Quando o checkout do Hub ganhar a primeira unidade, a vitrine acende sozinha, sem deploy.

alter table public.coupon
  add column if not exists is_advertised boolean not null default false;

comment on column public.coupon.is_advertised is
  'A campanha aparece na vitrine pública /descontos. Só faz sentido em cupom de plataforma: o '
  'cartaz é da Movepark, não de um parceiro.';

-- Cupom de parceiro não vira cartaz da Movepark: a página é da rede, e anunciar promoção de uma
-- empresa ali daria à unidade dela um holofote que as outras não têm.
do $$ begin
  alter table public.coupon add constraint coupon_advertised_is_platform
    check (not is_advertised or company_id is null);
exception when duplicate_object then null; end $$;

-- GUARDA DE REPLAY (no-op em produção). A função abaixo é `language sql`, e o Postgres valida o
-- corpo na criação: `l.checkout_mode` tem que existir AGORA. No vivo a coluna existe desde
-- 04/08/2026, mas no repo ela nasce em `20260921000000_checkout_mode_external`, cujo carimbo
-- futuro-datado roda DEPOIS desta migration no `supabase db reset`. Sem a guarda o replay morre
-- aqui com "column l.checkout_mode does not exist" e nenhum pgTAP roda no CI. A definição é a
-- mesma de lá (que usa `add column if not exists` e segue dona do CHECK, do comentário e do
-- trigger de guarda). Cobre também a `20260918234249`, que redefine esta função.
alter table public.location
  add column if not exists checkout_mode text not null default 'hub';

create or replace function public.public_coupon_offers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  with vendaveis as (
    -- Mesmos filtros de `get_pricing_data`: é a definição de unidade que realmente vende. Contar
    -- `pricing_rule` sozinho mentiria (as 20 unidades hub têm regra e nenhuma é vendável).
    -- Não roda `simulate_price`: a chamada é anônima e o `anon` tem statement_timeout curto.
    select count(*) as n
    from public.company c
    join public.location l on l.company_id = c.id and l.deleted_at is null
    join public.location_parking_type lpt on lpt.location_id = l.id and lpt.is_active
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id and cpt.is_active
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
    where c.deleted_at is null and c.status = 'active' and c.onboarding_status = 'active'
      and l.status = 'active' and l.is_listed
      and l.checkout_mode = 'hub'
  )
  select jsonb_build_object(
    'honored_by_units', (select n from vendaveis),
    'offers', case when (select n from vendaveis) = 0 then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', upper(c.code),
               'title', coalesce(c.title, c.description),
               'terms', c.terms,
               'discount_type', c.discount_type,
               'discount_value', c.discount_value,
               'max_discount_amount', c.max_discount_amount,
               'min_days', c.min_days,
               'min_amount', c.min_amount,
               'valid_until', c.valid_until,
               'audience', c.audience)
             order by c.sort_order, c.created_at)
      from public.coupon c
      where c.company_id is null
        and c.is_advertised
        and c.is_active
        and (c.valid_from is null or c.valid_from <= now())
        and (c.valid_until is null or c.valid_until >= now())
        and (c.max_uses is null or c.times_used < c.max_uses)
    ), '[]'::jsonb) end);
$fn$;

comment on function public.public_coupon_offers() is
  'Vitrine pública de campanhas da Movepark, para quem ainda não tem conta. Devolve lista vazia '
  'quando nenhuma unidade do Hub pode honrar cupom (ADR-009): anunciar desconto sem unidade que '
  'cumpra seria propaganda de algo que não existe. Não expõe cupom de parceiro nem code_only.';

-- Anônimo PRECISA executar: a página é justamente para quem não tem conta.
revoke all on function public.public_coupon_offers() from public;
grant execute on function public.public_coupon_offers() to anon, authenticated, service_role;

-- As quatro campanhas de lançamento viram cartaz. As de retenção entram porque a condição é
-- escrita no cartão ("Vale só na segunda reserva"): saber que o benefício existe é o que traz a
-- pessoa de volta, e esconder seria perder o recado.
update public.coupon set is_advertised = true
where company_id is null and code in ('BEMVINDO30', 'SEGUNDA15', 'VOLTA20', 'LONGA25');
