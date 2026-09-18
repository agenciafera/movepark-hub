-- E3.3. A vitrine passa a mostrar TODAS as campanhas anunciadas, sem o guard de capacidade.
--
-- Por que o guard sai: ele existia porque anunciar 30% para um CLIENTE, num dia em que nenhuma
-- unidade honra cupom, é promessa vazia (ADR-009). A premissa mudou: a página não fica mais ao
-- alcance do cliente (saiu do rodapé, do menu do celular e do sitemap no mesmo commit). Sem
-- público, não há promessa, e esconder as campanhas só impedia o time de ver o próprio catálogo.
--
-- `honored_by_units` CONTINUA sendo devolvido, e não é decoração: é o sinal que diz se a vitrine
-- pode voltar a ser pública. Zero ali significa que nenhuma reserva aceita cupom hoje, e religar
-- os links públicos nesse estado traria o ADR-009 de volta. A conta continua barata (mesmos
-- filtros do `get_pricing_data`, sem rodar `simulate_price`).

create or replace function public.public_coupon_offers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'honored_by_units', (
      -- Mesmos filtros de `get_pricing_data`: a definição de unidade que realmente vende. Contar
      -- `pricing_rule` sozinho mentiria (as 20 unidades hub têm regra e nenhuma é vendável).
      select count(*)
      from public.company c
      join public.location l on l.company_id = c.id and l.deleted_at is null
      join public.location_parking_type lpt on lpt.location_id = l.id and lpt.is_active
      join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id and cpt.is_active
      join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
      where c.deleted_at is null and c.status = 'active' and c.onboarding_status = 'active'
        and l.status = 'active' and l.is_listed
        and l.checkout_mode = 'hub'
    ),
    'offers', coalesce((
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
    ), '[]'::jsonb));
$fn$;

comment on function public.public_coupon_offers() is
  'Vitrine de campanhas da Movepark. Mostra toda campanha anunciada e ativa. `honored_by_units` '
  'diz quantas unidades do Hub podem honrar cupom: enquanto for zero, a página NÃO pode voltar a '
  'ser linkada para o cliente, porque anunciar desconto que nenhuma unidade cumpre viola o ADR-009.';

-- Campanhas novas, para a vitrine mostrar a variedade de regra que o motor sustenta: valor fixo
-- com piso de valor, percentual com teto e prazo. Todas de plataforma e bancadas pela Movepark.
insert into public.coupon (
  company_id, code, title, description, terms,
  discount_type, discount_value, max_discount_amount,
  funded_by, audience, min_amount, min_days, valid_until,
  is_active, is_advertised, sort_order)
values
  (null, 'ACIMA200', 'Reserva a partir de R$ 200',
   'Ticket: piso de valor, sem recorte de audiência.',
   'R$ 30 de desconto em reservas de R$ 200 ou mais.',
   'fixed', 30, null, 'platform', 'public', 200, null, null, true, true, 50),

  (null, 'QUINZENA15', 'Viagem de 15 dias ou mais',
   'Ticket: estadia longa, com teto para o percentual não comer a comissão.',
   '15% de desconto, até R$ 60, a partir de 15 diárias.',
   'percent', 15, 60, 'platform', 'public', null, 15, null, true, true, 60),

  (null, 'AGORA10', 'Só nesta temporada',
   'Conversão: campanha curta, com prazo.',
   '10% de desconto, até R$ 25, enquanto a campanha estiver no ar.',
   'percent', 10, 25, 'platform', 'public', null, null, now() + interval '30 days',
   true, true, 70)
on conflict do nothing;
