-- O interruptor do split passa a existir também por empresa (E0.3.5, decisão de 15/09/2026).
--
-- O que aconteceu: ao ligar `pagarme_split_enabled` global, OITO parceiros ativos passaram a tomar
-- 409 no checkout, porque sete deles nunca tiveram recebedor e vendiam em custódia sem precisar. A
-- chave foi desligada em minutos e nenhuma cobrança passou na janela. O modelo novo não pode
-- depender de todo mundo ter recebedor no mesmo dia.
--
-- Regra: uma cobrança vai com split quando a chave global está ligada OU a empresa está marcada.
-- Global desligada com empresas marcadas é o estado de transição: quem tem recebedor válido entra
-- no modelo novo (split + razão de dívida), quem não tem segue em custódia e não para de vender.
--
-- Marcar exige recebedor ativo e reconhecido pelo gateway, e só hub_admin marca. A RPC é quem
-- garante isso; a coluna não é escrita por RLS.

alter table public.company
  add column if not exists gateway_split_enabled boolean not null default false;

comment on column public.company.gateway_split_enabled is
  'A cobrança desta empresa vai ao gateway com split (E0.3.5). Vale mesmo com pagarme_split_enabled global desligado. Só hub_admin marca, pela RPC company_set_gateway_split, que exige recebedor ativo e reconhecido.';

create or replace function public.company_set_gateway_split(
  p_company_id uuid,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rec public.payout_recipient%rowtype;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark liga o split por empresa.' using errcode = '42501';
  end if;
  if p_enabled then
    select * into v_rec from public.payout_recipient
     where company_id = p_company_id and provider = 'pagarme' and deleted_at is null
     limit 1;
    if v_rec.id is null or v_rec.external_recipient_id is null or v_rec.status <> 'active' then
      raise exception 'A empresa precisa de recebedor ativo no gateway antes de ligar o split.'
        using errcode = 'P0001';
    end if;
    if v_rec.gateway_missing_at is not null then
      raise exception 'O gateway não reconhece o recebedor desta empresa. Recrie o recebedor antes de ligar o split.'
        using errcode = 'P0001';
    end if;
  end if;
  update public.company set gateway_split_enabled = p_enabled where id = p_company_id;
end;
$function$;
revoke all on function public.company_set_gateway_split(uuid, boolean) from public, anon;
grant execute on function public.company_set_gateway_split(uuid, boolean) to authenticated;
