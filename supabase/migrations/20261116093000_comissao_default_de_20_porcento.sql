-- A comissão default volta a bater com a produção: 20%, não 15%.
--
-- O repo dizia 1500 bps em dois lugares (o default da coluna `company.take_rate_bps` e a chave
-- `app_setting.default_take_rate_bps`, ambos da migration `20260627000000`), e a produção está em
-- 2000 desde algum ponto: as 45 empresas têm 2000, a chave global tem 2000 e o default da coluna no
-- banco vivo também. Nenhuma migration fez essa troca, então ela foi feita à mão e o repo ficou
-- para trás.
--
-- Por que isso importa e não é só documentação: um stack reconstruído das migrations (o do CI, e o
-- de qualquer ambiente novo) nascia com 15%, e **empresa criada ali entraria cobrando 5 pontos a
-- menos de comissão** sem ninguém notar, porque o número não aparece em lugar nenhum até o
-- Faturamento fechar o mês.
--
-- Em produção esta migration é no-op (os valores já são 2000). Ela existe para o repo parar de
-- mentir sobre o que está no ar.

alter table public.company alter column take_rate_bps set default 2000;

update public.app_setting
   set value = '2000'
 where key = 'default_take_rate_bps'
   and value is distinct from '2000';

insert into public.app_setting (key, value)
select 'default_take_rate_bps', '2000'
where not exists (select 1 from public.app_setting where key = 'default_take_rate_bps');
