-- Identidade afirmada por chamador confiável (agent-booking.md §2.1 e §4).
--
-- O bot de WhatsApp da Movepark (a Mia) fala com o cliente por um número que a
-- Meta já verificou. Pedir um OTP por WhatsApp para a mesma pessoa que já está
-- conversando pelo WhatsApp é atrito sem ganho de segurança. A tool
-- `assert_verified_identity` deixa o chamador confiável afirmar esse telefone e
-- receber a sessão do dono dele, sem código.
--
-- Como a sessão nasce. O GoTrue não cria sessão de telefone sem OTP, e não há
-- segredo de assinatura de token à mão. Então o caminho é o próprio OTP:
--   1. a tool abre uma afirmação pendente para aquele telefone (esta tabela);
--   2. pede o OTP ao GoTrue (`signInWithOtp`);
--   3. o GoTrue chama o Send SMS Hook (`send-whatsapp-otp`), que acha a
--      afirmação pendente, guarda o código aqui e NÃO manda a mensagem;
--   4. a tool lê o código (uma vez só) e troca por sessão (`verifyOtp`).
-- Tudo na mesma requisição. O cliente não recebe nada.
--
-- Decisões de produto (Kallef, 01/10/2026): telefone sem conta cria a conta, como
-- o login por WhatsApp já faz; telefone que já é login de uma conta com e-mail
-- entra nessa conta.
--
-- A tabela é também a trilha de auditoria: quem (chave) afirmou qual telefone
-- (SHA-256, nunca em claro), de qual IP, quando e com qual resultado.

-- ── Escopo ──────────────────────────────────────────────────────────────────
-- De plataforma (pertence à Movepark, só hub_admin coloca numa chave, ver
-- `api_assert_scopes`) e atribuível a chave, como o `checkout:link`.
insert into public.api_scope (scope, module, description, assignable_to_api_key, is_platform_scope) values
  ('identity:assert', 'identity',
   'Afirmar telefone já verificado pelo canal e receber a sessão do cliente, sem OTP (uso interno do bot da Movepark)',
   true, true)
on conflict (scope) do update set
  module = excluded.module,
  description = excluded.description,
  assignable_to_api_key = excluded.assignable_to_api_key,
  is_platform_scope = excluded.is_platform_scope;

-- ── Tabela ──────────────────────────────────────────────────────────────────
create table if not exists public.identity_assertion (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references public.api_key(id),
  phone_hash text not null check (length(phone_hash) = 64),
  ip text,
  -- pending: aberta, esperando o hook. captured: o hook guardou o código.
  -- succeeded / failed: terminou. rate_limited: recusada pelo freio.
  status text not null default 'pending'
    check (status in ('pending', 'captured', 'succeeded', 'failed', 'rate_limited')),
  -- O código só vive aqui entre o hook e a leitura, que o apaga.
  otp text,
  profile_id uuid,
  new_account boolean,
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 seconds',
  captured_at timestamptz,
  finished_at timestamptz
);

comment on table public.identity_assertion is
  'Afirmações de identidade por chamador confiável (identity:assert). Trilha de auditoria; telefone em SHA-256.';

create index if not exists identity_assertion_phone_idx on public.identity_assertion (phone_hash, created_at desc);
create index if not exists identity_assertion_key_idx on public.identity_assertion (api_key_id, created_at desc);

alter table public.identity_assertion enable row level security;
-- Sem policy: ninguém lê pela API. Só as RPCs abaixo (service_role) tocam nela.

