-- O hold da reserva (expires_at) ignorava a config e usava 30 min cravado (86ajmx4yc).
--
-- A migration 20260727 criou booking_hold_minutes dizendo "config única governa o hold da reserva E
-- a validade do QR PIX". O QR passou a usar get_booking_hold_minutes(), mas o expires_at da reserva
-- ficou em `now() + interval '30 minutes'` fixo. Efeito: mudar a config não muda o hold, só o QR, e
-- o pgTAP booking_hold teste 5 (que seta 45 e espera +45) falha contra o banco vivo, não só local.
--
-- Como o valor padrão da config é 30, produção não muda de comportamento hoje; a mudança é passar a
-- respeitar a config, que é o motivo dela existir.
--
-- Substituição cirúrgica: pega o corpo vigente e troca só a linha do expires_at, com asserção que
-- falha alto se o alvo sumir. Recriar a função inteira de uma versão velha é o que já gerou regressão
-- neste projeto (ver 20260828000000).

do $$
declare
  v_def text;
  v_novo text;
  c_de   constant text := '  v_expires_at := now() + interval ''30 minutes'';';
  c_para constant text := '  v_expires_at := now() + (public.get_booking_hold_minutes() || '' minutes'')::interval;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_create_booking_core';

  if v_def is null then
    raise exception 'public._create_booking_core nao encontrada';
  end if;
  if position(c_de in v_def) = 0 then
    raise exception 'linha do expires_at fixo nao encontrada no corpo vigente de _create_booking_core';
  end if;

  v_novo := replace(v_def, c_de, c_para);
  if v_novo = v_def then
    raise exception 'substituicao nao alterou o corpo de _create_booking_core';
  end if;

  execute v_novo;
end $$;
