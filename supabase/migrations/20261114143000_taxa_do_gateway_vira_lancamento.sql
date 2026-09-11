-- A taxa do gateway vira lançamento.
--
-- Antes da custódia, o desconto da taxa acontecia dentro do Pagar.me pelo `charge_processing_fee`
-- na perna do parceiro, e nunca precisou existir no nosso banco. Com `pagarme_split_enabled =
-- false` a cobrança inteira cai na Movepark e a taxa virou custo nosso, sem lançamento nenhum: o
-- Faturamento mostra comissão bruta e a margem real é sempre menor que a da tela.
--
-- Ela não aparece na order nem na charge. O único lugar da Core v5 que traz é `GET /payables`, um
-- recebível por parcela, com `fee`, `anticipation_fee` e `fraud_coverage_fee`. Por isso a apuração
-- é assíncrona: a Edge `reconcile-gateway-fees` roda no cron e preenche o que falta.
--
-- `gateway_fee_cents` nulo quer dizer "ainda não apurado", que é diferente de zero. Gravar zero
-- como se fosse medida esconderia justamente o que falta apurar, então o extrato soma só o que tem
-- valor e a coluna `gateway_fee_synced_at` diz quando a apuração passou por ali.
--
-- A taxa é custo da MOVEPARK: ela não encosta no `net_partner_cents`. O extrato passa a devolver
-- `gateway_fee_cents` ao lado da comissão, e quem lê os dois campos vê a margem de verdade.

alter table public.payment
  add column if not exists gateway_fee_cents integer,
  add column if not exists gateway_fee_synced_at timestamptz;

comment on column public.payment.gateway_fee_cents is
  'Taxa do gateway na cobrança (MDR + antecipação + proteção contra fraude), somada sobre as parcelas. Nulo = ainda não apurado, que não é zero.';
comment on column public.payment.gateway_fee_synced_at is
  'Quando a apuração da taxa passou por esta cobrança (Edge reconcile-gateway-fees).';

-- A Edge varre exatamente este conjunto; sem o índice parcial ela faz seq scan na payment inteira
-- a cada volta do cron.
create index if not exists payment_gateway_fee_pendente_idx
  on public.payment (paid_at)
  where provider = 'pagarme' and status = 'paid' and gateway_fee_cents is null;

-- ── chave interna do cron (mesmo molde do reconcile-refunds) ─────────────────
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'reconcile_gateway_fees_key',
  'Chave interna do cron reconcile-gateway-fees (cron envia no header; Edge lê via RPC).'
);

create or replace function public.reconcile_gateway_fees_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = 'reconcile_gateway_fees_key' limit 1;
$$;
revoke all on function public.reconcile_gateway_fees_expected_key() from public, anon, authenticated;
grant execute on function public.reconcile_gateway_fees_expected_key() to service_role;

