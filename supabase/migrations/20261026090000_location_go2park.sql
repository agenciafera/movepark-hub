-- Go2Park na unidade: transfer com rastreio ao vivo.
--
-- A Go2Park é o produto irmão da Movepark (o mesmo do cross-sell em
-- 20260831000000_go2park_interest.sql, que só registrava interesse no onboarding). Onde a
-- unidade tem o contrato, o passageiro acompanha a van no mapa pelo celular, sem baixar app,
-- e é avisado quando ela está chegando. Nenhum concorrente do mesmo aeroporto oferece isso,
-- então é o diferencial que o card de busca e a página da unidade passam a mostrar.
--
-- Por que coluna e não amenidade:
--   1. amenidade sai no card como pílula cinza entre "Câmeras" e "24 horas", que é o oposto
--      do destaque que o diferencial pede;
--   2. amenidade é editável pelo parceiro (operator_set_location_amenities), e o contrato com
--      a Go2Park é comercial da Movepark. Aqui só hub_admin liga (guard abaixo).
--
-- ADR-009: isto é FATO da unidade, não promessa de transação. A van tem rastreio
-- independentemente de onde a reserva fecha, e as três unidades com o contrato hoje são
-- justamente `checkout_mode = 'external'`. Ler o selo como promessa apagaria o bloco
-- exatamente de quem o tem.

alter table public.location
  add column if not exists go2park_enabled boolean not null default false;

comment on column public.location.go2park_enabled is
  'A unidade opera o transfer com a Go2Park (rastreio da van em tempo real). Fato da unidade '
  '(ADR-009), renderiza mesmo em checkout externo. Só hub_admin escreve (trigger '
  'location_go2park_guard).';

-- ──────────────────── Quem liga o selo ────────────────────
-- Esconder o campo na UI não é permissão: com `locations:write` o parceiro ligaria por
-- PostgREST sem passar por tela nenhuma, e ganharia de graça um diferencial que não contratou.
-- Mesma régua de `location_checkout_mode_guard`: a regra mora no banco.
create or replace function public.location_go2park_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and not new.go2park_enabled then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.go2park_enabled is not distinct from old.go2park_enabled then
    return new;
  end if;

  -- Sem JWT = backend (service role, migration, seed). Com JWT, só hub_admin.
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'go2park_enabled só pode ser alterado por hub_admin' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.location_go2park_guard() from public, anon, authenticated;

drop trigger if exists location_go2park_guard on public.location;
create trigger location_go2park_guard
  before insert or update of go2park_enabled on public.location
  for each row execute function public.location_go2park_guard();

-- ──────────────────── As três unidades com contrato hoje ────────────────────
-- Nationpark (Afonso Pena), Virapark (Viracopos) e Garageinn (Viracopos). Casa por slug de
-- empresa + slug de unidade porque `location.slug` só é único dentro da empresa.
update public.location l
set go2park_enabled = true
from public.company c
where c.id = l.company_id
  and l.deleted_at is null
  and (
    (c.slug = 'nationpark' and l.slug = 'aeroporto-afonso-pena')
    or (c.slug = 'virapark' and l.slug = 'virapark')
    or (c.slug = 'garageinn' and l.slug = 'aeroporto-viracopos')
  );
