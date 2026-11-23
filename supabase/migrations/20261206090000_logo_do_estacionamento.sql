-- Logo do estacionamento na jornada de compra, no e-mail e no voucher (23/11/2026).
-- Spec: docs/specs/logo-do-estacionamento.md. Card: ClickUp 17tn9ea435c.
--
-- Por quê: o cliente da Pare Seguro via só a marca Movepark e confundia com o Movepark
-- Estacionamento, também em Guarulhos. O hub continua centralizado, e o logo de quem opera a vaga
-- entra de forma discreta no checkout, na reserva, no e-mail de confirmação e no voucher.
--
-- Modelo:
--   - `company.logo_url` (já existia, nunca preenchido) passa a ser o logo para FUNDO CLARO.
--   - `company.logo_dark_url` é o logo para FUNDO ESCURO (o topo do e-mail é violeta, com símbolo
--     branco da Movepark).
--   - `location.logo_url` / `location.logo_dark_url` trocam o da empresa só naquela unidade, para o
--     caso de uma unidade operar com outra marca. Nulo = segue o da empresa.
--   A resolução (unidade antes da empresa, cada fundo por conta própria) mora em
--   `src/lib/parkingLogo.ts` e em `supabase/functions/_shared/voucher/fields.ts`.
--
-- Formato: só PNG ou JPG em https. O e-mail não mostra SVG no Gmail e o pdf-lib do voucher só
-- embute PNG e JPG; aceitar outro formato faria o logo sumir em dois dos quatro lugares.
-- Idempotente (o `db push` reaplica arquivos que o remoto registrou com outro carimbo).

alter table public.company add column if not exists logo_dark_url text;
alter table public.location add column if not exists logo_url text;
alter table public.location add column if not exists logo_dark_url text;

comment on column public.company.logo_url is
  'Logo da empresa para fundo claro (PNG/JPG https). Aparece no checkout, na reserva, no e-mail e no voucher.';
comment on column public.company.logo_dark_url is
  'Logo da empresa para fundo escuro (PNG/JPG https), usado no topo do e-mail de confirmação.';
comment on column public.location.logo_url is
  'Troca o logo de fundo claro da empresa só nesta unidade. Nulo = usa company.logo_url.';
comment on column public.location.logo_dark_url is
  'Troca o logo de fundo escuro da empresa só nesta unidade. Nulo = usa company.logo_dark_url.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_logo_url_formato') then
    alter table public.company add constraint company_logo_url_formato
      check (logo_url is null or logo_url ~* '^https://[^ ]+\.(png|jpe?g)$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_logo_dark_url_formato') then
    alter table public.company add constraint company_logo_dark_url_formato
      check (logo_dark_url is null or logo_dark_url ~* '^https://[^ ]+\.(png|jpe?g)$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'location_logo_url_formato') then
    alter table public.location add constraint location_logo_url_formato
      check (logo_url is null or logo_url ~* '^https://[^ ]+\.(png|jpe?g)$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'location_logo_dark_url_formato') then
    alter table public.location add constraint location_logo_dark_url_formato
      check (logo_dark_url is null or logo_dark_url ~* '^https://[^ ]+\.(png|jpe?g)$');
  end if;
end $$;

-- `company` tem privilégio por coluna (20261129090500): coluna nova não é lida por ninguém até
-- ser concedida. O logo é público como o de fundo claro (a vitrine e o checkout o mostram).
-- `location` tem SELECT de tabela, então as duas colunas novas já saem para anon e authenticated.
grant select (logo_dark_url) on public.company to anon, authenticated;
