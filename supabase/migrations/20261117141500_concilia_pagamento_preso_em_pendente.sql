-- Pagamento preso em `pending` deixa de ser invisível (varredura de 15/09/2026).
--
-- O buraco: as duas conciliações que existiam partem de um pagamento que o nosso banco JÁ tem como
-- `paid` (reconcile-confirmations) ou de um estorno já pedido (reconcile-refunds). Nenhuma pergunta
-- ao gateway o que houve com um pagamento que ficou em `pending`. Quando o webhook `charge.paid` se
-- perde, o cron expira a reserva e o pagamento fica pendente para sempre. Se o cliente pagou,
-- entrou dinheiro que ninguém no sistema sabe que entrou, e não existe tela nem rotina que olhe.
--
-- Medido hoje: 5 PIX de agosto nesse estado, todos com a reserva já expirada.
--
-- Entram três peças:
--   1. A Edge `reconcile-pending-charges` (`GET /orders/{id}`), com chave no Vault e cron de 6h.
--   2. `confirm_or_refund_booking` para de reconfirmar estadia que já terminou. Sem isto, um
--      pagamento descoberto agora reconfirmaria uma reserva de agosto: o cliente não estacionou,
--      a vaga não existe mais e ainda viraria dívida com o parceiro.
--   3. (na Edge) `reconcile-confirmations` passa a olhar também reserva `expired`, que é onde essas
--      linhas caem.
--
-- Ver docs/specs/payment-split.md.

-- ── 1. chave interna do cron (mesmo molde do reconcile-payout-transfers) ────
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'reconcile_pending_charges_key',
  'Chave interna do cron reconcile-pending-charges (cron envia no header; Edge lê via RPC).'
)
where not exists (select 1 from vault.secrets where name = 'reconcile_pending_charges_key');

create or replace function public.reconcile_pending_charges_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = 'reconcile_pending_charges_key' limit 1;
$$;
revoke all on function public.reconcile_pending_charges_expected_key() from public, anon, authenticated;
grant execute on function public.reconcile_pending_charges_expected_key() to service_role;

-- ── 2. não reconfirma estadia que já acabou ────────────────────────────────
-- Única mudança: o ramo de reserva morta (`cancelled`/`expired`) checa a data antes de tentar pegar
-- vaga. Reserva viva não passa por aqui, então nada do fluxo normal muda.
create or replace function public.confirm_or_refund_booking(p_booking_id uuid, p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status    public.booking_status;
  v_check_out timestamptz;
  v_charge_id text;
begin
  select status, check_out_at into v_status, v_check_out
  from public.booking where id = p_booking_id for update;
  if v_status is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_status = 'confirmed' then
    return jsonb_build_object('outcome', 'noop');
  end if;

  if v_status = 'pending' then
    update public.booking set status = 'confirmed', expires_at = null
    where id = p_booking_id and status = 'pending';
    return jsonb_build_object('outcome', 'confirmed');
  end if;

  if v_status in ('cancelled', 'expired') then
    -- Estadia terminada não se reconfirma: o cliente não estacionou e a diária já passou.
    -- Devolver o dinheiro é o único desfecho honesto, e é o mesmo caminho do "pago sem vaga".
    if v_check_out is not null and v_check_out <= now() then
      select provider_charge_id into v_charge_id from public.payment where id = p_payment_id;
      update public.payment
        set refund_reason = coalesce(nullif(trim(refund_reason), ''), 'pagamento descoberto depois da estadia')
      where id = p_payment_id;
      return jsonb_build_object('outcome', 'needs_refund', 'charge_id', v_charge_id);
    end if;

    if public.acquire_booking_capacity(p_booking_id) then
      update public.booking set status = 'confirmed', deleted_at = null, expires_at = null
      where id = p_booking_id;
      return jsonb_build_object('outcome', 'reconfirmed');
    else
      select provider_charge_id into v_charge_id from public.payment where id = p_payment_id;
      update public.payment
        set refund_reason = coalesce(nullif(trim(refund_reason), ''), 'pago sem vaga na confirmação tardia')
      where id = p_payment_id;
      return jsonb_build_object('outcome', 'needs_refund', 'charge_id', v_charge_id);
    end if;
  end if;

  return jsonb_build_object('outcome', 'noop');
end;
$function$;

-- ── 3. cron: a cada 6 horas ────────────────────────────────────────────────
-- Fila normal vazia, então a frequência é baixa de propósito. `timeout_milliseconds` explícito
-- porque o default de 5 s do pg_net desiste antes de o lote de consultas sequenciais responder.
select cron.unschedule('reconcile-pending-charges')
where exists (select 1 from cron.job where jobname = 'reconcile-pending-charges');

select cron.schedule(
  'reconcile-pending-charges',
  '7 */6 * * *',
  $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/reconcile-pending-charges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reconcile-pending-charges-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_pending_charges_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
