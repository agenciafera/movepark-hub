-- Abatimento com piso (17/09/2026). Spec: docs/specs/split-dinamico-e-divida-do-parceiro.md.
--
-- O split dinâmico abate a dívida na perna do parceiro, e a taxa de processamento continua na
-- perna dele. Se o abatimento deixa a perna com menos do que a taxa (medido no MP-62A79F: perna
-- de R$ 0,18 pagando taxa de R$ 0,18), o recebedor fica NEGATIVO no gateway, que é o que a
-- Pagar.me pede para nunca acontecer. Regra: a perna que sobra é zero (abate tudo, vai 100% ao
-- master) ou pelo menos o piso; nunca fica na faixa entre zero e o piso. Nessa faixa, abate menos e
-- o resto da dívida fica para a próxima venda. O piso vem da Edge, por método (`debtFloorCents`).

drop function if exists public.payout_debt_reserve(uuid, bigint, text);

create or replace function public.payout_debt_reserve(
  p_company_id uuid,
  p_max_cents bigint,
  p_provider text default 'pagarme',
  p_floor_cents bigint default 0
) returns table (reservation_id uuid, amount_cents bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_debt bigint;
  v_amt  bigint;
  v_id   uuid;
begin
  if p_max_cents is null or p_max_cents <= 0 then
    return query select null::uuid, 0::bigint;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('payout_debt:' || p_company_id::text));
  v_debt := greatest(public.payout_debt_cents(p_company_id, p_provider), 0);
  v_amt  := least(v_debt, p_max_cents);
  -- Faixa proibida: sobraria para o parceiro menos que o piso (e mais que zero). Abate menos.
  if coalesce(p_floor_cents, 0) > 0 and v_amt < p_max_cents and p_max_cents - v_amt < p_floor_cents then
    v_amt := greatest(0, p_max_cents - p_floor_cents);
  end if;
  if v_amt <= 0 then
    return query select null::uuid, 0::bigint;
    return;
  end if;
  insert into public.payout_debt_reservation (company_id, provider, amount_cents, expires_at)
  values (p_company_id, p_provider, v_amt, now() + interval '15 minutes')
  returning id into v_id;
  return query select v_id, v_amt;
end;
$function$;
revoke all on function public.payout_debt_reserve(uuid, bigint, text, bigint) from public, anon, authenticated;
grant execute on function public.payout_debt_reserve(uuid, bigint, text, bigint) to service_role;
