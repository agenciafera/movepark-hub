-- O endereço público da unidade é da plataforma, não do parceiro.
--
-- Achado na revisão de segurança da migration anterior (20261102090000). A policy
-- `location_operator_update` autoriza o UPDATE por LINHA, com escopo `locations:write`,
-- e RLS não corta coluna: quem edita a própria unidade edita qualquer campo dela, e as
-- colunas novas entraram nesse pacote sem ninguém decidir isso.
--
-- Duas consequências, as duas depois da virada de rotas:
--   1. o parceiro reescreve a própria URL sempre que quiser, e canonical, sitemap e mapa
--      de 301 passam a apontar para um endereço que muda sem aviso;
--   2. `public_slug` é único POR DESTINO e o namespace é compartilhado com os lotes
--      mapeados, então um parceiro pode tomar o slug do vizinho no mesmo aeroporto antes
--      dele. A mensagem de erro da guarda de unicidade também vira sonda: ela responde se
--      existe lote mapeado com aquele slug ali, inclusive rascunho, que a RLS esconde.
--
-- Nome e slug públicos são editoriais (o padrão está em docs/specs/url-estacionamentos.md),
-- então valem a mesma regra de `checkout_mode` e `go2park_*`: só `hub_admin` altera, e a
-- checagem mora no trigger, porque é o único lugar do Postgres que enxerga coluna.
--
-- `auth.uid() is null` passa direto de propósito, igual em `location_checkout_mode_guard`:
-- é a migration, o service role e as rotinas de manutenção, que não têm JWT.
--
-- `prospect_location` não precisa do mesmo: ali a escrita já é só de `hub_admin` (ADR-010).

create or replace function public.location_guard_public_slug()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Quem pode mudar. Só dispara quando o valor muda de fato: `destination_id` e
  -- `deleted_at` também acionam este trigger, e mexer neles continua sendo do parceiro.
  if (tg_op = 'INSERT' and (new.public_slug is not null or new.public_name is not null))
     or (tg_op = 'UPDATE' and (new.public_slug is distinct from old.public_slug
                            or new.public_name is distinct from old.public_name)) then
    if auth.uid() is not null and not public.is_hub_admin() then
      raise exception 'public_name e public_slug so podem ser alterados por hub_admin'
        using errcode = '42501';
    end if;
  end if;

  -- Unicidade entre as duas famílias, que o Postgres não expressa em constraint.
  if new.public_slug is null or new.destination_id is null or new.deleted_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.prospect_location p
    where p.destination_id = new.destination_id
      and p.public_slug = new.public_slug
      and p.converted_at is null
  ) then
    raise exception
      'public_slug "%" já pertence a um lote mapeado neste destino; as duas famílias dividem a mesma URL',
      new.public_slug
      using errcode = '23505';
  end if;

  return new;
end $function$;

revoke all on function public.location_guard_public_slug() from public, anon, authenticated;

drop trigger if exists location_guard_public_slug on public.location;
create trigger location_guard_public_slug
  before insert or update of public_name, public_slug, destination_id, deleted_at on public.location
  for each row execute function public.location_guard_public_slug();