-- ── Abrir ───────────────────────────────────────────────────────────────────
-- Devolve o id da afirmação, ou null quando o freio recusa. A recusa também é
-- registrada, senão quem estoura o limite zera a janela ao parar um instante.
create or replace function public.identity_assertion_begin(
  p_api_key_id uuid,
  p_phone_hash text,
  p_ip text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- A Mia guarda a sessão por conversa e só afirma de novo quando ela cai.
  -- Dez por hora para o mesmo telefone é folga de sobra para isso.
  v_limite_telefone constant int := 10;
  -- Teto por chave: contém o estrago se a chave vazar.
  v_limite_chave constant int := 300;
  v_janela constant interval := interval '1 hour';
  v_por_telefone int;
  v_por_chave int;
  v_id uuid;
begin
  if p_phone_hash is null or length(p_phone_hash) <> 64 then
    raise exception 'Telefone inválido.' using errcode = 'P0001';
  end if;

  select count(*) into v_por_telefone from public.identity_assertion
   where phone_hash = p_phone_hash and created_at > now() - v_janela;
  select count(*) into v_por_chave from public.identity_assertion
   where api_key_id = p_api_key_id and created_at > now() - v_janela;

  if v_por_telefone >= v_limite_telefone or v_por_chave >= v_limite_chave then
    insert into public.identity_assertion (api_key_id, phone_hash, ip, status, finished_at)
    values (p_api_key_id, p_phone_hash, p_ip, 'rate_limited', now());
    return null;
  end if;

  -- Só uma afirmação aberta por telefone: a anterior, se ainda aberta, morre.
  update public.identity_assertion
     set status = 'failed', otp = null, error = 'superseded', finished_at = now()
   where phone_hash = p_phone_hash and status in ('pending', 'captured');

  insert into public.identity_assertion (api_key_id, phone_hash, ip)
  values (p_api_key_id, p_phone_hash, p_ip)
  returning id into v_id;
  return v_id;
end $$;

-- ── Capturar (chamada pelo Send SMS Hook) ───────────────────────────────────
-- true = havia afirmação aberta para o telefone, o código ficou guardado e o
-- hook NÃO deve mandar mensagem. false = OTP comum, o hook manda normalmente.
create or replace function public.identity_assertion_capture(
  p_phone_hash text,
  p_otp text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  select id into v_id from public.identity_assertion
   where phone_hash = p_phone_hash and status = 'pending' and expires_at > now()
   order by created_at desc
   limit 1
   for update;
  if v_id is null then return false; end if;

  update public.identity_assertion
     set status = 'captured', otp = p_otp, captured_at = now()
   where id = v_id;
  return true;
end $$;

-- ── Ler o código (uma vez) ──────────────────────────────────────────────────
-- Devolve o código e o apaga na mesma operação. Segunda leitura devolve null.
create or replace function public.identity_assertion_take(p_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_otp text;
begin
  select otp into v_otp from public.identity_assertion
   where id = p_id and status = 'captured' and otp is not null and expires_at > now()
   for update;
  if v_otp is null then return null; end if;

  update public.identity_assertion set otp = null where id = p_id;
  return v_otp;
end $$;

-- ── Encerrar ────────────────────────────────────────────────────────────────
create or replace function public.identity_assertion_finish(
  p_id uuid,
  p_ok boolean,
  p_profile_id uuid default null,
  p_new_account boolean default null,
  p_error text default null
)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.identity_assertion
     set status = case when p_ok then 'succeeded' else 'failed' end,
         otp = null,
         profile_id = p_profile_id,
         new_account = p_new_account,
         error = left(p_error, 500),
         finished_at = now()
   where id = p_id and status in ('pending', 'captured');
$$;

-- Default privilege do Supabase deixa função nova executável por anon e
-- authenticated; revoga nominalmente (ver docs/specs/permissions.md).
revoke all on function public.identity_assertion_begin(uuid, text, text) from public, anon, authenticated;
revoke all on function public.identity_assertion_capture(text, text) from public, anon, authenticated;
revoke all on function public.identity_assertion_take(uuid) from public, anon, authenticated;
revoke all on function public.identity_assertion_finish(uuid, boolean, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.identity_assertion_begin(uuid, text, text) to service_role;
grant execute on function public.identity_assertion_capture(text, text) to service_role;
grant execute on function public.identity_assertion_take(uuid) to service_role;
grant execute on function public.identity_assertion_finish(uuid, boolean, uuid, boolean, text) to service_role;

-- ── Limpeza ─────────────────────────────────────────────────────────────────
-- Código esquecido (a tool caiu entre o hook e a leitura) não fica guardado, e a
-- trilha vale por 180 dias, prazo para responder a uma contestação de acesso.
create or replace function public.cron_prune_identity_assertion()
returns void language sql security definer set search_path to 'public' as $$
  update public.identity_assertion
     set otp = null, status = 'failed', error = coalesce(error, 'expired'), finished_at = now()
   where status in ('pending', 'captured') and expires_at < now() - interval '1 minute';
  delete from public.identity_assertion where created_at < now() - interval '180 days';
$$;

revoke all on function public.cron_prune_identity_assertion() from public, anon, authenticated;
grant execute on function public.cron_prune_identity_assertion() to service_role;

select cron.schedule(
  'prune-identity-assertion',
  '*/10 * * * *',
  $$ select public.cron_prune_identity_assertion(); $$
);
