-- E0.3.1-a (passo 2) · Renovação manual do hold da reserva (modal keep-alive "Ainda está aí?").
-- O cliente, na fase pré-pagamento, pode renovar a janela de expiração SEM pagar — mas com TETO
-- (`booking_hold_max_minutes`, default 90) pra não segurar a vaga pra sempre em lote esgotado.
-- Server-authoritative: RPC `renew_booking_hold` (dono da reserva ou hub_admin), gateada por status
-- `pending` e pelo teto (a partir de `created_at`). Ver docs/specs/booking-flow.md e a tarefa E0.3.1-b.

-- Teto total do hold (a partir da criação da reserva). Único número; o modal comunica o limite.
insert into public.app_setting (key, value) values
  ('booking_hold_max_minutes', '90')
  on conflict (key) do nothing;

create or replace function public.get_booking_hold_max_minutes()
returns integer language sql stable security definer set search_path to 'public' as $$
  select greatest(5, coalesce((select nullif(value, '')::int
                                 from public.app_setting
                                where key = 'booking_hold_max_minutes'), 90))
$$;
alter function public.get_booking_hold_max_minutes() owner to postgres;
revoke all on function public.get_booking_hold_max_minutes() from public, anon, authenticated;
grant execute on function public.get_booking_hold_max_minutes() to service_role;

-- Renova o hold: `expires_at = min(now() + hold, created_at + teto)`. Só `pending` e dentro do teto.
-- Autoriza no corpo (dono via auth.uid() ou hub_admin) — grant a `authenticated` (checagem interna).
create or replace function public.renew_booking_hold(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profile uuid;
  v_status public.booking_status;
  v_created timestamptz;
  v_expires timestamptz;
  v_hold int := public.get_booking_hold_minutes();
  v_max int := public.get_booking_hold_max_minutes();
  v_cap_at timestamptz;
  v_new timestamptz;
begin
  select profile_id, status, created_at, expires_at
    into v_profile, v_status, v_created, v_expires
    from public.booking where id = p_booking_id for update;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;

  -- Só o dono da reserva (ou hub_admin) renova.
  if v_profile is distinct from auth.uid() and not public.is_hub_admin() then
    raise exception 'Sem permissão para renovar esta reserva.' using errcode = 'P0001';
  end if;

  -- Só reserva pendente tem hold pra renovar.
  if v_status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending', 'expires_at', v_expires);
  end if;

  v_cap_at := v_created + make_interval(mins => v_max);
  if now() >= v_cap_at then
    -- Teto atingido: não estende mais (a vaga será liberada pelo cron).
    return jsonb_build_object('ok', false, 'reason', 'cap_reached',
                              'expires_at', v_expires, 'cap_at', v_cap_at);
  end if;

  v_new := least(now() + make_interval(mins => v_hold), v_cap_at);
  update public.booking set expires_at = v_new where id = p_booking_id;

  return jsonb_build_object('ok', true, 'expires_at', v_new, 'cap_at', v_cap_at,
                            'cap_reached', v_new >= v_cap_at);
end;
$$;
alter function public.renew_booking_hold(uuid) owner to postgres;
revoke all on function public.renew_booking_hold(uuid) from public, anon;
grant execute on function public.renew_booking_hold(uuid) to authenticated, service_role;
