-- Leitura de dinheiro de reserva e pagamento por escopo (finance:read), parte 2 de 2.
-- Contexto, medição e a escolha entre as duas saídas: ver a parte 1
-- (20261206140000_leitura_dinheiro_rpcs_do_balcao.sql).
--
-- ANTES: `booking_select` e `payment_select` liberavam toda linha da empresa a qualquer membro
-- (`current_company_ids()`), e `authenticated` lê a tabela inteira. Operação lia total, price_breakdown,
-- split, taxa do gateway, estorno e antecipação direto pela API.
--
-- DEPOIS: o membro só lê a linha se tiver `finance:read` na empresa da unidade (Dono, Gerente e
-- Financeiro; hub_admin sempre). Operação perde a leitura da tabela e passa pelas RPCs do balcão
-- (`operator_*`, parte 1), que nunca devolvem valor. O dono da reserva (cliente) e o hub_admin
-- seguem como estavam, por isso o checkout, a conta do cliente e o Manager não mudam.
--
-- Só entra no ar DEPOIS do front que usa as RPCs (senão o balcão em produção lê vazio).
--
-- `TO authenticated` (era `TO public`): anon nunca leu reserva (não é dono nem membro), e assim a
-- policy não avalia `finance_company_ids()` para anon, que não precisa de EXECUTE nela.
-- ALTER POLICY troca de uma vez, sem janela sem policy. O `::uuid[]` é necessário: sem ele o
-- Postgres lê `any ((select ...))` como subconsulta de linhas e compara uuid com uuid[].

alter policy booking_select on public.booking
  to authenticated
  using (
    public.is_hub_admin()
    or profile_id = auth.uid()
    or location_id in (
      select l.id
        from public.location l
       where l.company_id = any (((select public.finance_company_ids()))::uuid[])
    )
  );

alter policy payment_select on public.payment
  to authenticated
  using (
    booking_id in (
      select b.id
        from public.booking b
       where public.is_hub_admin()
          or b.profile_id = auth.uid()
          or b.location_id in (
            select l.id
              from public.location l
             where l.company_id = any (((select public.finance_company_ids()))::uuid[])
          )
    )
  );

comment on policy booking_select on public.booking is
  'Hub_admin, o dono da reserva ou o membro com finance:read na empresa da unidade. O balcão (Operação) lê pelas RPCs operator_*, sem valor (20261206140100).';
comment on policy payment_select on public.payment is
  'Mesma regra de booking_select: pagamento tem valor, split e taxa, então só finance:read na empresa, o dono da reserva ou hub_admin (20261206140100).';

-- A policy de `vehicle` (14/10/2026, "o parceiro lê o veículo das reservas da empresa") consultava
-- `booking` pela RLS do chamador. Com `booking_select` atrás de finance:read, a Operação deixaria de
-- ler a placa que o balcão precisa, e placa não é dinheiro. O ajudante abaixo olha a reserva como
-- dono, só para dizer se o veículo é de uma reserva da empresa da pessoa (mesma regra de antes:
-- qualquer vínculo com a empresa), e a policy passa a chamá-lo. `vehicle_select` é `TO authenticated`,
-- então o ajudante não precisa de EXECUTE para anon.
create or replace function public.counter_can_see_vehicle(p_vehicle_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
      from public.booking b
      join public.location l on l.id = b.location_id
     where b.vehicle_id = p_vehicle_id
       and l.company_id in (select public.current_company_ids())
  )
$$;

revoke all on function public.counter_can_see_vehicle(uuid) from public, anon;
grant execute on function public.counter_can_see_vehicle(uuid) to authenticated, service_role;

alter policy vehicle_select on public.vehicle
  using (
    profile_id = (select auth.uid())
    or (select public.is_hub_admin())
    or public.counter_can_see_vehicle(id)
  );

-- `booking_item`, `booking_discount`, `booking_modification` e `booking_fare_extension` também
-- consultam `booking` pela RLS e passam a acompanhá-la (finance:read): têm valor (preço do item,
-- desconto, diferença de troca de datas), então ficam como estão. O balcão recebe o que precisa
-- (itens do voucher, o excedente da proteção de voo) pelas RPCs `operator_*`.
