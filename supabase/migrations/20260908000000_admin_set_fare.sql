-- Editor global de tarifas no /manager (ClickUp 86ajnxeym).
-- Decisão de 23/07: as tarifas de flexibilidade (Básica/Flex/Superflex) são da
-- plataforma, geridas só pelo Super Admin. Nunca da unidade. É onde a plataforma
-- ganha dinheiro. Esta migration cria a RPC de escrita da tabela global
-- `public.fare`, gateada por is_hub_admin() no servidor (ADR-005), e fecha a
-- escrita direta da tabela: só a RPC escreve.
--
-- A RLS `fare_admin_write` (is_hub_admin) já existia (20260903000000). Aqui a
-- escrita passa a fluir SÓ pela RPC security-definer, e os grants de escrita que
-- anon/authenticated tinham por default privilege são revogados (a RLS já
-- barrava; isto é defesa em profundidade e menos superfície, E0.6).

-- p_cancel_window_minutes vem por último com DEFAULT NULL: é o único campo que
-- aceita nulo (null = sem cancelamento grátis), e o padrão do projeto é omitir o
-- argumento no client (undefined) em vez de mandar null cru.
create or replace function public.admin_set_fare(
  p_tier                  public.fare_tier,
  p_price_cents           integer,
  p_is_active             boolean,
  p_is_popular            boolean,
  p_label                 text,
  p_sort_order            integer,
  p_benefits              jsonb,
  p_cancel_window_minutes integer default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Gate no servidor, não só na UI: mesmo um operador impersonando não passa.
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark edita as tarifas.' using errcode = '42501';
  end if;

  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'Preço inválido.' using errcode = 'P0001';
  end if;
  if p_cancel_window_minutes is not null and p_cancel_window_minutes < 0 then
    raise exception 'Janela de cancelamento inválida.' using errcode = 'P0001';
  end if;

  update public.fare set
    -- Básica é sempre grátis, regra de produto: o preço dela não é editável.
    price_cents           = case when p_tier = 'basica' then 0 else p_price_cents end,
    cancel_window_minutes = p_cancel_window_minutes,
    is_active             = coalesce(p_is_active, true),
    is_popular            = coalesce(p_is_popular, false),
    label                 = coalesce(nullif(trim(p_label), ''), label),
    sort_order            = coalesce(p_sort_order, sort_order),
    benefits              = coalesce(p_benefits, benefits),
    updated_at            = now()
  where tier = p_tier;

  if not found then
    raise exception 'Tarifa não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

-- Só a RPC (definer) escreve na tabela global. Leitura segue pública (fare_select).
revoke insert, update, delete on public.fare from anon, authenticated;

-- `from public, anon`: o Supabase concede EXECUTE a anon por default privilege, e
-- revoke de public sozinho não tira (ver a armadilha do grant default de anon).
-- Escrita de tarifa nunca é anônima; só authenticated + gate is_hub_admin no corpo.
revoke all on function public.admin_set_fare(
  public.fare_tier, integer, boolean, boolean, text, integer, jsonb, integer
) from public, anon;
grant execute on function public.admin_set_fare(
  public.fare_tier, integer, boolean, boolean, text, integer, jsonb, integer
) to authenticated;
