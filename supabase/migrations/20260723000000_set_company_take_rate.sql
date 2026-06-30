-- Comissão da Movepark (take_rate) editável por empresa, server-authoritative.
-- A coluna company.take_rate_bps já existe (20260627000000); aqui só damos a ela uma
-- escrita gateada: apenas hub_admin pode alterar a comissão (ADR-005 — toda escrita tem
-- dono). Basis points: 1500 = 15%. Ver docs/specs/payment-split.md.

create or replace function public.set_company_take_rate(
  p_company_id uuid,
  p_take_rate_bps integer
) returns public.company
language plpgsql security definer set search_path to 'public' as $fn$
declare v_row public.company;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas administradores da Movepark podem alterar comissões.'
      using errcode = '42501';
  end if;
  if p_take_rate_bps is null or p_take_rate_bps < 0 or p_take_rate_bps > 10000 then
    raise exception 'Comissão inválida — informe um valor entre 0%% e 100%%.'
      using errcode = 'P0001';
  end if;

  update public.company
    set take_rate_bps = p_take_rate_bps
    where id = p_company_id and deleted_at is null
    returning * into v_row;

  if v_row.id is null then
    raise exception 'Empresa não encontrada.' using errcode = 'P0001';
  end if;

  return v_row;
end;
$fn$;

revoke all on function public.set_company_take_rate(uuid, integer) from public;
grant execute on function public.set_company_take_rate(uuid, integer) to authenticated;

comment on function public.set_company_take_rate(uuid, integer) is
  'Define a comissão da Movepark (take_rate_bps, 0..10000) de uma empresa. Só hub_admin.';
