-- F3 · Handoff de checkout (reserva por agente). Ver docs/specs/customer/agent-booking.md §6.
--
-- Um agente cria a reserva pelo MCP e entrega um link de uso único que faz o usuário cair LOGADO
-- no checkout, direto no passo de pagamento. Este é o token do link: molde do ciclo de vida do
-- identifier_otp (uso único + expiração) e da forma do segredo do api_key (prefixo indexado +
-- sha256). Nada de policy: só o service_role (as Edges create/redeem) toca. O par de tokens de
-- sessão é guardado aqui e devolvido UMA vez no resgate; é apagado ao consumir (não fica em repouso).

create table if not exists public.checkout_handoff (
  id            uuid primary key default gen_random_uuid(),
  token_prefix  text not null unique,           -- 16 primeiros chars, indexado para lookup
  token_hash    text not null,                  -- sha256 hex do segredo completo (nunca o segredo)
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  booking_id    uuid not null references public.booking(id) on delete cascade,
  access_token  text,                            -- sessão do usuário (apagada ao consumir)
  refresh_token text,                            -- idem
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists checkout_handoff_prefix on public.checkout_handoff (token_prefix);
create index if not exists checkout_handoff_expiry on public.checkout_handoff (expires_at)
  where consumed_at is null;

alter table public.checkout_handoff enable row level security;
-- Sem policies: RLS ligada + zero policies = só service_role acessa (o segredo não é do dono ler).

-- Consumo ATÔMICO (uso único, sem corrida): marca consumed_at só se ainda não consumido e não expirou,
-- captura os tokens, e os apaga da linha antes de retornar (não ficam em repouso após o uso).
create or replace function public.checkout_handoff_redeem(p_prefix text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_booking uuid;
  v_access text;
  v_refresh text;
  v_code text;
begin
  update public.checkout_handoff h
  set consumed_at = now()
  where h.token_prefix = p_prefix
    and h.token_hash = p_hash
    and h.consumed_at is null
    and h.expires_at > now()
  returning h.id, h.booking_id, h.access_token, h.refresh_token
  into v_id, v_booking, v_access, v_refresh;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_used');
  end if;

  -- Apaga os tokens da linha consumida (não deixa credencial em repouso).
  update public.checkout_handoff set access_token = null, refresh_token = null where id = v_id;

  select code into v_code from public.booking where id = v_booking;

  return jsonb_build_object(
    'ok', true,
    'booking_code', v_code,
    'access_token', v_access,
    'refresh_token', v_refresh
  );
end;
$$;

revoke all on function public.checkout_handoff_redeem(text, text) from public, anon, authenticated;
grant execute on function public.checkout_handoff_redeem(text, text) to service_role;

-- Purga linhas expiradas/consumidas (o identifier_otp só acumulava; aqui limpamos).
create or replace function public.cron_prune_checkout_handoff()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  delete from public.checkout_handoff
  where expires_at < now() - interval '1 day' or consumed_at is not null;
  get diagnostics n = row_count;
  return n;
end; $$;

revoke all on function public.cron_prune_checkout_handoff() from public, anon, authenticated;
grant execute on function public.cron_prune_checkout_handoff() to service_role;

select cron.schedule('prune-checkout-handoff', '17 * * * *',
  $$ select public.cron_prune_checkout_handoff(); $$);
