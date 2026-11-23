-- Leitura de dinheiro de reserva e pagamento por escopo (finance:read), parte 1 de 2.
--
-- O QUE MEDI (23/11/2026). As policies `booking_select` e `payment_select` liberam toda linha da
-- empresa a qualquer membro, e `authenticated` tem SELECT na tabela inteira. Quem é papel Operação
-- (sem `finance:read`) lia `total_amount`, `price_breakdown`, `payment.amount`, `split`, taxa do
-- gateway, estorno e antecipação pelo PostgREST, mesmo com a tela escondendo. RLS escolhe linha,
-- não coluna, então não há policy que esconda só o dinheiro.
--
-- AS DUAS SAÍDAS. (A) tirar o SELECT das colunas de dinheiro de `authenticated` e servir TODO leitor
-- de dinheiro por RPC: quebra o checkout do cliente, a reserva do cliente, o Manager e todo
-- `select("*")`, cerca de 15 pontos do front, e `authenticated` é o mesmo papel do Postgres para o
-- cliente, o hub_admin e o Dono. (B) apertar a policy para `finance:read` e servir só o BALCÃO por
-- RPC definer: quebra só quem hoje não tem escopo financeiro (10 vínculos de Operação, 8 pessoas) e
-- deixa cliente, hub_admin, Dono, Gerente e Financeiro exatamente como estão. Escolhi (B).
--
-- ESTA PARTE é aditiva e segura de aplicar antes do front: cria os helpers e as RPCs do balcão
-- (nunca devolvem dinheiro) e passa `bookings_list_page`, `bookings_filter_options` e `admin_search`
-- para definer com a visibilidade escrita na própria função (antes a RLS fazia isso por elas, e a
-- parte 2 aperta a RLS). A PARTE 2 (`20261206140100`) aperta as policies e só entra depois que o
-- front que usa estas RPCs estiver no ar.

-- ── Quem a pessoa enxerga ───────────────────────────────────────────────────────────────────────

-- Empresas cuja reserva a pessoa lê (`bookings:read`; hub_admin: todas). Definer porque lê
-- `profile_company`/`company_role_scope`. Sem argumento: serve de InitPlan em policy e função.
create or replace function public.counter_company_ids()
returns uuid[]
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when public.is_hub_admin()
      then coalesce((select array_agg(c.id) from public.company c), '{}'::uuid[])
    else coalesce((
      select array_agg(x.id)
        from (select distinct public.current_company_ids() as id) x
       where public.member_has_scope(x.id, 'bookings:read')
    ), '{}'::uuid[])
  end
$$;

-- Empresas cujo DINHEIRO a pessoa lê (`finance:read`; hub_admin: todas). É o que a RLS de `booking`
-- e `payment` passa a usar (parte 2).
create or replace function public.finance_company_ids()
returns uuid[]
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when public.is_hub_admin()
      then coalesce((select array_agg(c.id) from public.company c), '{}'::uuid[])
    else coalesce((
      select array_agg(x.id)
        from (select distinct public.current_company_ids() as id) x
       where public.member_has_scope(x.id, 'finance:read')
    ), '{}'::uuid[])
  end
$$;

-- ── A reserva como o balcão a vê: a mesma forma do `select` do front, sem dinheiro ─────────────

