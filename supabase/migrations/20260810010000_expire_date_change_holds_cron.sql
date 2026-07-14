-- E2.8-h (Fase B, B2.2c) · Expira os holds de troca de datas não pagos.
-- Uma cobrança de delta (payment kind='date_change') segura a capacidade das novas datas; se o PIX
-- não é pago até `expires_at`, este cron libera o hold (a reserva segue nas datas antigas).

create or replace function public.cron_expire_date_change_holds()
returns integer language plpgsql security definer set search_path to 'public' as $fe$
declare v_id uuid; n integer := 0;
begin
  for v_id in
    select id from public.payment
    where kind = 'date_change' and status = 'pending'
      and expires_at is not null and expires_at < now()
  loop
    perform public.expire_paid_date_change_hold(v_id);
    n := n + 1;
  end loop;
  return n;
end; $fe$;

revoke all on function public.cron_expire_date_change_holds() from public, anon, authenticated;
grant execute on function public.cron_expire_date_change_holds() to service_role;

-- agenda a cada 5 min (upsert por jobname)
select cron.schedule('expire-date-change-holds', '*/5 * * * *',
  $$ select public.cron_expire_date_change_holds(); $$);
