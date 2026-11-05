-- Conversão do Google Ads por unidade.
--
-- O container GTM do site (`GTM-KHBBZT9`) é um só para todos os parceiros, e uma tag de conversão
-- do Google Ads pertence a UMA conta (`AW-xxx`) e a UMA ação de conversão (o rótulo). Até aqui, a
-- tag do Virapark disparava em toda compra do site, de qualquer parceiro, porque o acionador não
-- tinha condição nenhuma: a conta de Ads dele contava venda da Abbapark como conversão própria.
--
-- A saída é o de para morar no cadastro da unidade, e não numa tabela do GTM: a unidade guarda o
-- id da conta e o rótulo da ação de conversão, o front manda os dois no bloco `partner` do
-- `purchase` (ver docs/specs/analytics-ecommerce.md §3.1), e UMA tag genérica no GTM lê deles.
-- Parceiro novo passa a ser dois campos preenchidos no Manager, sem ninguém abrir o GTM.
--
-- Por que por unidade, e não por empresa: o parceiro pode ter uma conta de Ads por praça (campanha
-- de Viracopos separada da de Guarulhos), e a conversão precisa cair na conta que paga a campanha.
-- Empresa com uma conta só repete os mesmos valores em cada unidade.
--
-- Os dois valores não são segredo: já aparecem no código-fonte de qualquer página com a tag. Por
-- isso ficam na `location`, lidos pelo checkout com o resto da unidade, e não no Vault.

alter table public.location
  add column if not exists ads_conversion_id text,
  add column if not exists ads_conversion_label text;

-- O id de conversão do Google Ads tem a forma `AW-` + dígitos; o rótulo é a parte depois da barra
-- no snippet (`AW-123/AbCd...`), letras, dígitos, `-` e `_`. Texto fora disso aqui viraria tag que
-- dispara e não registra nada, em silêncio, e ninguém descobriria antes do fim da campanha.
alter table public.location
  drop constraint if exists location_ads_conversion_id_format;
alter table public.location
  add constraint location_ads_conversion_id_format
  check (ads_conversion_id is null or ads_conversion_id ~ '^AW-[0-9]{6,}$');

alter table public.location
  drop constraint if exists location_ads_conversion_label_format;
alter table public.location
  add constraint location_ads_conversion_label_format
  check (ads_conversion_label is null or ads_conversion_label ~ '^[A-Za-z0-9_-]{4,}$');

-- Os dois andam juntos: id sem rótulo (ou rótulo sem id) não dispara conversão nenhuma, e deixar
-- metade preenchida faria a tela parecer configurada quando não está.
alter table public.location
  drop constraint if exists location_ads_conversion_pair;
alter table public.location
  add constraint location_ads_conversion_pair
  check ((ads_conversion_id is null) = (ads_conversion_label is null));

comment on column public.location.ads_conversion_id is
  'Id da conta do Google Ads (`AW-xxx`) que recebe a conversão de compra desta unidade. Vai no '
  'bloco `partner` do evento `purchase` e a tag genérica do GTM lê daqui. Nulo = nenhuma conta de '
  'parceiro recebe conversão desta unidade (a da Movepark recebe sempre). Só hub_admin escreve '
  '(trigger location_ads_conversion_guard).';

comment on column public.location.ads_conversion_label is
  'Rótulo da ação de conversão no Google Ads do parceiro (a parte depois da barra no snippet). '
  'Sempre acompanha `ads_conversion_id`; constraint recusa um sem o outro.';

-- ──────────────────── Quem configura ────────────────────
-- Esconder os campos no formulário do parceiro não é permissão: com `locations:write` ele
-- apontaria a conversão da unidade para qualquer conta pelo PostgREST. É configuração de mídia
-- paga da plataforma, então vale a mesma régua de `location_checkout_mode_guard` e
-- `location_go2park_guard`: a regra mora no banco.
create or replace function public.location_ads_conversion_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
     and new.ads_conversion_id is null
     and new.ads_conversion_label is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.ads_conversion_id is not distinct from old.ads_conversion_id
     and new.ads_conversion_label is not distinct from old.ads_conversion_label then
    return new;
  end if;

  -- Sem JWT = backend (service role, migration, seed). Com JWT, só hub_admin.
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'a conversão do Google Ads da unidade só pode ser alterada por hub_admin'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.location_ads_conversion_guard() from public, anon, authenticated;

drop trigger if exists location_ads_conversion_guard on public.location;
create trigger location_ads_conversion_guard
  before insert or update of ads_conversion_id, ads_conversion_label on public.location
  for each row execute function public.location_ads_conversion_guard();

-- ──────────────────── Virapark ────────────────────
-- A única conta de parceiro configurada no GTM hoje (tag `[Virapark] Purchase`, sem condição).
-- Com o par gravado aqui, a tag genérica passa a cobrir o Virapark e a tag específica pode ser
-- pausada. Casa por slug de empresa + slug de unidade porque `location.slug` só é único dentro
-- da empresa.
update public.location l
set ads_conversion_id = 'AW-326904374',
    ads_conversion_label = 'EaA6CMu82aYbELbU8JsB'
from public.company c
where c.id = l.company_id
  and l.deleted_at is null
  and c.slug = 'virapark'
  and l.slug = 'virapark'
  and l.ads_conversion_id is null;
