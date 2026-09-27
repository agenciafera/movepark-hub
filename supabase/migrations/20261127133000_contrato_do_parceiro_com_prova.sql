-- Aceite do contrato do parceiro com prova (27/09/2026).
--
-- Antes: o texto do contrato vivia só no front (`src/features/payouts/contract.ts`), a RPC
-- `operator_accept_contract` gravava `company.contract_accepted_at` + `contract_version` e ninguém
-- conseguia provar QUAL texto foi aceito, por QUEM e de ONDE. Agora:
--
--   1. `partner_contract_version`: o texto de cada versão mora no banco, com `sha256` derivado do
--      corpo por trigger (nunca escrito à mão) e `published_at` (nulo = rascunho). A versão vigente
--      é a publicada mais recente. Texto de versão publicada não muda: publique outra.
--      Semeada com a v1, o texto exato que o front mostrava (menos a linha "Parceiro: X", que é
--      dado do aceite, não do instrumento).
--   2. `company` ganha `contract_sha256`, `contract_accepted_by` (profiles) e `contract_accepted_ip`.
--   3. `operator_accept_contract(p_company_id, p_version)` exige a versão vigente (recusa
--      desconhecida ou desatualizada), grava hash da tabela, `auth.uid()` e o primeiro endereço do
--      `x-forwarded-for` que o PostgREST expõe em `request.headers` (nulo se ausente ou inválido).
--      Devolve a prova {version, sha256, accepted_at}.
--   4. `partner_contract_current()`: o front renderiza o texto do banco, não um hardcoded.
--   5. Backfill: a empresa que aceitou a v1 antes desta migration recebe o hash da v1 (era o mesmo
--      texto). No vivo em 27/09/2026 era 1 empresa; `accepted_by`/`ip` ficam nulos (não se inventa).
--
-- O PDF do contrato aceito sai pela Edge `contract-pdf` (membro da empresa ou hub_admin), a partir
-- do corpo desta tabela. Ver docs/specs/partner-onboarding-redesign.md (nota de 27/09/2026).

create extension if not exists pgcrypto with schema extensions;

