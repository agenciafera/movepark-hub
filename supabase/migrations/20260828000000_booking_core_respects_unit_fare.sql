-- A criação da reserva ignorava o preço de tarifa por unidade (86ajmwhdk).
--
-- location_fare.price_cents_override define o preço da tarifa por unidade. Quem MOSTRA (get_unit_fares)
-- respeitava o override; quem COBRA (_create_booking_core) lia o catálogo global. O erro mudava de
-- sinal conforme o override: mais barato que o global e o cliente pagava a mais; mais caro e a casa
-- perdia. A guarda de tier desabilitado na unidade também não existia na criação.
--
-- Como a regressão nasceu: 20260721000000_location_fare.sql adicionou o overlay, e
-- 20260811000000_block_retroactive_check_in.sql redefiniu _create_booking_core partindo da versão de
-- 20260717000000. O comentário de lá diz "corpo idêntico", mas a versão copiada era anterior ao
-- overlay, então a mudança foi revertida em silêncio.
--
-- Por isso esta migration NÃO recria a função inteira. Ela pega a definição vigente e troca só as
-- duas linhas que resolvem a tarifa, preservando todo o resto byte a byte. Recriar o corpo inteiro é
-- justamente o que causou a regressão: qualquer mudança feita entre a versão copiada e o presente
-- some sem aviso. A asserção abaixo falha alto se o padrão não for encontrado, para a migration
-- nunca passar sem efeito.
--
-- Resolver por get_unit_fares(lpt) conserta as duas coisas de uma vez: o preço sai com
-- coalesce(lf.price_cents_override, f.price_cents) e os tiers desabilitados na unidade ficam de fora.

do $$
declare
  v_def text;
  v_novo text;
  c_decl_de   constant text := '  v_fare public.fare; v_fare_tier';
  c_decl_para constant text := '  v_fare record; v_fare_tier';
  c_sel_de    constant text := 'select * into v_fare from public.fare where tier = v_fare_tier and is_active = true;';
  c_sel_para  constant text := 'select * into v_fare from public.get_unit_fares(p_location_parking_type_id) where tier = v_fare_tier;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_create_booking_core';

  if v_def is null then
    raise exception 'public._create_booking_core não encontrada';
  end if;

  -- Falha alto se o alvo mudou: melhor quebrar a migration do que aplicar sem efeito.
  if position(c_decl_de in v_def) = 0 then
    raise exception 'declaração de v_fare não encontrada no corpo vigente de _create_booking_core';
  end if;
  if position(c_sel_de in v_def) = 0 then
    raise exception 'select da tarifa não encontrado no corpo vigente de _create_booking_core';
  end if;

  v_novo := replace(replace(v_def, c_decl_de, c_decl_para), c_sel_de, c_sel_para);

  if v_novo = v_def then
    raise exception 'substituição não alterou o corpo de _create_booking_core';
  end if;

  execute v_novo;
end $$;
