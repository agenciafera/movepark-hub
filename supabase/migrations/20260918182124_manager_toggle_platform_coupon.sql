-- E3.3. Liga e desliga campanha de plataforma sem abrir o formulário.
--
-- Existe separada do upsert porque pausar campanha é o gesto urgente: quando uma promoção sai mais
-- cara que o previsto, ninguém quer reenviar 18 campos para mudar um booleano, e um upsert parcial
-- com campo faltando apagaria configuração.
--
-- Não há delete de cupom de plataforma por desenho: `booking_coupon` referencia `coupon` com
-- ON DELETE RESTRICT, então cupom já usado não sai mesmo, e cupom não usado desativado não atrapalha
-- ninguém. Desativar preserva o histórico do que foi oferecido.
create or replace function public.manager_set_platform_coupon_active(
  p_coupon_id uuid, p_is_active boolean)
returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark gerencia cupom de plataforma.' using errcode = '42501';
  end if;

  update public.coupon
  set is_active = coalesce(p_is_active, false)
  where id = p_coupon_id and company_id is null;

  if not found then
    raise exception 'Cupom de plataforma não encontrado.' using errcode = 'P0001';
  end if;
end; $fn$;

comment on function public.manager_set_platform_coupon_active(uuid, boolean) is
  'Pausa ou retoma uma campanha da Movepark. Restrito a company_id is null: a RPC não pode virar '
  'atalho para mexer no cupom de um parceiro.';

revoke all on function public.manager_set_platform_coupon_active(uuid, boolean) from public, anon;
grant execute on function public.manager_set_platform_coupon_active(uuid, boolean)
  to authenticated, service_role;