-- ── 1. Versões do contrato ───────────────────────────────────────────────────
create table if not exists public.partner_contract_version (
  version      text primary key,
  body         text not null,
  sha256       text not null,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.partner_contract_version is
  'Texto de cada versão do contrato de parceria Movepark <-> estacionamento. sha256 é derivado do corpo por trigger; a vigente é a publicada mais recente. Leitura pelo front via partner_contract_current().';
comment on column public.partner_contract_version.published_at is
  'Nulo = rascunho (não pode ser aceito). Versão publicada não muda de texto.';

alter table public.partner_contract_version enable row level security;

create or replace function public.tg_partner_contract_version_hash()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and old.published_at is not null and new.body is distinct from old.body then
    raise exception 'Versão publicada do contrato não muda de texto; publique outra versão.'
      using errcode = '23514';
  end if;
  new.sha256 := encode(extensions.digest(convert_to(new.body, 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists partner_contract_version_hash on public.partner_contract_version;
create trigger partner_contract_version_hash
  before insert or update on public.partner_contract_version
  for each row execute function public.tg_partner_contract_version_hash();

revoke all on function public.tg_partner_contract_version_hash() from public, anon, authenticated;

-- v1: o texto que `contract.ts` mostrava até 27/09/2026. O trigger calcula o sha256.
insert into public.partner_contract_version (version, body, sha256, published_at)
values ('v1', $body$CONTRATO DE PARCERIA - MOVEPARK
Versão v1

Plataforma: Movepark Tecnologia Ltda.

1. OBJETO
A Movepark divulga o estacionamento do Parceiro em sua plataforma, intermedeia as reservas
e processa os pagamentos dos clientes finais.

2. RESERVAS E PAGAMENTO
O cliente paga a reserva antecipadamente pela Movepark. O Parceiro recebe o valor das reservas
confirmadas, deduzida a comissão da Movepark, conforme o repasse combinado.

3. CONTROLE DO PARCEIRO
O Parceiro define preço de balcão, capacidade e disponibilidade de cada tipo de vaga, e pode
ajustar essas informações a qualquer momento no painel.

4. REPASSE
O repasse é feito para a conta bancária informada pelo Parceiro no cadastro de recebimento,
após a confirmação da reserva, na periodicidade combinada.

5. VIGÊNCIA E ENCERRAMENTO
A parceria vigora por prazo indeterminado. Qualquer das partes pode encerrá-la quando quiser,
respeitando as reservas já confirmadas até a data do encerramento.

6. DADOS E PRIVACIDADE
Os dados do Parceiro são tratados conforme a Política de Privacidade da Movepark e a LGPD.

7. ACEITE
Ao assinar, o Parceiro declara ter lido e concordado com este contrato.$body$, '', '2026-08-17T00:00:00Z')
on conflict (version) do nothing;

-- ── 2. Prova do aceite na empresa ────────────────────────────────────────────
alter table public.company
  add column if not exists contract_sha256 text,
  add column if not exists contract_accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists contract_accepted_ip inet;

comment on column public.company.contract_sha256 is
  'sha256 do corpo da versão aceita (copiado de partner_contract_version na hora do aceite).';
comment on column public.company.contract_accepted_by is
  'Quem aceitou (auth.uid() na RPC). Nulo nos aceites anteriores a 27/09/2026.';
comment on column public.company.contract_accepted_ip is
  'Primeiro endereço do x-forwarded-for no aceite; só auditoria. Nulo quando ausente ou inválido.';

-- Backfill: aceite anterior da v1 era do mesmo texto; só o hash é recuperável.
update public.company c
   set contract_sha256 = v.sha256
  from public.partner_contract_version v
 where v.version = c.contract_version
   and c.contract_accepted_at is not null
   and c.contract_sha256 is null;

-- ── 3. Leitura da versão vigente ─────────────────────────────────────────────
create or replace function public.partner_contract_current()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
           'version', version,
           'sha256', sha256,
           'body', body,
           'published_at', published_at
         )
    from public.partner_contract_version
   where published_at is not null
   order by published_at desc, version desc
   limit 1;
$$;

comment on function public.partner_contract_current() is
  'Versão vigente do contrato de parceria (a publicada mais recente): version, sha256, body, published_at.';

revoke all on function public.partner_contract_current() from public, anon;
grant execute on function public.partner_contract_current() to authenticated, service_role;

-- ── 4. Aceite com prova ──────────────────────────────────────────────────────
-- Drop + create: a assinatura perde o default de p_version (a versão passa a ser obrigatória).
drop function if exists public.operator_accept_contract(uuid, text);

create function public.operator_accept_contract(p_company_id uuid, p_version text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_current record;
  v_hdr     text;
  v_ip_txt  text;
  v_ip      inet;
  v_at      timestamptz := now();
begin
  if not public.is_company_owner(p_company_id) then
    raise exception 'Apenas o dono da empresa pode assinar o contrato.' using errcode = '42501';
  end if;

  select version, sha256 into v_current
    from public.partner_contract_version
   where published_at is not null
   order by published_at desc, version desc
   limit 1;

  if v_current.version is null then
    raise exception 'Não há versão publicada do contrato.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_version, '')), '') is distinct from v_current.version then
    raise exception 'Versão do contrato desconhecida ou desatualizada (vigente: %).', v_current.version
      using errcode = '22023';
  end if;

  -- IP: primeiro endereço do x-forwarded-for exposto pelo PostgREST; nulo se ausente ou inválido.
  v_hdr := nullif(current_setting('request.headers', true), '');
  if v_hdr is not null then
    begin
      v_ip_txt := nullif(trim(split_part(v_hdr::jsonb ->> 'x-forwarded-for', ',', 1)), '');
      v_ip := v_ip_txt::inet;
    exception when others then
      v_ip := null;
    end;
  end if;

  update public.company
     set contract_accepted_at = v_at,
         contract_version     = v_current.version,
         contract_sha256      = v_current.sha256,
         contract_accepted_by = auth.uid(),
         contract_accepted_ip = v_ip
   where id = p_company_id;

  return jsonb_build_object(
    'version', v_current.version,
    'sha256', v_current.sha256,
    'accepted_at', v_at
  );
end;
$$;

alter function public.operator_accept_contract(uuid, text) owner to postgres;
revoke all on function public.operator_accept_contract(uuid, text) from public, anon;
grant execute on function public.operator_accept_contract(uuid, text) to authenticated, service_role;