-- Interna: monta o jsonb da reserva com as relações de `baseSelect` (location+company, vehicle,
-- payments, fare_extensions) e SEM as colunas de dinheiro (vão como null, para o formato não mudar).
-- `profile` vai null porque `profiles` já é de dono/hub_admin e o balcão nunca o leu.
-- O `payments` leva só o que o balcão usa (situação e forma), nunca valor.
-- `fare_extensions` fica como era: o excedente da proteção de voo é o que o balcão cobra.
-- Não confere visibilidade: quem chama (as RPCs abaixo) é quem confere.
create or replace function public.counter_booking_json(p_booking_id uuid, p_items boolean default false)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(b)
    || jsonb_build_object(
         'total_amount', null, 'price_breakdown', null, 'price_by_days', null,
         'fare_price_cents', null, 'commission_rule_id', null, 'commission_channel', null,
         'commission_take_rate_bps', null, 'commission_fee_payer', null,
         'commission_chargeback_bearer', null, 'commission_locked', null,
         'commission_installments_max', null, 'commission_installments_interest_free', null,
         'commission_anticipation_payer', null,
         'profile', null)
    || jsonb_build_object(
         'location', (
           select jsonb_build_object(
                    'id', l.id, 'name', l.name, 'slug', l.slug, 'timezone', l.timezone, 'address', l.address,
                    'company', jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug))
             from public.location l join public.company c on c.id = l.company_id
            where l.id = b.location_id),
         'vehicle', (
           select jsonb_build_object('id', v.id, 'license_plate', v.license_plate,
                                     'model', v.model, 'color', v.color)
             from public.vehicle v where v.id = b.vehicle_id),
         'payments', coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', p.id, 'status', p.status, 'refunded_at', p.refunded_at,
                    'created_at', p.created_at, 'paid_at', p.paid_at, 'method', p.method,
                    'installments', p.installments) order by p.created_at)
             from public.payment p where p.booking_id = b.id), '[]'::jsonb),
         'fare_extensions', coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', e.id, 'kind', e.kind, 'flight_number', e.flight_number,
                    'new_check_out_at', e.new_check_out_at,
                    'requested_check_out_at', e.requested_check_out_at,
                    'overage_daily_cents', e.overage_daily_cents, 'overage_cents', e.overage_cents,
                    'actual_check_out_at', e.actual_check_out_at,
                    'overage_charged_cents', e.overage_charged_cents,
                    'overage_note', e.overage_note,
                    'partner_credit_cents', e.partner_credit_cents) order by e.created_at)
             from public.booking_fare_extension e where e.booking_id = b.id), '[]'::jsonb))
    || case when p_items then jsonb_build_object('items', coalesce((
         select jsonb_agg(jsonb_build_object(
                  'item_type', i.item_type,
                  'parking_type', (select jsonb_build_object('name', pt.name)
                                     from public.parking_type pt where pt.id = i.parking_type_id))
                  order by i.created_at)
           from public.booking_item i where i.booking_id = b.id), '[]'::jsonb))
       else '{}'::jsonb end
  from public.booking b
 where b.id = p_booking_id
$$;

revoke all on function public.counter_booking_json(uuid, boolean) from public, anon, authenticated;
grant execute on function public.counter_booking_json(uuid, boolean) to service_role;

-- ── RPCs do balcão (definer, escopo conferido por dentro, nunca devolvem dinheiro) ──────────────

-- Reservas pelos ids (a hidratação da lista: `bookings_list_page` devolve só os ids).
create or replace function public.operator_bookings_by_ids(p_ids uuid[])
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sem permissão para ver reservas' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.counter_booking_json(x.id) order by x.created_at desc, x.id)
      from (
        select b.id, b.created_at
          from public.booking b
          join public.location l on l.id = b.location_id
         where b.id = any (coalesce(p_ids, '{}'::uuid[]))
           and l.company_id = any (public.counter_company_ids())
      ) x
  ), '[]'::jsonb);
end $$;

-- Uma reserva pelo código (detalhe, voucher). `p_only_active` repete o `deleted_at is null` do
-- voucher; `p_items` traz os itens (tipo de vaga) que o voucher mostra. Nulo se não for visível.
create or replace function public.operator_booking_by_code(
  p_code text, p_only_active boolean default false, p_items boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sem permissão para ver reservas' using errcode = '42501';
  end if;
  select b.id into v_id
    from public.booking b
    join public.location l on l.id = b.location_id
   where b.code = p_code
     and l.company_id = any (public.counter_company_ids())
     and (not p_only_active or b.deleted_at is null)
   limit 1;
  if v_id is null then
    return null;
  end if;
  return public.counter_booking_json(v_id, p_items);
end $$;

-- Agenda do dia: quem chega ou sai na janela [p_from, p_to), só os status pedidos, até 200.
create or replace function public.operator_day_agenda(
  p_from timestamptz, p_to timestamptz, p_location_ids uuid[] default null,
  p_statuses text[] default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sem permissão para ver reservas' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.counter_booking_json(x.id) order by x.check_in_at, x.id)
      from (
        select b.id, b.check_in_at
          from public.booking b
          join public.location l on l.id = b.location_id
         where l.company_id = any (public.counter_company_ids())
           and ((b.check_in_at >= p_from and b.check_in_at < p_to)
                or (b.check_out_at >= p_from and b.check_out_at < p_to))
           and (p_statuses is null or b.status::text = any (p_statuses))
           and (p_location_ids is null or b.location_id = any (p_location_ids))
         order by b.check_in_at, b.id
         limit 200
      ) x
  ), '[]'::jsonb);
