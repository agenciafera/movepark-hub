-- Tolerância de saída em minutos (86ajp6vrq).
--
-- As bases de conhecimento citam "1 hora de tolerância" na saída: passou disso, cobra taxa.
-- Hoje a engine não conhece esse dado. A contagem de diárias arredonda QUALQUER excedente
-- para cima:
--     v_days := greatest(1, ceil(v_total_minutes / (60 * 24)));
-- ou seja, 3 dias e 10 minutos viram 4 diárias. A tolerância é justamente o excedente que
-- não vira diária nova.
--
-- Modelo: `location.tolerance_minutes`, **default 0**. O default preserva o comportamento
-- atual de todas as unidades (nenhum preço muda com esta migration); o parceiro liga a
-- tolerância por unidade (60 para "1 hora"). Os casos golden de docs/simulacao-precos.md
-- passam por `simulate_price(dias)`, que recebe o número de dias já contado, então não são
-- afetados por esta mudança.
--
-- Escopo do patch: as duas funções que calculam DIÁRIA COBRADA a partir das datas,
-- `_create_booking_core` (criação) e `reprice_booking_dates` (troca de datas). Ficam de fora,
-- de propósito, `check_availability` (capacidade por data, não preço) e `validate_coupon*`
-- (elegibilidade por dias mínimos): mexer nelas mudaria semântica sem relação com tolerância.
--
-- O patch é CIRÚRGICO: lê a definição viva, troca só a linha do v_days e aborta se o padrão
-- não bater. Recriar a função inteira a partir de um corpo colado aqui é a armadilha que já
-- derrubou o overlay de preço por unidade (ver 86ajmwhdk).

alter table public.location
  add column if not exists tolerance_minutes int not null default 0;

alter table public.location
  drop constraint if exists location_tolerance_minutes_nonneg;
alter table public.location
  add constraint location_tolerance_minutes_nonneg check (tolerance_minutes >= 0);

comment on column public.location.tolerance_minutes is
  'Minutos de tolerância na saída antes de virar diária nova. Default 0 (sem tolerância). Consumido por _create_booking_core e reprice_booking_dates. Ver 86ajp6vrq.';

do $mig$
declare
  v_def text;
  v_old text;
  v_new text;
  v_count int;
begin
  ----------------------------------------------------------------------------
  -- 1) _create_booking_core (criação da reserva)
  ----------------------------------------------------------------------------
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_create_booking_core' and p.prokind = 'f';
  if v_count <> 1 then
    raise exception 'Esperava exatamente 1 _create_booking_core, achei %. Abortado.', v_count;
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_create_booking_core' and p.prokind = 'f';

  v_old := 'v_days := greatest(1, ceil(v_total_minutes::numeric / (60 * 24))::int);';
  v_new := 'v_days := greatest(1, ceil((v_total_minutes - coalesce((select l.tolerance_minutes '
        || 'from public.location l where l.id = v_location_id), 0))::numeric / (60 * 24))::int);';

  if position(v_old in v_def) = 0 then
    raise exception 'Patch da tolerância: linha do v_days não encontrada em _create_booking_core. Abortado para não recriar a função de uma versão antiga.';
  end if;

  execute replace(v_def, v_old, v_new);

  ----------------------------------------------------------------------------
  -- 2) reprice_booking_dates (troca de datas reprecifica pela mesma regra)
  ----------------------------------------------------------------------------
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reprice_booking_dates' and p.prokind = 'f';
  if v_count <> 1 then
    raise exception 'Esperava exatamente 1 reprice_booking_dates, achei %. Abortado.', v_count;
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reprice_booking_dates' and p.prokind = 'f';

  -- Nota: aqui a fórmula viva NÃO tem o cast ::numeric que a de criação tem.
  v_old := 'v_days := greatest(1, ceil(v_total_minutes / (60 * 24))::int);';
  v_new := 'v_days := greatest(1, ceil((v_total_minutes - coalesce((select l.tolerance_minutes '
        || 'from public.location l where l.id = v_location_id), 0)) / (60 * 24))::int);';

  if position(v_old in v_def) = 0 then
    raise exception 'Patch da tolerância: linha do v_days não encontrada em reprice_booking_dates. Abortado.';
  end if;

  execute replace(v_def, v_old, v_new);
end
$mig$;
