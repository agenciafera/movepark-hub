-- Repasse retomável e conciliado (varredura de 15/09/2026).
--
-- Dois achados sobre o repasse ao parceiro:
--
-- 1. A tela não tinha caminho para retomar. Havendo repasse em andamento ela escondia o botão, e
--    uma linha que caiu em resposta incerta do gateway (sem id) ficava parada, contando como
--    repassado. Retomar é seguro por desenho (a RPC devolve a MESMA linha e a MESMA chave de
--    idempotência), mas ninguém conseguia clicar. A visão passa a trazer o pendente, com o valor e
--    se ele já chegou ao gateway, e a tela oferece "Retomar" quando ainda não chegou.
--
-- 2. O status do repasse dependia do webhook `transfer.*`, e nenhum evento desse tipo chegou em
--    toda a história da conta. Um repasse que não voltasse `transferred` na própria resposta ficaria
--    em `processing` para sempre. Entra a conciliação por polling (Edge
--    `reconcile-payout-transfers`, `GET /transfers/{id}`), com chave no Vault e cron de 15 minutos.
--
-- Ver docs/specs/repasse-ao-parceiro.md.

-- ── visão do painel, agora com o pendente ───────────────────────────────────
create or replace function public.payout_owed_overview(
  p_provider text default 'pagarme'
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark vê os repasses da rede.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x.company_name), '[]'::jsonb)
    into v_result
  from (
    select
      c.id   as company_id,
      c.name as company_name,
      public.payout_owed_cents(c.id, p_provider)        as owed_cents,
      public.payout_transferred_cents(c.id, p_provider) as transferred_cents,
      greatest(
        public.payout_owed_cents(c.id, p_provider)
          - public.payout_transferred_cents(c.id, p_provider),
        0
      ) as available_cents,
      pr.external_recipient_id as target_recipient_id,
      pr.status::text          as recipient_status,
      (t.id is not null)       as em_andamento,
      -- O repasse em andamento, se houver. `enviado` = já tem id do gateway (então só a conciliação
      -- ou o webhook fecham); não enviado = retomável pela tela, com a mesma chave.
      case when t.id is null then null else jsonb_build_object(
        'id', t.id,
        'status', t.status,
        'amount_cents', t.amount_cents,
        'enviado', t.external_transfer_id is not null,
        'failed_reason', t.failed_reason,
        'requested_at', t.requested_at
      ) end as pendente
    from public.company c
    left join public.payout_recipient pr
      on pr.company_id = c.id and pr.provider = p_provider and pr.deleted_at is null
    left join lateral (
      select * from public.payout_transfer pt
       where pt.company_id = c.id and pt.provider = p_provider
         and pt.status in ('created', 'processing') and pt.deleted_at is null
       order by pt.created_at
       limit 1
    ) t on true
    where c.deleted_at is null
      and (
        public.payout_owed_cents(c.id, p_provider) > 0
        -- Pendente sem dívida aberta ainda aparece: senão um repasse travado some da tela.
        or t.id is not null
      )
  ) x;

  return v_result;
end;
$function$;
revoke all on function public.payout_owed_overview(text) from public, anon;
grant execute on function public.payout_owed_overview(text) to authenticated;

-- ── chave interna do cron de conciliação (mesmo molde do reconcile-refunds) ─
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'reconcile_payout_transfers_key',
  'Chave interna do cron reconcile-payout-transfers (cron envia no header; Edge lê via RPC).'
)
where not exists (select 1 from vault.secrets where name = 'reconcile_payout_transfers_key');

create or replace function public.reconcile_payout_transfers_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = 'reconcile_payout_transfers_key' limit 1;
$$;
revoke all on function public.reconcile_payout_transfers_expected_key() from public, anon, authenticated;
grant execute on function public.reconcile_payout_transfers_expected_key() to service_role;

-- ── cron: concilia a cada 15 min ────────────────────────────────────────────
-- `timeout_milliseconds` explícito pelo mesmo motivo do reconcile-gateway-fees: o lote são até 20
-- consultas sequenciais e o default de 5 s do pg_net desiste antes de a Edge responder.
select cron.schedule(
  'reconcile-payout-transfers',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/reconcile-payout-transfers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reconcile-payout-transfers-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_payout_transfers_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