end $$;

-- Fatos de reserva para contar (dashboard, funil, o que vem aí): datas, status e canal, sem valor.
-- Recorta por check-in em [p_from, p_to) (ou até p_to inclusive). Não filtra `deleted_at`, como o
-- funil de antes (a reserva expirada entra na conta de conversão).
create or replace function public.operator_booking_facts(
  p_from timestamptz, p_to timestamptz default null, p_location_ids uuid[] default null,
  p_statuses text[] default null, p_to_inclusive boolean default false)
returns table (
  check_in_at timestamptz, check_out_at timestamptz, created_at timestamptz,
  status text, created_via_api_key_id uuid, location_id uuid)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Sem permissão para ver reservas' using errcode = '42501';
  end if;
  return query
    select b.check_in_at, b.check_out_at, b.created_at, b.status::text,
           b.created_via_api_key_id, b.location_id
      from public.booking b
      join public.location l on l.id = b.location_id
     where l.company_id = any (public.counter_company_ids())
       and b.check_in_at >= p_from
       and (p_to is null
            or (p_to_inclusive and b.check_in_at <= p_to)
            or (not p_to_inclusive and b.check_in_at < p_to))
       and (p_statuses is null or b.status::text = any (p_statuses))
       and (p_location_ids is null or b.location_id = any (p_location_ids));
end $$;

-- Marcar a reserva (confirmar, check-in, check-out, não compareceu, notas) sem ler a reserva. A
-- escrita direta pela API deixa de servir ao balcão porque o UPDATE com `where` também passa pela
-- policy de SELECT (parte 2). Mesmo escopo que o gatilho `booking_guard_write_allowlist` exigia
-- (`bookings:write` ou `bookings:checkin`) e as mesmas quatro colunas: status, os dois carimbos e
-- as notas. `p_set_notes` distingue "não mexer" de "limpar".
create or replace function public.operator_set_booking_status(
  p_booking_id uuid, p_status text, p_checked_in_at timestamptz default null,
  p_checked_out_at timestamptz default null, p_notes text default null,
  p_set_notes boolean default false)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_company uuid;
begin
  select l.company_id into v_company
    from public.booking b join public.location l on l.id = b.location_id
   where b.id = p_booking_id;
  if v_company is null then
    raise exception 'Reserva não encontrada' using errcode = 'P0002';
  end if;
  if auth.uid() is null
     or not (public.member_has_scope(v_company, 'bookings:write')
             or public.member_has_scope(v_company, 'bookings:checkin')) then
    raise exception 'Sem permissão para marcar esta reserva' using errcode = '42501';
  end if;
  update public.booking
     set status = p_status::public.booking_status,
         checked_in_at = coalesce(p_checked_in_at, checked_in_at),
         checked_out_at = coalesce(p_checked_out_at, checked_out_at),
         notes = case when p_set_notes then p_notes else notes end
   where id = p_booking_id;
end $$;

-- Conferência de acesso para a Edge `voucher-pdf`: o balcão não lê mais a reserva pela API, então a
-- Edge pergunta aqui se a pessoa pode abrir este código e só então lê com a service role.
create or replace function public.counter_can_open_booking(p_code text)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select auth.uid() is not null and exists (
    select 1 from public.booking b join public.location l on l.id = b.location_id
     where b.code = p_code and l.company_id = any (public.counter_company_ids()))
$$;

-- ── Grants: as RPCs só para quem está logado ────────────────────────────────────────────────────

