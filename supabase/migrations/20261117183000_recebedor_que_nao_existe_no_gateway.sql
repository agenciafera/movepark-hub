-- Recebedor marcado como ativo aqui e inexistente no gateway (achado de 15/09/2026).
--
-- Ao ler o saldo de cada recebedor ativo pela primeira vez, 5 dos 6 responderam 404. A sonda
-- seguinte, em `GET /recipients/{id}`, respondeu `{"message": "Recipient not found."}` para os
-- cinco: Gaita Park, Lisboa Park, Maxi Park, Motion Park e Virapark. O único que existe é o da
-- Agência Fera, que é também o único criado pela nossa própria Edge `sync-recipient`; os outros
-- cinco só têm evento de `webhook` no histórico, ou seja, o id veio de fora.
--
-- Por que isso importa: `payout_recipient.status = 'active'` é o que diz que o parceiro está pronto
-- para receber. Com o recebedor inexistente, um repasse morre em 404, e uma venda com split
-- enviado apontaria para um id que o gateway não reconhece. A tela mostrava tudo verde.
--
-- O que esta migration NÃO faz, de propósito: não mexe no `status`. A listagem pública depende de
-- recebedor ativo, então rebaixar o status aqui tiraria cinco parceiros do ar por causa de uma
-- leitura de API. Recriar recebedor também não é automático: envolve reenviar KYC ao gateway e
-- avisar o parceiro, e isso é decisão de quem toca o negócio.
--
-- O que ela faz: guarda o carimbo do achado, mostra o alerta no painel da Movepark e tira o botão
-- de repasse de quem não tem para onde receber.

alter table public.payout_recipient
  add column if not exists gateway_missing_at timestamptz;

comment on column public.payout_recipient.gateway_missing_at is
  'Quando o gateway respondeu que este recebedor não existe (GET /recipients/{id} = 404). NULL '
  'quando a última leitura boa o encontrou. Status continua intocado de propósito: rebaixá-lo '
  'deslistaria o parceiro por causa de uma leitura de API.';

-- ── a visão do painel passa a acusar ────────────────────────────────────────
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
      -- Repassado a mais: aparece para alguém resolver, em vez de sumir no zero.
      greatest(
        public.payout_transferred_cents(c.id, p_provider)
          - public.payout_owed_cents(c.id, p_provider),
        0
      ) as overpaid_cents,
      pr.external_recipient_id as target_recipient_id,
      pr.status::text          as recipient_status,
      -- Recebedor que o gateway não reconhece. Repassar para ele morre em 404, então a tela
      -- precisa saber antes de oferecer o botão.
      (pr.gateway_missing_at is not null) as recipient_missing,
      (t.id is not null)       as em_andamento,
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
        -- Pago a mais também: é o caso que a tela precisa mostrar para alguém agir.
        or public.payout_transferred_cents(c.id, p_provider)
           > public.payout_owed_cents(c.id, p_provider)
        -- Recebedor inexistente aparece mesmo sem dívida: é problema de configuração, e ficaria
        -- invisível justamente em quem vende com split (dívida zero por desenho).
        or pr.gateway_missing_at is not null
      )
  ) x;

  return v_result;
end;
$function$;
revoke all on function public.payout_owed_overview(text) from public, anon;
grant execute on function public.payout_owed_overview(text) to authenticated;
