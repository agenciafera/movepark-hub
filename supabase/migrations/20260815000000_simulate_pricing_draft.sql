-- E1.4 · Simulação de RASCUNHO de precificação.
--
-- Problema: o simulador dentro do editor chamava `simulate_price`, que lê a regra JÁ SALVA no banco.
-- O parceiro editava a tabela, clicava em "calcular" e via o preço ANTIGO, achando que era o novo.
--
-- Esta RPC calcula a partir da regra + faixas que ainda estão na tela (rascunho), sem persistir nada.
-- O cálculo continua sendo o do motor (`_apply_pricing`, IMMUTABLE): nenhuma reimplementação em TS.
-- Assim a prévia mostra o preço que o cliente vai pagar ANTES de salvar, e a inversão de faixa
-- aparece enquanto o parceiro digita, não depois do estrago.

create or replace function public.simulate_pricing_draft(
  p_rule  jsonb,
  p_tiers jsonb default '[]'::jsonb,
  p_days  int[] default array[1, 2, 3, 4, 5, 6, 7, 10, 14, 15, 17, 18, 20, 30, 35]
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_strategy     text := p_rule ->> 'strategy';
  v_source_id    uuid := nullif(p_rule ->> 'surcharge_source_id', '')::uuid;
  v_src_strategy text;
  v_src_tiers    jsonb;
  v_out          jsonb := '[]'::jsonb;
  v_day          int;
  v_price        numeric;
begin
  if v_strategy is null or v_strategy = '' then
    return jsonb_build_object('error', 'Estratégia não informada');
  end if;

  -- Sobretaxa herda o cálculo de outro tipo de vaga, que já está salvo: lê a regra dele.
  if v_strategy = 'surcharge' and v_source_id is not null then
    select pr.strategy,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'from_day', t.from_day,
                 'to_day', t.to_day,
                 'unit_price', t.unit_price,
                 'total_price', t.total_price
               ) order by t.from_day
             ) filter (where t.id is not null),
             '[]'::jsonb
           )
      into v_src_strategy, v_src_tiers
      from public.pricing_rule pr
      left join public.pricing_tier t
        on t.pricing_rule_id = pr.id
       and coalesce(t.is_old_price, false) = false
     where pr.location_parking_type_id = v_source_id
     group by pr.strategy;
  end if;

  foreach v_day in array p_days loop
    v_price := public._apply_pricing(
      v_strategy,
      coalesce(p_tiers, '[]'::jsonb),
      v_src_strategy,
      v_src_tiers,
      nullif(p_rule ->> 'surcharge_multiplier', '')::float8,
      v_day,
      nullif(p_rule ->> 'incremental_one_day_price', '')::float8,
      nullif(p_rule ->> 'incremental_two_days_price', '')::float8,
      nullif(p_rule ->> 'incremental_base', '')::float8,
      nullif(p_rule ->> 'incremental_multiplier', '')::float8,
      nullif(p_rule ->> 'monthly_fixed_price', '')::float8,
      nullif(p_rule ->> 'monthly_daily_rate', '')::float8,
      nullif(p_rule ->> 'hourly_daily_rate', '')::float8
    );
    v_out := v_out || jsonb_build_array(jsonb_build_object('days', v_day, 'price', v_price));
  end loop;

  return v_out;
end;
$$;

comment on function public.simulate_pricing_draft(jsonb, jsonb, int[]) is
  'Simula a curva de preço de um rascunho (regra + faixas ainda não salvas) usando o motor _apply_pricing. Não persiste nada.';

revoke all on function public.simulate_pricing_draft(jsonb, jsonb, int[]) from public, anon;
grant execute on function public.simulate_pricing_draft(jsonb, jsonb, int[]) to authenticated;