revoke all on function public.operator_bookings_by_ids(uuid[]) from public, anon;
revoke all on function public.operator_booking_by_code(text, boolean, boolean) from public, anon;
revoke all on function public.operator_day_agenda(timestamptz, timestamptz, uuid[], text[]) from public, anon;
revoke all on function public.operator_booking_facts(timestamptz, timestamptz, uuid[], text[], boolean) from public, anon;
revoke all on function public.operator_set_booking_status(uuid, text, timestamptz, timestamptz, text, boolean) from public, anon;
revoke all on function public.counter_can_open_booking(text) from public, anon;
revoke all on function public.counter_company_ids() from public, anon;
grant execute on function public.operator_bookings_by_ids(uuid[]) to authenticated, service_role;
grant execute on function public.operator_booking_by_code(text, boolean, boolean) to authenticated, service_role;
grant execute on function public.operator_day_agenda(timestamptz, timestamptz, uuid[], text[]) to authenticated, service_role;
grant execute on function public.operator_booking_facts(timestamptz, timestamptz, uuid[], text[], boolean) to authenticated, service_role;
grant execute on function public.operator_set_booking_status(uuid, text, timestamptz, timestamptz, text, boolean) to authenticated, service_role;
grant execute on function public.counter_can_open_booking(text) to authenticated, service_role;
grant execute on function public.counter_company_ids() to authenticated, service_role;
-- `finance_company_ids` é chamada pelas policies de `booking` e `payment`, que a parte 2 deixa
-- `TO authenticated`: anon não avalia a policy, então não ganha EXECUTE (a lista de definer
-- alcançáveis por anon, em definer_grants_inventory, não muda).
revoke all on function public.finance_company_ids() from public, anon;
grant execute on function public.finance_company_ids() to authenticated, service_role;

-- ── As funções que liam booking pela RLS do usuário passam a ter a visibilidade escrita ─────────
-- (a parte 2 aperta a RLS; sem isto a lista, as opções de filtro e a busca do balcão ficariam vazias)


-- Mesmo corpo de antes, mais SECURITY DEFINER e a visibilidade escrita (ver cada comentário).

