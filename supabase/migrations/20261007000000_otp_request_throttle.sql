-- Freio de disparo de OTP, dentro do banco.
--
-- O freio que existia morava no Cloudflare Worker e só valia para o path
-- `/customer` do `mcp.movepark.co`. Ele é contornável: a Edge é `verify_jwt =
-- false`, o ref do projeto é público, e a própria Edge `chat` já chama a URL
-- crua do Supabase. Medido em 11/08/2026: seis disparos seguidos na URL crua não
-- encostaram em freio nenhum do worker.
--
-- O que o GoTrue já cobre (também medido): 60 segundos entre disparos para o
-- MESMO identificador. O que ele não cobre é volume ENTRE identificadores: um
-- chamador anônimo dispara para mil números diferentes, um cada, e com
-- `shouldCreateUser: true` cria uma conta em `auth.users` por número. Confirmado:
-- uma chamada anônima criou a conta da sonda.
--
-- Este freio fecha essa lacuna, e mora no banco porque é o único ponto que todos
-- os caminhos atravessam.
--
-- O identificador é guardado como SHA-256, nunca em claro: telefone e e-mail de
-- quem tenta entrar não precisam existir numa segunda tabela para o freio
-- funcionar.

create table if not exists public.otp_request_log (
  id uuid primary key default gen_random_uuid(),
  identifier_hash text not null,
  ip text,
  created_at timestamptz not null default now()
);

comment on table public.otp_request_log is
  'Janela de disparos de OTP para o freio de custo. Identificador em SHA-256, nunca em claro.';

create index if not exists otp_request_log_ip_idx on public.otp_request_log (ip, created_at desc);
create index if not exists otp_request_log_hash_idx on public.otp_request_log (identifier_hash, created_at desc);

alter table public.otp_request_log enable row level security;
-- Sem policy: ninguém lê pela API. Só a RPC security definer e o cron tocam nela.

-- ── O freio ─────────────────────────────────────────────────────────────────
--
-- Devolve true e registra a tentativa quando ela cabe; devolve false quando não.
-- Registrar a tentativa recusada também é de propósito: sem isso o atacante que
-- estoura o limite zera a janela ao parar por um instante.

create or replace function public.otp_request_allowed(
  p_identifier_hash text,
  p_ip text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Um identificador legítimo não precisa de mais que isto: quem erra o código
  -- pede de novo, não dez vezes por hora.
  v_limite_identificador constant int := 5;
  -- Por IP a folga é maior, porque uma casa ou um escritório sai por um IP só.
  v_limite_ip constant int := 20;
  v_janela constant interval := interval '1 hour';
  v_por_identificador int;
  v_por_ip int;
begin
  if p_identifier_hash is null or length(p_identifier_hash) <> 64 then
    raise exception 'Identificador inválido.' using errcode = 'P0001';
  end if;

  select count(*) into v_por_identificador
    from public.otp_request_log
   where identifier_hash = p_identifier_hash
     and created_at > now() - v_janela;

  v_por_ip := 0;
  if p_ip is not null then
    select count(*) into v_por_ip
      from public.otp_request_log
     where ip = p_ip
       and created_at > now() - v_janela;
  end if;

  insert into public.otp_request_log (identifier_hash, ip) values (p_identifier_hash, p_ip);

  return v_por_identificador < v_limite_identificador and v_por_ip < v_limite_ip;
end $$;

-- Default privilege do Supabase deixa função nova executável por anon; revoga
-- nominalmente, não só de public (ver docs/specs/permissions.md).
revoke all on function public.otp_request_allowed(text, text) from public, anon, authenticated;
grant execute on function public.otp_request_allowed(text, text) to service_role;

-- ── Limpeza ─────────────────────────────────────────────────────────────────
-- A janela é de uma hora; guardar mais que um dia não serve ao freio e vira
-- retenção de dado sem propósito. Mesmo molde de `cron_prune_api_request_log`.

create or replace function public.cron_prune_otp_request_log()
returns void language sql security definer set search_path to 'public' as $$
  delete from public.otp_request_log where created_at < now() - interval '1 day';
$$;

revoke all on function public.cron_prune_otp_request_log() from public, anon, authenticated;
grant execute on function public.cron_prune_otp_request_log() to service_role;

-- Agenda a limpeza, no mesmo molde do prune do log de API. Horário deslocado
-- para não competir com o `prune-api-request-log` das 4h17.
select cron.schedule(
  'prune-otp-request-log',
  '32 4 * * *',
  $$ select public.cron_prune_otp_request_log(); $$
);
