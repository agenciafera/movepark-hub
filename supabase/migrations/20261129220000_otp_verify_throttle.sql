-- Freio da VERIFICAÇÃO do código de login (OTP), dentro do banco.
--
-- O freio de 07/10 (`otp_request_allowed`) segura o DISPARO do código. A
-- verificação ficou sem freio nenhum, e foi por ela que veio o ataque de
-- 14/10/2026: 1.708 tentativas de código pela tool `verify_login_otp` do MCP de
-- cliente, em 50 minutos, nenhuma barrada.
--
-- Por que o limite do próprio GoTrue não segurou: ele é por IP, e a verificação
-- do MCP sai da Edge. O GoTrue enxerga o IP da Edge (que muda a cada chamada),
-- não o do atacante. As 1.214 tentativas que o atacante fez direto em
-- `/auth/v1/verify`, com o IP dele, essas sim levaram 429.
--
-- Por isso o freio é por IDENTIFICADOR (e-mail ou telefone), que é o que o
-- atacante não troca: ele quer entrar numa conta específica. Código de 6 dígitos
-- com 5 tentativas a cada 15 minutos dá chance de 5 em 1 milhão por janela.
--
-- IP não entra no limite, só no registro: quem chega por `mcp.movepark.co` passa
-- pelo Worker, e todos esses chamadores aparecem com o mesmo IP de saída da
-- Cloudflare. Limitar por ele travaria todo mundo junto.
--
-- O identificador é guardado como SHA-256, nunca em claro, como no freio do
-- disparo. A normalização (telefone só com dígitos, e-mail em minúsculas) é feita
-- na Edge antes do hash, senão `+55 41 ...` e `5541...` virariam chaves diferentes
-- para a mesma conta.

create table if not exists public.otp_verify_log (
  id uuid primary key default gen_random_uuid(),
  identifier_hash text not null,
  ip text,
  created_at timestamptz not null default now()
);

comment on table public.otp_verify_log is
  'Janela de tentativas de verificação de OTP para o freio contra força bruta. Identificador em SHA-256, nunca em claro.';

create index if not exists otp_verify_log_hash_idx on public.otp_verify_log (identifier_hash, created_at desc);

alter table public.otp_verify_log enable row level security;
-- Sem policy: ninguém lê pela API. Só a RPC security definer e o cron tocam nela.

-- ── O freio ─────────────────────────────────────────────────────────────────
--
-- Devolve true e registra a tentativa quando ela cabe; devolve false quando não.
-- A recusada também é registrada: sem isso o atacante que estoura o limite zera a
-- janela ao parar por um instante.

create or replace function public.otp_verify_allowed(
  p_identifier_hash text,
  p_ip text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Quem erra o código digita de novo uma ou duas vezes; cinco já é folga.
  v_limite constant int := 5;
  -- Cobre a validade do código (10 min por e-mail, 5 min por WhatsApp) com sobra.
  v_janela constant interval := interval '15 minutes';
  v_tentativas int;
begin
  if p_identifier_hash is null or length(p_identifier_hash) <> 64 then
    raise exception 'Identificador inválido.' using errcode = 'P0001';
  end if;

  -- Serializa as tentativas do mesmo identificador. Sem a trava, cem chamadas em
  -- paralelo contam zero ao mesmo tempo e todas passam.
  perform pg_advisory_xact_lock(hashtextextended('otp_verify:' || p_identifier_hash, 0));

  select count(*) into v_tentativas
    from public.otp_verify_log
   where identifier_hash = p_identifier_hash
     and created_at > now() - v_janela;

  insert into public.otp_verify_log (identifier_hash, ip) values (p_identifier_hash, p_ip);

  return v_tentativas < v_limite;
end $$;

-- Default privilege do Supabase deixa função nova executável por anon; revoga
-- nominalmente, não só de public (ver docs/specs/permissions.md).
revoke all on function public.otp_verify_allowed(text, text) from public, anon, authenticated;
grant execute on function public.otp_verify_allowed(text, text) to service_role;

-- ── Limpeza ─────────────────────────────────────────────────────────────────
-- Mesma rotina e mesmo horário do log de disparo: a janela é de minutos, guardar
-- mais que um dia não serve ao freio.

create or replace function public.cron_prune_otp_request_log()
returns void language sql security definer set search_path to 'public' as $$
  delete from public.otp_request_log where created_at < now() - interval '1 day';
  delete from public.otp_verify_log where created_at < now() - interval '1 day';
$$;

revoke all on function public.cron_prune_otp_request_log() from public, anon, authenticated;
grant execute on function public.cron_prune_otp_request_log() to service_role;
