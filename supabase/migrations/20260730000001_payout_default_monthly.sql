-- E0.3.3 (retorno do review) — a transferência PADRÃO passa a ser MENSAL no dia 1 (pedido do Pedro:
-- "a transferência deverá ser mensal"). Empresas sem config própria herdam isto; cada DONO ajusta o
-- seu dia de recebimento no painel do parceiro (self-service, escopo payouts:write).
update public.app_setting set value = 'Monthly' where key = 'payout_transfer_interval';
update public.app_setting set value = '1'       where key = 'payout_transfer_day';
