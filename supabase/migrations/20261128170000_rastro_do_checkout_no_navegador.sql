-- Rastro do checkout no navegador (06/10/2026). Spec: docs/specs/rastro-do-gateway.md.
--
-- O `payment_gateway_event` só via o que chegava à Pagar.me pela Edge. Duas classes de falha de
-- cartão ficavam invisíveis: (1) a tokenização, que vai do navegador DIRETO à Pagar.me e nunca
-- passa pelo backend; (2) as recusas da própria Edge antes do gateway (409 da trava de recebedor,
-- 422 de telefone/CPF), que só apareciam nos logs da Edge. Foi assim que o cartão ficou quebrado
-- de 23/09 a 05/10 sem ninguém ver: 14 tentativas em 409 e duas em 412 de telefone.
--
-- Esta RPC deixa o DONO da reserva gravar o que aconteceu no navegador, com kind `client:<etapa>`.
-- Nunca recebe dado de cartão (o front manda só bandeira, últimos 4, parcelas e o erro devolvido).
-- Guardas: só a própria reserva, kind por allowlist, detalhe limitado e teto de eventos por reserva
-- (uma aba aberta em loop não enche a tabela).

create or replace function public.log_checkout_event(
  p_booking_code text,
  p_kind text,
  p_http_status integer default null,
  p_detail jsonb default null
) returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_count integer;
begin
  if auth.uid() is null then
    return;
  end if;
  if p_kind not in (
    'client:card_attempt',
    'client:card_validation',
    'client:card_tokenize_failed',
    'client:card_charge_failed',
    'client:card_charge_ok',
    'client:pix_failed'
  ) then
    return;
  end if;

  select b.id into v_booking_id
    from public.booking b
   where b.code = p_booking_code and b.profile_id = auth.uid();
  if v_booking_id is null then
    return;
  end if;

  select count(*) into v_count
    from public.payment_gateway_event e
   where e.booking_id = v_booking_id and e.kind like 'client:%';
  if v_count >= 60 then
    return;
  end if;

  insert into public.payment_gateway_event (booking_id, provider, kind, http_status, request, note)
  values (
    v_booking_id,
    'pagarme',
    p_kind,
    p_http_status,
    case when p_detail is null or length(p_detail::text) > 4000 then null else p_detail end,
    left(p_detail ->> 'message', 500)
  );
end;
$$;
alter function public.log_checkout_event(text, text, integer, jsonb) owner to postgres;
revoke all on function public.log_checkout_event(text, text, integer, jsonb) from public, anon;
grant execute on function public.log_checkout_event(text, text, integer, jsonb) to authenticated, service_role;

comment on function public.log_checkout_event(text, text, integer, jsonb) is
  'O navegador do dono da reserva grava no rastro do gateway o que aconteceu no checkout (tokenização, recusa). Nunca dado de cartão.';

-- Funil do cartão por reserva, para a equipe: tentativas no navegador, onde morreram e o que a
-- Pagar.me respondeu. Só hub_admin lê (a view herda a RLS da tabela por security_invoker).
create or replace view public.checkout_card_funnel with (security_invoker = true) as
select
  b.code as booking_code,
  b.status as booking_status,
  e.created_at,
  e.kind,
  e.http_status,
  e.note,
  e.request
from public.payment_gateway_event e
join public.booking b on b.id = e.booking_id
where e.kind like 'client:%' or e.kind in ('charge_rejected', 'charge_failed', 'charge_created');
-- Objeto novo no schema public nasce com grant total para anon/authenticated (default privileges).
revoke all on public.checkout_card_funnel from anon, authenticated;
grant select on public.checkout_card_funnel to authenticated;
