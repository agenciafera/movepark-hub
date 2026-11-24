-- Recebíveis de uma reserva para o estacionamento, no "Ver taxas" do Operator (24/11/2026).
-- Spec: docs/specs/taxas-da-reserva.md
--
-- O modal de taxas da reserva nasceu só no Manager porque lê o rastro do gateway
-- (`payment_gateway_event`, RLS só de hub_admin). O estacionamento passa a abrir o mesmo modal na
-- reserva dele, e lê os recebíveis por esta RPC, restrita a quem tem finance:read na empresa da
-- reserva (Dono, Gerente, Financeiro) e a hub_admin. A tabela contratada ele já lê pela
-- `partner_fee_table`.
--
-- Devolve, por pagamento da reserva, só o último evento `payables` que trouxe recebível (a mesma
-- regra do Manager: uma releitura com erro não apaga a anterior). De cada recebível vão só os
-- campos que a conta usa. O recebedor sai como 'movepark' ou 'partner', nunca o id na Pagar.me, e
-- o resto do evento (requisição, cabeçalhos, ids do gateway) não sai. Sem permissão, ou reserva
-- que não existe, é 42501: a resposta não diz se a reserva existe.

create or replace function public.partner_booking_payables(p_booking_id uuid)
  returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_mp text := (select nullif(trim(value), '') from public.app_setting
                 where key = 'pagarme_movepark_recipient_id');
begin
  select l.company_id into v_company
    from public.booking b
    join public.location l on l.id = b.location_id
   where b.id = p_booking_id;

  if v_company is null
     or not (public.is_hub_admin() or public.member_has_scope(v_company, 'finance:read')) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'payment_id', ev.payment_id,
             'created_at', ev.created_at,
             'rows', ev.rows) order by ev.created_at)
      from (
        select distinct on (e.payment_id)
               e.payment_id,
               e.created_at,
               (select jsonb_agg(jsonb_build_object(
                         'recipient', case
                                        when x.r ->> 'recipient_id' is null then null
                                        when v_mp is not null and x.r ->> 'recipient_id' = v_mp then 'movepark'
                                        else 'partner' end,
                         'type', x.r -> 'type',
                         'amount', x.r -> 'amount',
                         'fee', x.r -> 'fee',
                         'anticipation_fee', x.r -> 'anticipation_fee',
                         'fraud_coverage_fee', x.r -> 'fraud_coverage_fee',
                         'installment', x.r -> 'installment',
                         'payment_date', x.r -> 'payment_date',
                         'original_payment_date', x.r -> 'original_payment_date'))
                  from jsonb_array_elements(e.response -> 'data') as x(r)) as rows
          from public.payment_gateway_event e
          join public.payment p on p.id = e.payment_id
         where p.booking_id = p_booking_id
           and e.kind = 'payables'
           and jsonb_typeof(e.response -> 'data') = 'array'
           and jsonb_array_length(e.response -> 'data') > 0
         order by e.payment_id, e.created_at desc
      ) ev), '[]'::jsonb);
end;
$$;

revoke all on function public.partner_booking_payables(uuid) from public, anon, authenticated;
grant execute on function public.partner_booking_payables(uuid) to authenticated;

comment on function public.partner_booking_payables(uuid) is
  'Recebíveis da reserva para o Ver taxas do Operator: último evento payables com recebível por pagamento, recebedor como movepark/partner. finance:read na empresa da reserva ou hub_admin. Spec: docs/specs/taxas-da-reserva.md';