CREATE OR REPLACE FUNCTION public.bookings_list_page(p_source text DEFAULT 'all'::text, p_statuses text[] DEFAULT NULL::text[], p_location_ids uuid[] DEFAULT NULL::uuid[], p_company_ids uuid[] DEFAULT NULL::uuid[], p_date_field text DEFAULT 'check_in_at'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_search text DEFAULT NULL::text, p_payment text DEFAULT NULL::text, p_channel_origins text[] DEFAULT NULL::text[], p_partner_view boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_with_summary boolean DEFAULT true, p_attendance text DEFAULT NULL::text, p_pcd boolean DEFAULT NULL::boolean, p_add_on text DEFAULT NULL::text, p_affiliated boolean DEFAULT NULL::boolean, p_utm_source text DEFAULT NULL::text, p_plate_changed boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  v_busca text := nullif(btrim(regexp_replace(coalesce(p_search, ''), '[%_\\]', ' ', 'g')), '');
  v_placa text := nullif(regexp_replace(upper(coalesce(p_search, '')), '[^A-Z0-9]', '', 'g'), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_hub boolean := coalesce(p_source, 'all') in ('all', 'hub');
  -- Forma de pagamento e canal são dados do Hub; com eles ligados, o site sai da lista.
  -- Canal é dado só do Hub: com ele ligado o site sai. A forma de pagamento vale para os dois
  -- desde 13/10/2026 (no site, pelo código da forma de pagamento do pedido).
  v_wl boolean := coalesce(p_source, 'all') in ('all', 'wl') and p_channel_origins is null;
  -- Empresas com site visíveis para quem chama, uma vez (a RLS repete a regra; aqui é para o
  -- planner usar o índice por empresa em vez de varrer a tabela).
  v_wl_companies uuid[] := public.wl_visible_company_ids();
  -- A função roda como dono para o balcão não depender de ler booking/payment pela RLS (a RLS passa
  -- a exigir finance:read para o dinheiro). A visibilidade é escrita aqui: hub_admin, a própria
  -- reserva e as empresas em que a pessoa tem bookings:read. O dinheiro do resumo e do site
  -- (total_cents, paid_total_cents) só sai das empresas em que ela tem finance:read.
  v_admin boolean := public.is_hub_admin();
  v_me uuid := auth.uid();
  v_visiveis uuid[] := public.counter_company_ids();
  v_dinheiro uuid[] := public.finance_company_ids();
  -- Pedidos do site que batem com a busca, achados antes pelo índice trigram (ver abaixo).
  v_wl_ids uuid[];
  v_result jsonb;
  -- Fonte da campanha comparada sem caixa: o site grava "Google" e "google".
  v_utm text := nullif(lower(btrim(coalesce(p_utm_source, ''))), '');
  v_add_on text := nullif(btrim(coalesce(p_add_on, '')), '');
begin
  if v_wl and v_busca is not null then
    v_wl_ids := public.wl_booking_search_ids(v_busca, v_placa);
  end if;

  with
  hub as (
    select b.id, b.created_at as sort_at, b.status::text as status, b.total_amount, l.company_id,
           lp.status as pay_status, lp.method as pay_method, lp.refunded_at as pay_refunded_at
      from public.booking b
      join public.location l on l.id = b.location_id
      left join lateral (
        select p.status::text as status, p.method::text as method, p.refunded_at
          from public.payment p where p.booking_id = b.id
         order by p.created_at desc limit 1
      ) lp on true
     where v_hub
       and (v_admin or b.profile_id = v_me or l.company_id = any (v_visiveis))
       and (p_statuses is null or b.status::text = any (p_statuses))
       and (p_location_ids is null or b.location_id = any (p_location_ids))
       and (p_company_ids is null or l.company_id = any (p_company_ids))
       and (p_from is null or (case when p_date_field = 'created_at' then b.created_at else b.check_in_at end) >= p_from)
       and (p_to is null or (case when p_date_field = 'created_at' then b.created_at else b.check_in_at end) <= p_to)
       and (v_busca is null
            or b.code ilike '%' || v_busca || '%'
            or b.customer_name ilike '%' || v_busca || '%'
            or b.customer_email ilike '%' || v_busca || '%'
            or b.customer_phone ilike '%' || v_busca || '%'
            -- Placa atual, placa anterior (troca registrada) e modelo do veículo (13/10/2026).
            or exists (select 1 from public.vehicle v where v.id = b.vehicle_id
                        and (public.wl_plate_key(v.license_plate) like '%' || v_placa || '%'
                             or v.model ilike '%' || v_busca || '%'))
            or exists (select 1 from public.booking_modification m
                        where m.booking_id = b.id and m.type = 'vehicle_change'
                          and public.wl_plate_key(m.changes->'from'->>'license_plate') like '%' || v_placa || '%'))
       and (p_channel_origins is null or b.origin = any (p_channel_origins))
       and (p_payment is null
            or (p_payment in ('pix', 'card') and exists (
                  select 1 from public.payment p where p.booking_id = b.id and p.method::text = p_payment))
            or (p_payment = 'none' and not exists (select 1 from public.payment p where p.booking_id = b.id)))
       -- Comparecimento no vocabulário do site: compareceu = carro entrou; no_show; pendente = paga
       -- e ainda sem entrada.
       and (p_attendance is null
            or (p_attendance = 'compareceu' and b.checked_in_at is not null)
            or (p_attendance = 'no_show' and b.status::text = 'no_show')
            or (p_attendance = 'pendente' and b.status::text = 'confirmed' and b.checked_in_at is null))
       and (p_pcd is null or coalesce(b.has_pcd, false) = p_pcd)
       -- Adicional: 'any' = qualquer um, 'none' = nenhum, senão o nome do serviço (14/10/2026).
       and (v_add_on is null
            or (v_add_on = 'any' and exists (
                  select 1 from public.booking_item i where i.booking_id = b.id and i.item_type = 'add_on'))
            or (v_add_on = 'none' and not exists (
                  select 1 from public.booking_item i where i.booking_id = b.id and i.item_type = 'add_on'))
            or (v_add_on not in ('any', 'none') and exists (
                  select 1 from public.booking_item i join public.add_on_service s on s.id = i.add_on_service_id
                   where i.booking_id = b.id and i.item_type = 'add_on' and s.name = v_add_on)))
       -- O Hub não tem programa de afiliado: "afiliado = sim" deixa só o site.
       and (p_affiliated is null or p_affiliated = false)
       and (v_utm is null or lower(b.utm_source) = v_utm)
       and (p_plate_changed is null
            or p_plate_changed = exists (
                 select 1 from public.booking_modification m
                  where m.booking_id = b.id and m.type = 'vehicle_change'))
       -- Mesma regra de `partnerSeesBooking`: o estacionamento só vê reserva que virou venda.
       and (not p_partner_view
            or b.status::text in ('confirmed', 'checked_in', 'completed', 'no_show')
            or (b.status::text = 'cancelled' and exists (
                  select 1 from public.payment p where p.booking_id = b.id and p.status::text in ('paid', 'refunded'))))
  ),
  -- Só as colunas que a lista usa: `w.*` arrastava os jsonb da ficha (itens, campanha, veículo)
  -- pelas 11 mil linhas de um mês. A linha da página é montada depois, pela chave.
  wl as (
    -- O status no vocabulário do Hub vai escrito aqui, igual a `wl_booking_hub_status`: a função
    -- tem SET search_path, não é embutida pelo planner e custava 1,2 s nas 133 mil linhas.
    select w.id, w.company_id, w.status, w.paid_total_cents,
           case
             when w.status = 'confirmed' and w.attendance_status = 'no_show' then 'no_show'
             when w.status = 'confirmed' and w.attendance_status = 'compareceu'
               then case when w.check_out_at is not null and w.check_out_at > now() then 'checked_in' else 'completed' end
             when w.status = 'confirmed' then 'confirmed'
             when w.status in ('cancelled', 'refunded', 'refund_requested') then 'cancelled'
             when w.status = 'expired' then 'expired'
             else 'pending'
           end as hub_status,
           w.wl_created_at as sort_at
      from public.wl_booking w
     where v_wl
       and w.company_id = any (v_wl_companies)
       and (p_location_ids is null
            or w.location_id = any (p_location_ids)
            or (w.location_id is null
                and w.company_id in (select l.company_id from public.location l where l.id = any (p_location_ids))))
       and (p_company_ids is null or w.company_id = any (p_company_ids))
       -- Data direto na coluna, para os índices (company_id, wl_created_at) e (company_id,
       -- check_in_at) valerem; dentro de um CASE o Postgres varria a tabela.
       and (p_from is null
            or (p_date_field = 'created_at' and w.wl_created_at >= p_from)
            or (p_date_field <> 'created_at' and w.check_in_at >= p_from))
       and (p_to is null
            or (p_date_field = 'created_at' and w.wl_created_at <= p_to)
            or (p_date_field <> 'created_at' and w.check_in_at <= p_to))
       and (v_wl_ids is null or w.id = any (v_wl_ids))
       and (p_payment is null
            or (p_payment = 'pix' and w.payment_method_code ilike '%pix%')
            or (p_payment = 'card' and w.payment_method_code ilike '%creditcard%')
            or (p_payment = 'none' and w.payment_method_code is null))
       and (p_attendance is null
            or (p_attendance = 'pendente' and coalesce(w.attendance_status, 'pendente') = 'pendente'
                and w.status = 'confirmed')
            or (p_attendance <> 'pendente' and w.attendance_status = p_attendance))
       and (p_pcd is null or w.has_pcd = p_pcd)
       -- Adicional: item do pedido que não é a vaga (`is_spot = false`).
       and (v_add_on is null
            or (v_add_on = 'any' and w.items @> '[{"is_spot": false}]'::jsonb)
            or (v_add_on = 'none' and not coalesce(w.items @> '[{"is_spot": false}]'::jsonb, false))
            or (v_add_on not in ('any', 'none')
                and w.items @> jsonb_build_array(jsonb_build_object('is_spot', false, 'product_name', v_add_on))))
       and (p_affiliated is null or coalesce(w.is_affiliated, false) = p_affiliated)
       and (v_utm is null or lower(w.utm->>'utm_source') = v_utm)
       and (p_plate_changed is null
            or p_plate_changed = exists (
                 select 1 from public.wl_booking_event e
                  where e.wl_booking_id = w.id and e.kind = 'plate_change'))
       -- Visão do estacionamento: só pedido pago (pendente, expirado e o cancelado antes de pagar
       -- não são venda; o reembolso é, porque o dinheiro entrou).
       and (not p_partner_view or w.status in ('confirmed', 'refund_requested', 'refunded'))
  ),
  wl_f as (
    select * from wl where p_statuses is null or hub_status = any (p_statuses)
  ),
  u as (
    select 'hub'::text as source, h.id, h.sort_at from hub h
    union all
    select 'wl'::text, w.id, w.sort_at from wl_f w
  ),
  pagina as (
    select * from u order by sort_at desc nulls last, id desc limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from u),
    'items', coalesce((
      select jsonb_agg(
        case when pg.source = 'hub' then jsonb_build_object('source', 'hub', 'id', pg.id)
        else jsonb_build_object(
          'source', 'wl', 'id', pg.id,
          'wl', (select jsonb_build_object(
                   'id', w.id, 'company_id', w.company_id, 'company_name', c.name,
                   'wl_order_number', w.wl_order_number, 'wl_created_at', w.wl_created_at,
                   'origin', w.origin, 'status', public.wl_booking_hub_status(w.status, w.attendance_status, w.check_out_at), 'wl_status', w.wl_status,
                   'site_status', w.status, 'payment_method_name', w.payment_method_name, 'attendance_marked_at', w.attendance_marked_at,
                   'location_parking_type_id', w.location_parking_type_id,
                   'attendance_status', w.attendance_status,
                   'customer_name', w.customer_name, 'customer_email', w.customer_email,
                   'customer_phone', w.customer_phone, 'license_plate', w.license_plate,
                   'check_in_at', w.check_in_at, 'check_out_at', w.check_out_at,
                   'passenger_count', w.passenger_count, 'has_pcd', w.has_pcd,
                   'total_cents', case when v_admin or w.company_id = any (v_dinheiro) then w.total_cents end,
                   'paid_total_cents', case when v_admin or w.company_id = any (v_dinheiro) then w.paid_total_cents end,
                   'location_id', w.location_id, 'location_name', l.name,
                   'parking_type_name', pt.name, 'category_slug', w.category_slug,
                   'product_slug', w.product_slug, 'synced_at', w.synced_at)
                 from public.wl_booking w
                 join public.company c on c.id = w.company_id
                 left join public.location l on l.id = w.location_id
                 left join public.location_parking_type lpt on lpt.id = w.location_parking_type_id
                 left join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
                 left join public.parking_type pt on pt.id = cpt.parking_type_id
                where w.id = pg.id))
        end
        order by pg.sort_at desc nulls last, pg.id desc)
      from pagina pg), '[]'::jsonb),
    -- Números do recorte inteiro (não só da página), separados por origem. Só quando pedido: o
    -- resumo não muda de uma página para outra, e o front o pede uma vez por recorte.
    'summary', case when not p_with_summary then null else jsonb_build_object(
      'hub', (select jsonb_build_object(
                'total', count(*),
                'paid', count(*) filter (where pay_status in ('paid', 'refunded')),
                'pix', count(*) filter (where pay_status in ('paid', 'refunded') and pay_method = 'pix'),
                'card', count(*) filter (where pay_status in ('paid', 'refunded') and pay_method = 'card'),
                'paid_amount', coalesce(sum(total_amount) filter (where pay_status = 'paid' and pay_refunded_at is null
                                                                and (v_admin or company_id = any (v_dinheiro))), 0),
                'awaiting', count(*) filter (where coalesce(pay_status, '') not in ('paid', 'refunded') and status = 'pending'),
                'lost', count(*) filter (where coalesce(pay_status, '') not in ('paid', 'refunded')
                                          and (status = 'expired' or pay_status = 'failed')))
              from hub),
      'wl', (select jsonb_build_object(
               'total', count(*),
               'paid', count(*) filter (where status in ('confirmed', 'refund_requested', 'refunded')),
               'paid_amount', coalesce(sum(paid_total_cents) filter (where status = 'confirmed'
                                                                   and (v_admin or company_id = any (v_dinheiro))), 0) / 100.0)
             from wl_f)
    ) end
  ) into v_result;

  return v_result;
end $function$
;

CREATE OR REPLACE FUNCTION public.bookings_filter_options(p_company_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with
  wl as (
    select w.items, w.utm
      from public.wl_booking w
     where w.company_id = any (public.wl_visible_company_ids())
       and (p_company_ids is null or w.company_id = any (p_company_ids))
       -- Último ano: adicional e campanha que ninguém usa há um ano só poluem o select.
       and w.wl_created_at >= now() - interval '1 year'
  ),
  hub as (
    select b.id, b.utm_source
      from public.booking b
      join public.location l on l.id = b.location_id
     where b.deleted_at is null
       and l.company_id = any (public.counter_company_ids())
       and (p_company_ids is null or l.company_id = any (p_company_ids))
       and b.created_at >= now() - interval '1 year'
  ),
  add_ons as (
    select btrim(it->>'product_name') as name, count(*) as n
      from wl, jsonb_array_elements(wl.items) it
     where (it->>'is_spot')::boolean is false and nullif(btrim(it->>'product_name'), '') is not null
     group by 1
    union all
    select s.name, count(*)
      from hub h
      join public.booking_item i on i.booking_id = h.id and i.item_type = 'add_on'
      join public.add_on_service s on s.id = i.add_on_service_id
     group by 1
  ),
  fontes as (
    select lower(btrim(wl.utm->>'utm_source')) as source, count(*) as n
      from wl where nullif(btrim(wl.utm->>'utm_source'), '') is not null group by 1
    union all
    select lower(btrim(h.utm_source)), count(*)
      from hub h where nullif(btrim(h.utm_source), '') is not null group by 1
  )
  select jsonb_build_object(
    'add_ons', coalesce((
      select jsonb_agg(x.name order by x.n desc, x.name)
        from (select name, sum(n) as n from add_ons group by name) x), '[]'::jsonb),
    -- As 40 fontes que mais venderam; a cauda é de link único e só polui o select.
    'utm_sources', coalesce((
      select jsonb_agg(x.source order by x.n desc, x.source)
        from (select source, sum(n) as n from fontes group by source order by 2 desc, 1 limit 40) x), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.admin_search(p_query text, p_limit integer DEFAULT 5)
 RETURNS TABLE(kind text, id uuid, title text, subtitle text, company_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with args as (
    select
      '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as term,
      length(btrim(coalesce(p_query, ''))) as term_len,
      greatest(1, least(coalesce(p_limit, 5), 20)) as lim,
      is_hub_admin() as admin
  ),
  escopo as (select array(select current_company_ids()) as company_ids)
  (
    select 'booking'::text, b.id, b.code,
           coalesce(nullif(btrim(b.customer_name), ''), b.customer_email, 'Sem contato'),
           l.company_id
    from booking b
    join location l on l.id = b.location_id
    cross join args, escopo
    where args.term_len >= 2
      and b.deleted_at is null
      and (args.admin or l.company_id = any(escopo.company_ids))
      and (b.code ilike args.term
           or b.customer_name ilike args.term
           or b.customer_email ilike args.term)
    order by b.check_in_at desc nulls last
    limit (select lim from args)
  )
  union all
  (
    select 'location'::text, l.id, l.name, coalesce(l.address, 'Sem endereço'), l.company_id
    from location l
    cross join args, escopo
    where args.term_len >= 2
      and l.deleted_at is null
      and (args.admin or l.company_id = any(escopo.company_ids))
      and (l.name ilike args.term or l.address ilike args.term)
    order by l.name
    limit (select lim from args)
  )
  union all
  (
    select 'coupon'::text, c.id, c.code,
           case when c.is_active then 'Ativo' else 'Inativo' end,
           c.company_id
    from coupon c
    cross join args, escopo
    where args.term_len >= 2
      and (args.admin or c.company_id = any(escopo.company_ids))
      and c.code ilike args.term
    order by c.code
    limit (select lim from args)
  );
$function$
;

-- A assinatura não mudou: os grants de antes continuam valendo; só garantimos que anon não chama.
revoke all on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer, boolean, text, boolean, text, boolean, text, boolean) from public, anon;
revoke all on function public.bookings_filter_options(uuid[]) from public, anon;
revoke all on function public.admin_search(text, integer) from public, anon;
grant execute on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer, boolean, text, boolean, text, boolean, text, boolean) to authenticated, service_role;
grant execute on function public.bookings_filter_options(uuid[]) to authenticated, service_role;
grant execute on function public.admin_search(text, integer) to authenticated, service_role;