-- ── extrato: a taxa aparece ao lado da comissão ─────────────────────────────
create or replace function public.payout_statement(
  p_from timestamptz,
  p_to timestamptz,
  p_company_id uuid default null,
  p_include_lines boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean := public.is_hub_admin();
  v_result   jsonb;
begin
  if not v_is_admin then
    if p_company_id is null or p_company_id not in (select public.current_company_ids()) then
      raise exception 'Sem permissão para este extrato.' using errcode = '42501';
    end if;
    if not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Seu papel não permite ver o financeiro (finance:read).' using errcode = '42501';
    end if;
  end if;

  with legs as (
    select
      loc.company_id,
      c.name as company_name,
      p.status::text as status,
      b.code as booking_code,
      coalesce(p.paid_at, p.refunded_at) as event_at,
      -- Só `booking` tem perna de parceiro. Em `fare_upgrade`/`date_change` o `liable` é exigência
      -- do gateway, não titularidade do dinheiro.
      coalesce(sum((r->>'amount')::int)
        filter (where (r->>'liable')::boolean is true and p.kind = 'booking'), 0) as partner_cents,
      coalesce(sum((r->>'amount')::int)
        filter (where (r->>'liable')::boolean is false or p.kind <> 'booking'), 0) as movepark_cents,
      -- Estorno parcial: o pagamento continua `paid`, então o desconto tem que vir daqui.
      case
        when p.status = 'paid' and coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then least(1::numeric, p.refunded_amount / p.amount)
        else 0::numeric
      end as refund_ratio,
      -- Custo da Movepark, apurado em `GET /payables`. Nulo (não apurado) soma nada.
      coalesce(p.gateway_fee_cents, 0) as gateway_fee_cents
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    join public.company c    on c.id = loc.company_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = 'pagarme'
      and p.status in ('paid', 'refunded')
      and coalesce(p.paid_at, p.refunded_at) >= p_from
      and coalesce(p.paid_at, p.refunded_at) < p_to
      and (p_company_id is null or loc.company_id = p_company_id)
      and (v_is_admin or loc.company_id in (select public.current_company_ids()))
    group by loc.company_id, c.name, p.id, p.status, b.code, p.paid_at, p.refunded_at,
             p.kind, p.amount, p.refunded_amount, p.gateway_fee_cents
  ),
  lines as (
    select
      l.*,
      round(l.partner_cents  * l.refund_ratio)::bigint as partner_partial_cents,
      (l.partner_cents  - round(l.partner_cents  * l.refund_ratio))::bigint as partner_net_cents,
      (l.movepark_cents - round(l.movepark_cents * l.refund_ratio))::bigint as movepark_net_cents
    from legs l
  ),
  agg as (
    select
      company_id, company_name,
      coalesce(sum(partner_cents), 0)                                    as gross_partner_cents,
      coalesce(sum(partner_cents) filter (where status = 'refunded'), 0)
        + coalesce(sum(partner_partial_cents) filter (where status = 'paid'), 0)
                                                                         as refunded_partner_cents,
      coalesce(sum(partner_net_cents)  filter (where status = 'paid'), 0) as net_partner_cents,
      coalesce(sum(movepark_net_cents) filter (where status = 'paid'), 0) as movepark_commission_cents,
      coalesce(sum(gateway_fee_cents)  filter (where status = 'paid'), 0) as gateway_fee_cents,
      count(*) filter (where status = 'paid')                            as paid_count,
      count(*) filter (where status = 'refunded')                        as refunded_count
    from lines
    group by company_id, company_name
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'companies', coalesce(jsonb_agg(
      jsonb_build_object(
        'company_id', a.company_id,
        'company_name', a.company_name,
        'gross_partner_cents', a.gross_partner_cents,
        'refunded_partner_cents', a.refunded_partner_cents,
        'net_partner_cents', a.net_partner_cents,
        'movepark_commission_cents', a.movepark_commission_cents,
        'gateway_fee_cents', a.gateway_fee_cents,
        'paid_count', a.paid_count,
        'refunded_count', a.refunded_count,
        'lines', case when p_include_lines then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'booking_code', l.booking_code,
            'event_at', l.event_at,
            'status', l.status,
            -- A linha mostra o que sobrou de verdade: já líquido do estorno parcial.
            'partner_cents', l.partner_net_cents,
            'movepark_cents', l.movepark_net_cents,
            'gateway_fee_cents', l.gateway_fee_cents
          ) order by l.event_at desc), '[]'::jsonb)
          from lines l where l.company_id = a.company_id
        ) else null end
      ) order by a.company_name
    ), '[]'::jsonb)
  ) into v_result
  from agg a;

  return v_result;
end;
$function$;

-- ── cron: apura a cada 30 min ───────────────────────────────────────────────
-- Meia hora porque o recebível não nasce junto com o `charge.paid`: apurar a cada minuto só gera
-- chamada que volta vazia, e a rota tem rate limit.
--
-- `timeout_milliseconds` explícito: o default do pg_net é 5 s, e o lote são até 25 consultas
-- sequenciais ao gateway. Com o default a Edge roda até o fim mas o pg_net desiste antes, grava
-- "Timeout of 5000 ms reached" em `net._http_response` e a apuração fica sem resposta para olhar.
-- Medido na primeira execução, em 11/09/2026.
select cron.schedule(
  'reconcile-gateway-fees',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/reconcile-gateway-fees',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reconcile-gateway-fees-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_gateway_fees_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
