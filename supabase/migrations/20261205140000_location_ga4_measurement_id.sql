-- ID do GA4 do parceiro, por unidade.
--
-- O que resolve: o parceiro quer ver no GA4 dele o funil das vendas que nascem no Hub. As duas
-- rotas possíveis eram carregar o GTM do parceiro dentro do Hub ou mandar os eventos do Hub para
-- o GA4 dele. A primeira foi recusada: um container de terceiro roda código arbitrário no
-- checkout (cartão, e-mail, telefone), e numa aplicação de página única ele continua carregado
-- quando o visitante sai da ficha do parceiro e compra em outro estacionamento, então enxergaria
-- a venda do concorrente. Fica a segunda, no mesmo desenho da conversão do Google Ads
-- (migration `20261201220000`): a unidade guarda o id, o front manda no bloco `partner` e UMA tag
-- no GTM do Hub (`GTM-KHBBZT9`) lê de lá. Parceiro novo é um campo preenchido no Manager.
--
-- O id é o "ID da métrica" do fluxo de dados da Web no GA4 do parceiro (`G-` + letras e
-- dígitos). Não é segredo: aparece no código-fonte de qualquer página que carrega a tag. Por isso
-- mora na `location`, lido pela ficha e pelo checkout com o resto da unidade.
--
-- Por que por unidade: mesma razão do Ads. O parceiro pode ter uma propriedade por praça; quem
-- tem uma só repete o valor.
--
-- Ver docs/specs/analytics-ecommerce.md §3.2.

alter table public.location
  add column if not exists ga4_measurement_id text;

-- Formato fechado, pela lição de 18/11/2026 com o id do Ads: valor fora do formato vira tag que
-- dispara e não registra nada, em silêncio. `G-` maiúsculo, depois letras maiúsculas e dígitos.
-- Recusa o que cai aqui por confusão: `AW-...` (Ads), `GTM-...` (container), `UA-...`
-- (Universal Analytics, desligado) e o id numérico da propriedade.
alter table public.location
  drop constraint if exists location_ga4_measurement_id_format;
alter table public.location
  add constraint location_ga4_measurement_id_format
  check (ga4_measurement_id is null or ga4_measurement_id ~ '^G-[A-Z0-9]{6,}$');

comment on column public.location.ga4_measurement_id is
  'ID da métrica (`G-XXXXXXX`) do fluxo de dados da Web no GA4 do parceiro. Vai no bloco `partner` '
  'dos eventos da unidade (`view_item`, `add_to_cart`, `begin_checkout`, `add_payment_info`, '
  '`purchase`) e a tag genérica do GTM do Hub manda uma cópia do evento para esse GA4, sem dado '
  'pessoal. Nulo = só o GA4 da Movepark recebe. Só hub_admin escreve (trigger '
  'location_ga4_measurement_guard).';

-- ──────────────────── Quem configura ────────────────────
-- Mesma régua de `location_ads_conversion_guard`: esconder o campo no formulário do parceiro não
-- é permissão. Com `locations:write` ele apontaria o funil da unidade para qualquer propriedade
-- pelo PostgREST. É configuração de mídia da plataforma, então a regra mora no banco.
create or replace function public.location_ga4_measurement_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and new.ga4_measurement_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.ga4_measurement_id is not distinct from old.ga4_measurement_id then
    return new;
  end if;

  -- Sem JWT = backend (service role, migration, seed). Com JWT, só hub_admin.
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'o ID do GA4 da unidade só pode ser alterado por hub_admin'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.location_ga4_measurement_guard() from public, anon, authenticated;

drop trigger if exists location_ga4_measurement_guard on public.location;
create trigger location_ga4_measurement_guard
  before insert or update of ga4_measurement_id on public.location
  for each row execute function public.location_ga4_measurement_guard();
