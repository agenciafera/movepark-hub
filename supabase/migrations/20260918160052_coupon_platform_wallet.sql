-- E3.3. Área de descontos do cliente: cupom de plataforma, carteira e aplicação no checkout.
--
-- Contexto: o motor de cupom (20260611000000_coupon_engine) já resolve código digitado, janela,
-- limite por usuário e restrição por tipo de vaga. Falta o que transforma isso numa ÁREA DE
-- DESCONTOS como a do iFood/99: cupom que a Movepark oferece na rede inteira, uma carteira onde
-- ele aparece sem o cliente digitar nada, e a escolha na hora de pagar.
--
-- O que esta migration muda e por quê:
--
--   1. `coupon.company_id` passa a aceitar NULL = cupom da MOVEPARK, válido em qualquer unidade
--      que feche a reserva no Hub. Sem isso não existe campanha de rede ("30% na primeira
--      reserva"), só promoção de um parceiro. Colisão de código é resolvida por precedência: o
--      cupom da empresa vence o da plataforma, porque é o mais específico.
--
--   2. `funded_by` diz QUEM banca o desconto. Decisão do negócio: a Movepark banca a campanha
--      dela. O parceiro recebe o mesmo repasse que receberia sem o cupom e o desconto sai da
--      comissão. A conta mora no `buildSplit` (Edge); aqui só gravamos o dado, e o
--      `price_breakdown` o carrega até a cobrança.
--
--   3. `max_discount_amount` é o teto do percentual, o "Até R$ 40 OFF" da referência. Sem teto,
--      30% numa estadia de 20 diárias consome a comissão inteira, e com `funded_by='platform'`
--      é a Movepark que paga a diferença. O teto é o que impede a campanha de sangrar.
--
--   4. `audience` é a regra que faz o cupom aparecer na carteira sem digitar código. Ela é
--      DETERMINÍSTICA (contagem de reservas, dias parado), e não segmento de RFM: o RFM é quintil
--      sobre a própria base (ver docs/specs/marketing-rfm.md) e, com a base de hoje, alguém seria
--      "campeão" por ser o melhor entre um. Quando a base passar dos 25 clientes com compra que a
--      spec fixa como piso, segmento de RFM entra como audiência nova sem tocar em nada disto.
--
-- Ver docs/specs/coupon-wallet.md.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.coupon_funding as enum ('platform', 'company');
exception when duplicate_object then null; end $$;

comment on type public.coupon_funding is
  'Quem absorve o desconto no repasse: platform = sai da comissão da Movepark (o parceiro recebe '
  'como se não houvesse cupom); company = reduz a base, comissão e repasse caem juntos.';

do $$ begin
  create type public.coupon_audience as enum (
    'code_only',        -- só por código digitado; nunca aparece sozinho na carteira
    'public',           -- qualquer cliente logado vê
    'first_purchase',   -- nenhuma reserva paga ainda
    'second_purchase',  -- exatamente uma reserva paga
    'winback'           -- tem reserva paga e passou de `audience_inactive_days` sem voltar
  );
exception when duplicate_object then null; end $$;

comment on type public.coupon_audience is
  'Regra determinística que faz o cupom aparecer na carteira do cliente. Não usa RFM de propósito: '
  'o score é quintil sobre a base e não se sustenta abaixo de 25 clientes com compra.';

-- ---------------------------------------------------------------------------
-- 2. Colunas novas em `coupon`
-- ---------------------------------------------------------------------------

alter table public.coupon
  alter column company_id drop not null;

comment on column public.coupon.company_id is
  'Empresa dona do cupom. NULL = cupom de plataforma (Movepark), válido em qualquer unidade que '
  'feche a reserva no Hub. Na busca por código, o cupom da empresa tem precedência sobre o de '
  'plataforma com o mesmo código.';

alter table public.coupon
  add column if not exists max_discount_amount numeric(12,2),
  add column if not exists funded_by public.coupon_funding not null default 'company',
  add column if not exists audience public.coupon_audience not null default 'code_only',
  add column if not exists audience_inactive_days integer,
  add column if not exists title text,
  add column if not exists terms text;

comment on column public.coupon.max_discount_amount is
  'Teto do desconto em reais. Só faz sentido com discount_type = percent. É o "Até R$ 40 OFF".';
comment on column public.coupon.title is
  'Rótulo que o cliente lê na carteira ("Primeira reserva"). O `description` continua interno.';
comment on column public.coupon.terms is
  'Condições em texto livre exibidas no cartão da carteira. Não substitui as regras: quem decide '
  'elegibilidade é coupon_evaluate, sempre.';

do $$ begin
  alter table public.coupon
    add constraint coupon_max_discount_amount_check
    check (max_discount_amount is null or max_discount_amount > 0);
exception when duplicate_object then null; end $$;

-- Teto só existe para percentual: em `fixed` o próprio valor já é o teto, e aceitar os dois
-- deixaria dois números dizendo a mesma coisa (e discordando quando alguém editasse um só).
do $$ begin
  alter table public.coupon
    add constraint coupon_max_discount_only_percent
    check (max_discount_amount is null or discount_type = 'percent');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.coupon
    add constraint coupon_audience_inactive_days_check
    check (
      (audience = 'winback' and audience_inactive_days is not null and audience_inactive_days >= 1)
      or (audience <> 'winback' and audience_inactive_days is null)
    );
exception when duplicate_object then null; end $$;

-- Cupom de plataforma não tem empresa para bancar: quem banca é a Movepark, por definição.
do $$ begin
  alter table public.coupon
    add constraint coupon_platform_is_platform_funded
    check (company_id is not null or funded_by = 'platform');
exception when duplicate_object then null; end $$;

-- O unique (company_id, code) não alcança as linhas de plataforma, porque NULL não colide com
-- NULL no Postgres. Sem este índice parcial daria para criar dois BEMVINDO30 de plataforma.
create unique index if not exists coupon_platform_code_idx
  on public.coupon (lower(code)) where company_id is null;

-- ---------------------------------------------------------------------------
-- 3. Carteira: cupom que o cliente resgatou digitando o código
-- ---------------------------------------------------------------------------

create table if not exists public.coupon_wallet (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  coupon_id   uuid not null references public.coupon(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (profile_id, coupon_id)
);

comment on table public.coupon_wallet is
  'Cupom que o cliente guardou digitando o código ("Resgatar"). Guardar não é ter direito: a '
  'elegibilidade é recalculada a cada pedido por coupon_evaluate. Cupom de audiência aparece na '
  'carteira sem passar por aqui.';

alter table public.coupon_wallet enable row level security;

drop policy if exists coupon_wallet_owner_select on public.coupon_wallet;
create policy coupon_wallet_owner_select on public.coupon_wallet
  for select using (profile_id = (select auth.uid()));

-- Escrita só por RPC SECURITY DEFINER (coupon_redeem): inserir direto deixaria o cliente guardar
-- um cupom inativo ou de outra empresa e a carteira mentiria sobre o que ele tem.

-- ---------------------------------------------------------------------------
-- 4. Leitura pública do catálogo de cupons: fechada
-- ---------------------------------------------------------------------------

-- `catalog_read_coupon` liberava SELECT em todo cupom ativo para qualquer um, inclusive anon.
-- Isso já era um vazamento (a lista de códigos é pública), e vira dinheiro na mesa agora que a
-- Movepark põe 30% atrás de um código. Nada lê a tabela direto além do painel do operador, que é
-- coberto por `coupon_select`; o cliente passa por RPC SECURITY DEFINER.
drop policy if exists catalog_read_coupon on public.coupon;

-- ---------------------------------------------------------------------------
-- 5. Fatos de comportamento do cliente (base das audiências)
-- ---------------------------------------------------------------------------

create or replace function public.coupon_customer_stats(p_profile_id uuid)
returns table (paid_count integer, days_since_last integer)
language sql
stable
security definer
set search_path = public
as $fn$
  -- "Compra" = reserva que passou do pagamento. `pending` não conta (ninguém pagou ainda), e
  -- cancelled/expired não contam porque a pessoa não usou o serviço. `no_show` conta: pagou.
  select
    count(*)::int,
    case
      when max(b.check_out_at) is null then null
      else greatest(0, floor(extract(epoch from (now() - max(b.check_out_at))) / 86400)::int)
    end
  from public.booking b
  where b.profile_id = p_profile_id
    and b.deleted_at is null
    and b.status in ('confirmed', 'checked_in', 'completed', 'no_show');
$fn$;

comment on function public.coupon_customer_stats(uuid) is
  'Fatos que as audiências de cupom leem: quantas reservas pagas e há quantos dias foi a última '
  'saída. Reserva futura zera days_since_last (quem tem viagem marcada não é winback).';

-- Ajudante interno sem gate próprio: o Supabase concede execute a `authenticated` por privilégio
-- padrão, e `revoke ... from public` não alcança isso (lição da 20261027094500).
revoke all on function public.coupon_customer_stats(uuid) from public, anon, authenticated;
grant execute on function public.coupon_customer_stats(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. coupon_evaluate: plataforma, teto e audiência
-- ---------------------------------------------------------------------------

create or replace function public.coupon_evaluate(
  p_code text,
  p_location_id uuid,
  p_profile_id uuid,
  p_subtotal numeric,
  p_days integer,
  p_company_parking_type_id uuid
)
returns table (coupon_id uuid, discount numeric, error_code text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c record;
  v_company_id uuid;
  v_checkout_mode text;
  v_uses int;
  v_disc numeric;
  v_stats record;
  v_norm text := lower(trim(coalesce(p_code, '')));
begin
  select l.company_id, l.checkout_mode::text
    into v_company_id, v_checkout_mode
  from public.location l where l.id = p_location_id;

  -- ADR-009: unidade que fecha a reserva fora do Hub não tem cupom para prometer. A regra mora
  -- aqui, e não só na UI, porque validate_coupon_public é chamável direto.
  if v_checkout_mode = 'external' then
    return query select null::uuid, 0::numeric, 'not_available_here'::text; return;
  end if;

  -- Precedência: o cupom da empresa vence o de plataforma com o mesmo código (o mais específico
  -- ganha). Sem isso, um parceiro criando BEMVINDO30 tornaria ambíguo qual desconto sai.
  select * into c from public.coupon
  where company_id = v_company_id and lower(code) = v_norm
  limit 1;

  if c.id is null then
    select * into c from public.coupon
    where company_id is null and lower(code) = v_norm
    limit 1;
  end if;

  if c.id is null then
    return query select null::uuid, 0::numeric, 'invalid'::text; return;
  end if;
  if not c.is_active then
    return query select null::uuid, 0::numeric, 'inactive'::text; return;
  end if;
  if c.valid_from is not null and c.valid_from > now() then
    return query select null::uuid, 0::numeric, 'not_yet_valid'::text; return;
  end if;
  if c.valid_until is not null and c.valid_until < now() then
    return query select null::uuid, 0::numeric, 'expired'::text; return;
  end if;
  if c.max_uses is not null and c.times_used >= c.max_uses then
    return query select null::uuid, 0::numeric, 'exhausted'::text; return;
  end if;
  if c.min_days is not null and coalesce(p_days, 0) < c.min_days then
    return query select null::uuid, 0::numeric, 'min_days'::text; return;
  end if;
  if c.min_amount is not null and coalesce(p_subtotal, 0) < c.min_amount then
    return query select null::uuid, 0::numeric, 'min_amount'::text; return;
  end if;
  if exists (select 1 from public.coupon_parking_type x where x.coupon_id = c.id) then
    if p_company_parking_type_id is null or not exists (
      select 1 from public.coupon_parking_type x
      where x.coupon_id = c.id and x.company_parking_type_id = p_company_parking_type_id
    ) then
      return query select null::uuid, 0::numeric, 'not_eligible_type'::text; return;
    end if;
  end if;

  -- Audiência. Sem sessão não dá para verificar histórico, e liberar "primeira reserva" para
  -- anônimo entregaria o desconto a quem já comprou, bastando sair da conta.
  if c.audience <> 'code_only' and c.audience <> 'public' then
    if p_profile_id is null then
      return query select null::uuid, 0::numeric, 'login_required'::text; return;
    end if;
    select * into v_stats from public.coupon_customer_stats(p_profile_id);

    if c.audience = 'first_purchase' and coalesce(v_stats.paid_count, 0) <> 0 then
      return query select null::uuid, 0::numeric, 'not_first_purchase'::text; return;
    end if;
    if c.audience = 'second_purchase' and coalesce(v_stats.paid_count, 0) <> 1 then
      return query select null::uuid, 0::numeric, 'not_second_purchase'::text; return;
    end if;
    if c.audience = 'winback' and (
         coalesce(v_stats.paid_count, 0) = 0
         or coalesce(v_stats.days_since_last, 0) < c.audience_inactive_days
       ) then
      return query select null::uuid, 0::numeric, 'not_winback'::text; return;
    end if;
  end if;

  if c.per_user_limit is not null and p_profile_id is not null then
    select count(*) into v_uses
    from public.booking_coupon bc
    join public.booking b on b.id = bc.booking_id
    where bc.coupon_id = c.id and b.profile_id = p_profile_id and b.status <> 'cancelled';
    if v_uses >= c.per_user_limit then
      return query select null::uuid, 0::numeric, 'already_used'::text; return;
    end if;
  end if;

  if c.discount_type = 'percent' then
    v_disc := round(coalesce(p_subtotal, 0) * (c.discount_value / 100), 2);
    if c.max_discount_amount is not null then
      v_disc := least(v_disc, c.max_discount_amount);
    end if;
  else
    v_disc := least(c.discount_value, coalesce(p_subtotal, 0));
  end if;
  if v_disc < 0 then v_disc := 0; end if;
  -- O desconto nunca passa do subtotal, nem com teto mal configurado.
  v_disc := least(v_disc, coalesce(p_subtotal, 0));

  return query select c.id, v_disc, null::text;
end; $fn$;

comment on function public.coupon_evaluate(text, uuid, uuid, numeric, integer, uuid) is
  'Fonte única da regra de cupom: validate_coupon (preview), a carteira e _create_booking_core '
  '(autoritativo) chamam esta função. Resolve cupom da empresa antes do de plataforma.';

-- ---------------------------------------------------------------------------
-- 7. Resgate por código ("Resgatar")
-- ---------------------------------------------------------------------------

create or replace function public.coupon_redeem(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c record;
  v_uid uuid := auth.uid();
  v_norm text := lower(trim(coalesce(p_code, '')));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error_code', 'login_required');
  end if;
  if v_norm = '' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid');
  end if;

  -- Resgate é por código puro, sem unidade: o cliente guarda o cupom antes de escolher onde vai
  -- estacionar. Quem manda na elegibilidade continua sendo coupon_evaluate, no pedido.
  select * into c from public.coupon
  where lower(code) = v_norm and is_active
  order by (company_id is null)  -- empresa antes de plataforma, igual à precedência da avaliação
  limit 1;

  if c.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'invalid');
  end if;
  if c.valid_until is not null and c.valid_until < now() then
    return jsonb_build_object('ok', false, 'error_code', 'expired');
  end if;
  if c.max_uses is not null and c.times_used >= c.max_uses then
    return jsonb_build_object('ok', false, 'error_code', 'exhausted');
  end if;

  insert into public.coupon_wallet (profile_id, coupon_id)
  values (v_uid, c.id)
  on conflict (profile_id, coupon_id) do nothing;

  return jsonb_build_object('ok', true, 'coupon_id', c.id, 'code', upper(c.code));
end; $fn$;

comment on function public.coupon_redeem(text) is
  'Guarda um cupom na carteira do cliente a partir do código. Não promete desconto: a validade '
  'para um pedido específico é recalculada em customer_coupon_wallet/validate_coupon.';

revoke all on function public.coupon_redeem(text) from public, anon;
grant execute on function public.coupon_redeem(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. A carteira: o que o cliente vê em /account/descontos e no checkout
-- ---------------------------------------------------------------------------

create or replace function public.customer_coupon_wallet(
  p_location_parking_type_id uuid default null,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_location_id uuid; v_company_id uuid; v_cpt_id uuid;
  v_location_slug text; v_company_slug text; v_parking_type_code text;
  v_days int; v_minutes int; v_sim jsonb; v_subtotal numeric;
  v_auto_stack boolean := true; v_disc record;
  v_rows jsonb := '[]'::jsonb;
  r record; v_eval record; v_card jsonb;
  v_best_id uuid; v_best numeric := 0;
begin
  if v_uid is null then
    return jsonb_build_object('items', '[]'::jsonb, 'has_order_context', false);
  end if;

  -- Contexto de pedido (checkout): resolve unidade, preço e prazo para calcular o desconto real.
  if p_location_parking_type_id is not null
     and p_check_in_at is not null and p_check_out_at is not null
     and p_check_out_at > p_check_in_at then
    select l.id, l.company_id, cpt.id, l.slug, co.slug, pt.code
      into v_location_id, v_company_id, v_cpt_id, v_location_slug, v_company_slug, v_parking_type_code
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company co on co.id = l.company_id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    where lpt.id = p_location_parking_type_id and l.deleted_at is null;

    if v_location_id is not null then
      v_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
      v_days := greatest(1, ceil(v_minutes::numeric / (60 * 24))::int);
      v_sim := public.simulate_price(v_company_slug, v_location_slug, v_parking_type_code, v_days);
      v_subtotal := nullif(v_sim ->> 'price', '')::numeric;

      -- Promoção automática pode proibir empilhar cupom. Se proibir, TODO cupom fica indisponível
      -- e o motivo é esse. Melhor dizer isso do que listar cupom que falha no "Usar".
      for v_disc in
        select * from public.discount_evaluate(
          v_location_id, v_cpt_id,
          coalesce(nullif(v_sim ->> 'base_price', '')::numeric, v_subtotal),
          v_days, p_check_in_at)
      loop
        v_auto_stack := coalesce(v_disc.allow_coupon_stack, true);
      end loop;
    end if;
  end if;

  for r in
    -- Entra na carteira o cupom que a pessoa resgatou, e o cupom de audiência que casa com ela.
    -- Cupom de empresa só entra quando ela está comprando naquela empresa: sem isso a tela viraria
    -- a lista de promoções de toda a rede, e nenhuma serviria para o pedido.
    select c.*,
           (w.profile_id is not null) as is_redeemed,
           co.name as company_name
    from public.coupon c
    left join public.coupon_wallet w on w.coupon_id = c.id and w.profile_id = v_uid
    left join public.company co on co.id = c.company_id
    where c.is_active
      and (c.valid_until is null or c.valid_until >= now())
      and (c.max_uses is null or c.times_used < c.max_uses)
      and (
        w.profile_id is not null
        or (
          c.audience <> 'code_only'
          and (c.company_id is null or c.company_id = v_company_id)
        )
      )
    order by c.sort_order, c.created_at
  loop
    -- A audiência decide se o cupom APARECE; coupon_evaluate decide se ele VALE para este pedido.
    -- Cupom resgatado cujo dono saiu da audiência continua aparecendo, com o motivo. Sumir sem
    -- explicação seria pior para quem guardou.
    if not r.is_redeemed and r.audience not in ('public', 'code_only') then
      declare v_stats record; v_match boolean := false;
      begin
        select * into v_stats from public.coupon_customer_stats(v_uid);
        v_match := case r.audience
          when 'first_purchase'  then coalesce(v_stats.paid_count, 0) = 0
          when 'second_purchase' then coalesce(v_stats.paid_count, 0) = 1
          when 'winback'         then coalesce(v_stats.paid_count, 0) > 0
                                      and coalesce(v_stats.days_since_last, 0) >= r.audience_inactive_days
          else false end;
        if not v_match then continue; end if;
      end;
    end if;

    v_card := jsonb_build_object(
      'id', r.id,
      'code', upper(r.code),
      'title', coalesce(r.title, r.description),
      'terms', r.terms,
      'discount_type', r.discount_type,
      'discount_value', r.discount_value,
      'max_discount_amount', r.max_discount_amount,
      'min_amount', r.min_amount,
      'min_days', r.min_days,
      'valid_until', r.valid_until,
      'scope', case when r.company_id is null then 'platform' else 'company' end,
      'company_name', r.company_name,
      'audience', r.audience,
      'is_redeemed', r.is_redeemed,
      'is_best', false,
      'discount', 0);

    if v_location_id is not null and v_subtotal is not null then
      if not v_auto_stack then
        v_rows := v_rows || jsonb_build_array(
          v_card || jsonb_build_object('is_eligible', false, 'reason', 'no_stack'));
        continue;
      end if;
      select * into v_eval from public.coupon_evaluate(
        r.code, v_location_id, v_uid, v_subtotal, v_days, v_cpt_id);
      if v_eval.error_code is not null then
        v_rows := v_rows || jsonb_build_array(
          v_card || jsonb_build_object('is_eligible', false, 'reason', v_eval.error_code));
      else
        v_rows := v_rows || jsonb_build_array(
          v_card || jsonb_build_object(
            'is_eligible', true, 'reason', null, 'discount', v_eval.discount));
        if v_eval.discount > v_best then
          v_best := v_eval.discount; v_best_id := r.id;
        end if;
      end if;
    else
      -- Sem pedido: a tela lista condições, não veredito. Dizer "disponível" aqui seria prometer
      -- um desconto que depende da unidade e das datas que a pessoa ainda não escolheu.
      v_rows := v_rows || jsonb_build_array(
        v_card || jsonb_build_object('is_eligible', null, 'reason', null));
    end if;
  end loop;

  -- "Melhor opção": o maior desconto em reais para este pedido.
  if v_best_id is not null then
    select jsonb_agg(
             case when (x ->> 'id')::uuid = v_best_id
                  then x || jsonb_build_object('is_best', true)
                  else x end
             order by ord)
      into v_rows
    from jsonb_array_elements(v_rows) with ordinality as t(x, ord);
  end if;

  return jsonb_build_object(
    'items', coalesce(v_rows, '[]'::jsonb),
    'has_order_context', v_location_id is not null and v_subtotal is not null);
end; $fn$;

comment on function public.customer_coupon_wallet(uuid, timestamptz, timestamptz) is
  'Carteira de cupons do cliente. Sem contexto de pedido lista condições (is_eligible null); com '
  'unidade e datas devolve veredito, motivo da indisponibilidade e o desconto de cada um.';

revoke all on function public.customer_coupon_wallet(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.customer_coupon_wallet(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Aplicar e remover cupom numa reserva pendente (o checkout)
-- ---------------------------------------------------------------------------

create or replace function public.apply_coupon_to_booking(p_booking_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b public.booking;
  v_uid uuid := auth.uid();
  v_cpt_id uuid; v_parking_type_id uuid; v_company_id uuid;
  v_days int; v_subtotal numeric; v_eval record;
  v_auto_stack boolean := true; v_old numeric := 0;
  v_breakdown jsonb; v_total numeric;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error_code', 'login_required');
  end if;

  select * into b from public.booking
  where id = p_booking_id and profile_id = v_uid and deleted_at is null;

  if b.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;
  -- Só reserva ainda não paga: mexer no total depois do pagamento quebraria o split já enviado.
  if b.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error_code', 'not_pending');
  end if;
  if b.expires_at is not null and b.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error_code', 'expired_booking');
  end if;

  v_subtotal := nullif(b.price_breakdown ->> 'subtotal', '')::numeric;
  if v_subtotal is null then
    return jsonb_build_object('ok', false, 'error_code', 'invalid');
  end if;
  v_days := coalesce(nullif(b.price_breakdown ->> 'days', '')::int,
                     greatest(1, ceil(extract(epoch from (b.check_out_at - b.check_in_at))::numeric
                                      / 60 / (60 * 24))::int));

  -- A reserva não guarda o location_parking_type; o tipo de vaga vem do item de estacionamento.
  select bi.parking_type_id into v_parking_type_id
  from public.booking_item bi
  where bi.booking_id = b.id and bi.item_type = 'parking' limit 1;

  select l.company_id into v_company_id from public.location l where l.id = b.location_id;
  select cpt.id into v_cpt_id from public.company_parking_type cpt
  where cpt.company_id = v_company_id and cpt.parking_type_id = v_parking_type_id limit 1;

  -- Promoção automática que não empilha continua mandando depois da reserva criada.
  if (b.price_breakdown -> 'auto_discount') is not null
     and (b.price_breakdown -> 'auto_discount' ->> 'rule_id') is not null then
    select dr.allow_coupon_stack into v_auto_stack from public.discount_rule dr
    where dr.id = (b.price_breakdown -> 'auto_discount' ->> 'rule_id')::uuid;
    if not coalesce(v_auto_stack, true) then
      return jsonb_build_object('ok', false, 'error_code', 'no_stack');
    end if;
  end if;

  select * into v_eval from public.coupon_evaluate(
    trim(coalesce(p_code, '')), b.location_id, v_uid, v_subtotal, v_days, v_cpt_id);

  if v_eval.error_code is not null then
    return jsonb_build_object('ok', false, 'error_code', v_eval.error_code);
  end if;

  select coalesce(sum(bc.discount_applied), 0) into v_old
  from public.booking_coupon bc where bc.booking_id = b.id;

  -- Trocar de cupom é remover e aplicar: só existe um por reserva (PK é (booking_id, coupon_id),
  -- mas a regra de negócio é um só, e o total assume isso).
  delete from public.booking_coupon where booking_id = b.id;
  if v_eval.discount > 0 then
    insert into public.booking_coupon (booking_id, coupon_id, discount_applied)
    values (b.id, v_eval.coupon_id, v_eval.discount);
  end if;

  v_total := round(b.total_amount + v_old - v_eval.discount, 2);

  v_breakdown := coalesce(b.price_breakdown, '{}'::jsonb) || jsonb_build_object(
    'coupon', case when v_eval.discount > 0 then (
      select jsonb_build_object(
        'code', upper(co.code),
        'discount', v_eval.discount,
        'funded_by', co.funded_by)
      from public.coupon co where co.id = v_eval.coupon_id
    ) else null end,
    'total', v_total);

  update public.booking
  set total_amount = v_total, price_breakdown = v_breakdown
  where id = b.id;

  return jsonb_build_object(
    'ok', true, 'code', upper(trim(p_code)),
    'discount', v_eval.discount, 'total_amount', v_total);
end; $fn$;

comment on function public.apply_coupon_to_booking(uuid, text) is
  'Aplica (ou troca) o cupom de uma reserva pendente do próprio cliente, recalculando total e '
  'price_breakdown. É o caminho do checkout: antes disso o cupom só entrava em create_booking.';

create or replace function public.remove_coupon_from_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b public.booking;
  v_uid uuid := auth.uid();
  v_old numeric := 0; v_total numeric;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error_code', 'login_required');
  end if;

  select * into b from public.booking
  where id = p_booking_id and profile_id = v_uid and deleted_at is null;

  if b.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;
  if b.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error_code', 'not_pending');
  end if;

  select coalesce(sum(bc.discount_applied), 0) into v_old
  from public.booking_coupon bc where bc.booking_id = b.id;

  delete from public.booking_coupon where booking_id = b.id;

  v_total := round(b.total_amount + v_old, 2);
  update public.booking
  set total_amount = v_total,
      price_breakdown = coalesce(b.price_breakdown, '{}'::jsonb)
        || jsonb_build_object('coupon', null, 'total', v_total)
  where id = b.id;

  return jsonb_build_object('ok', true, 'total_amount', v_total);
end; $fn$;

revoke all on function public.apply_coupon_to_booking(uuid, text) from public, anon;
grant execute on function public.apply_coupon_to_booking(uuid, text) to authenticated, service_role;
revoke all on function public.remove_coupon_from_booking(uuid) from public, anon;
grant execute on function public.remove_coupon_from_booking(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Gestão do cupom de plataforma (só hub_admin)
-- ---------------------------------------------------------------------------

create or replace function public.manager_upsert_platform_coupon(
  p_id uuid,
  p_code text,
  p_title text,
  p_description text,
  p_terms text,
  p_discount_type text,
  p_discount_value numeric,
  p_max_discount_amount numeric,
  p_audience text,
  p_audience_inactive_days integer,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_max_uses integer,
  p_per_user_limit integer,
  p_min_amount numeric,
  p_min_days integer,
  p_is_active boolean,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark cria cupom de plataforma.' using errcode = '42501';
  end if;
  if p_discount_type not in ('percent', 'fixed') then
    raise exception 'Tipo de desconto inválido.' using errcode = 'P0001';
  end if;
  if p_discount_type = 'percent' and p_discount_value > 100 then
    raise exception 'Desconto percentual não pode passar de 100%%.' using errcode = 'P0001';
  end if;
  -- Percentual sem teto num cupom que a Movepark banca é buraco aberto: 30% de uma estadia longa
  -- passa da comissão e a reserva sai no prejuízo.
  if p_discount_type = 'percent' and p_max_discount_amount is null then
    raise exception 'Cupom percentual de plataforma exige teto (max_discount_amount).'
      using errcode = 'P0001';
  end if;

  insert into public.coupon (
    id, company_id, code, title, description, terms,
    discount_type, discount_value, max_discount_amount,
    funded_by, audience, audience_inactive_days,
    valid_from, valid_until, max_uses, per_user_limit, min_amount, min_days,
    is_active, sort_order)
  values (
    coalesce(p_id, gen_random_uuid()), null, upper(trim(p_code)), p_title, p_description, p_terms,
    p_discount_type::public.discount_type, p_discount_value, p_max_discount_amount,
    'platform', p_audience::public.coupon_audience, p_audience_inactive_days,
    p_valid_from, p_valid_until, p_max_uses, p_per_user_limit, p_min_amount, p_min_days,
    coalesce(p_is_active, true), coalesce(p_sort_order, 0))
  on conflict (id) do update set
    code = excluded.code, title = excluded.title, description = excluded.description,
    terms = excluded.terms, discount_type = excluded.discount_type,
    discount_value = excluded.discount_value, max_discount_amount = excluded.max_discount_amount,
    audience = excluded.audience, audience_inactive_days = excluded.audience_inactive_days,
    valid_from = excluded.valid_from, valid_until = excluded.valid_until,
    max_uses = excluded.max_uses, per_user_limit = excluded.per_user_limit,
    min_amount = excluded.min_amount, min_days = excluded.min_days,
    is_active = excluded.is_active, sort_order = excluded.sort_order
  returning id into v_id;

  return v_id;
end; $fn$;

revoke all on function public.manager_upsert_platform_coupon(
  uuid, text, text, text, text, text, numeric, numeric, text, integer,
  timestamptz, timestamptz, integer, integer, numeric, integer, boolean, integer) from public, anon;
grant execute on function public.manager_upsert_platform_coupon(
  uuid, text, text, text, text, text, numeric, numeric, text, integer,
  timestamptz, timestamptz, integer, integer, numeric, integer, boolean, integer)
  to authenticated, service_role;

create or replace function public.manager_list_platform_coupons()
returns setof public.coupon
language sql
stable
security definer
set search_path = public
as $fn$
  select c.* from public.coupon c
  where c.company_id is null and public.is_hub_admin()
  order by c.sort_order, c.created_at;
$fn$;

revoke all on function public.manager_list_platform_coupons() from public, anon;
grant execute on function public.manager_list_platform_coupons() to authenticated, service_role;
