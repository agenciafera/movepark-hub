-- Vaga Max: vaga para vans e utilitários, primeiro caso na Pare Seguro (GRU). 23/11/2026.
--
-- Origem: um cliente quis reservar para uma van que leva 5 pessoas na ida e volta com 10, e a
-- unidade só vendia Vaga Descoberta e Vaga Coberta. O catálogo `parking_type` não tinha tipo para
-- veículo grande. A Bruna (Pare Seguro) definiu em 20/11/2026:
--
--   - vans e utilitários, sem limite objetivo de altura, comprimento ou peso (o pátio é aberto);
--   - descoberta, 40 vagas, estadia mínima de 2 diárias;
--   - R$ 70,00 por diária inteira (a meia diária de R$ 40 é só de balcão e não vai para o site);
--   - sem pacote longo, e o valor se mantém depois de 01/12/2026 (o agendamento de dezembro não
--     toca neste tipo).
--
-- A descrição do tipo diz "vans e utilitários" e nada além disso (ADR-009): caminhão, micro-ônibus
-- ou medida máxima não foram confirmados pelo parceiro, então não aparecem na ficha.
--
-- Sem riscado (`old_price_strategy = none`): o parceiro não informou preço de balcão para esta
-- vaga, e riscar um valor que ninguém declarou seria inventar economia.
--
-- O código de vaga é `large_vehicle`. O front tira esse código da comparação de carro (índice de
-- preços, "mais barato" do destino), como já faz com moto, e a Edge `search` não o mostra na busca
-- por moto. Ver docs/specs/pricing-engine.md e docs/specs/capacidades-unidade.md.
--
-- Os blocos da unidade procuram a Pare Seguro pelo slug. Num replay sem o dado de produção
-- (CI, `supabase db reset`) a empresa não existe e só o catálogo é criado.
--
-- Publicação: os triggers `*_site_rebuild` de parking_type, company_parking_type,
-- location_parking_type, pricing_rule e pricing_tier já enfileiram o rebuild do site.

insert into public.parking_type (code, name, description)
values ('large_vehicle', 'Vaga Max', 'Vaga descoberta para vans e utilitários, em pátio aberto.')
on conflict (code) do nothing;

do $$
declare
  v_company uuid;
  v_location uuid;
  v_pt uuid;
  v_cpt uuid;
  v_lpt uuid;
  v_rule uuid;
begin
  select id into v_company from public.company where slug = 'pare-seguro' and deleted_at is null;
  if v_company is null then
    raise notice 'Pare Seguro não existe neste banco: só o catálogo foi criado';
    return;
  end if;

  select id into v_location
    from public.location
   where company_id = v_company and slug = 'aeroporto-guarulhos' and deleted_at is null;
  if v_location is null then
    raise notice 'Unidade de Guarulhos da Pare Seguro não existe neste banco';
    return;
  end if;

  select id into v_pt from public.parking_type where code = 'large_vehicle';

  insert into public.company_parking_type (company_id, parking_type_id, base_price, default_capacity, is_active)
  values (v_company, v_pt, 70, 40, true)
  on conflict (company_id, parking_type_id) do nothing;
  select id into v_cpt
    from public.company_parking_type
   where company_id = v_company and parking_type_id = v_pt;

  insert into public.location_parking_type (
    location_id, company_parking_type_id, capacity, is_active,
    has_minimum_stay, minimum_stay_value, minimum_stay_unit, photos
  )
  values (
    v_location, v_cpt, 40, true,
    true, 2, 'days',
    '["/Estacionamentos/pare-seguro/pare-seguro-max-1.avif",
      "/Estacionamentos/pare-seguro/pare-seguro-max-2.avif"]'::jsonb
  )
  on conflict (location_id, company_parking_type_id) do nothing;
  select id into v_lpt
    from public.location_parking_type
   where location_id = v_location and company_parking_type_id = v_cpt;

  -- Regra e faixa só nascem uma vez: se a vaga já tem regra (migration reaplicada, ou alguém
  -- editou o preço pelo painel depois), nada aqui sobrescreve.
  if exists (select 1 from public.pricing_rule where location_parking_type_id = v_lpt) then
    return;
  end if;

  insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy, old_price_strategy)
  values (v_lpt, 'fixed_bracket', 'any_extra', 'none')
  returning id into v_rule;

  -- Faixa única, aberta a partir do dia 1: diária inteira de R$ 70,00 em qualquer duração.
  insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
  values (v_rule, 1, null, 70, null, false);
end $$;
