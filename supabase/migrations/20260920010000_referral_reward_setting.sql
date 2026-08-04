-- Valor da indicação vira config do programa, com uma fonte só.
--
-- Antes o "25" morava em quatro lugares: o default da coluna `referral.reward_amount`,
-- o fallback do trigger que credita a carteira, a mensagem de compartilhamento no
-- front e, agora, o banner da sidebar. Quatro cópias do mesmo número significam que
-- mudar o programa exige lembrar de quatro lugares, e a tela pode prometer um valor
-- que o crédito não paga.
--
-- Agora: `app_setting.referral_reward_amount` é a verdade; a função lê essa chave, o
-- default da coluna chama a função, o trigger usa a função como fallback e a RPC
-- devolve o valor pro front.

insert into public.app_setting (key, value)
values ('referral_reward_amount', '25')
on conflict (key) do nothing;

create or replace function public.referral_reward_amount()
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  -- `coalesce` cobre a chave apagada: o programa continua pagando o valor histórico
  -- em vez de creditar zero sem ninguém perceber.
  select coalesce(
    (select nullif(value, '')::numeric from public.app_setting where key = 'referral_reward_amount'),
    25
  );
$$;

comment on function public.referral_reward_amount() is
  'Valor em reais que cada lado ganha por indicação concluída. Fonte única: app_setting.referral_reward_amount.';

-- Leitura liberada: o valor é público (aparece no banner e na mensagem de convite).
-- A escrita continua trancada pela policy de `app_setting` (só hub_admin).
grant execute on function public.referral_reward_amount() to anon, authenticated;

-- Toda indicação nova nasce com o valor vigente do programa.
alter table public.referral
  alter column reward_amount set default public.referral_reward_amount();

-- A RPC passa a devolver o valor do programa, ao lado do código do usuário.
create or replace function public.get_my_referrals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_list jsonb;
  v_counts jsonb;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;

  v_code := public.get_or_create_referral_code(v_uid);

  select coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id,
            'status', r.status,
            'referred_email', r.referred_email,
            'reward_amount', r.reward_amount,
            'created_at', r.created_at,
            'qualified_at', r.qualified_at
          ) order by r.created_at desc), '[]'::jsonb)
    into v_list
    from public.referral r
   where r.referrer_profile_id = v_uid;

  select jsonb_build_object(
      'pending',   count(*) filter (where status = 'pending'),
      'qualified', count(*) filter (where status = 'qualified'),
      'rewarded',  count(*) filter (where status = 'rewarded')
    ) into v_counts
    from public.referral where referrer_profile_id = v_uid;

  return jsonb_build_object(
    'code', v_code,
    'link', 'https://hub.movepark.co/r/' || v_code,
    'counts', v_counts,
    'reward_amount', public.referral_reward_amount(),
    'referrals', v_list
  );
end;
$$;
