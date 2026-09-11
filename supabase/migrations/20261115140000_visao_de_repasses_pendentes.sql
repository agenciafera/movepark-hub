-- Visão do painel: quem está devendo repasse, e quanto ainda cabe repassar.
--
-- O extrato (`payout_statement`) é por período, e a dívida não é: ela é o acumulado do que vendemos
-- em custódia e ainda não mandamos. Misturar as duas coisas na mesma resposta faria alguém somar um
-- número de período com um número de sempre. Por isso é RPC própria.
--
-- Ver docs/specs/repasse-ao-parceiro.md.

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
      -- O que o botão pode repassar agora. `created`/`processing` já estão descontados, então dois
      -- cliques seguidos não oferecem o mesmo dinheiro duas vezes.
      greatest(
        public.payout_owed_cents(c.id, p_provider)
          - public.payout_transferred_cents(c.id, p_provider),
        0
      ) as available_cents,
      pr.external_recipient_id as target_recipient_id,
      pr.status::text          as recipient_status,
      -- Repasse em andamento: a tela mostra "em curso" em vez de oferecer o botão de novo.
      exists (
        select 1 from public.payout_transfer t
         where t.company_id = c.id and t.provider = p_provider
           and t.status in ('created', 'processing') and t.deleted_at is null
      ) as em_andamento
    from public.company c
    left join public.payout_recipient pr
      on pr.company_id = c.id and pr.provider = p_provider and pr.deleted_at is null
    where c.deleted_at is null
      and public.payout_owed_cents(c.id, p_provider) > 0
  ) x;

  return v_result;
end;
$function$;
revoke all on function public.payout_owed_overview(text) from public, anon;
grant execute on function public.payout_owed_overview(text) to authenticated;
