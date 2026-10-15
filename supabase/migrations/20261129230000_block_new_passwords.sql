-- Nenhuma senha nova em auth.users: fecha o pré-sequestro de conta.
--
-- O Hub é passwordless (ADR-006: código por e-mail, código por WhatsApp e
-- Google). O GoTrue, porém, continua aceitando `/auth/v1/signup` com senha, e não
-- há chave no painel que desligue só o login por senha.
--
-- O risco que isso deixa, mesmo com a confirmação de e-mail ligada (15/10/2026):
-- alguém cadastra o e-mail de um cliente com uma senha dele. A conta fica
-- pendente. Quando o cliente entra pelo código, o GoTrue confirma a conta, e a
-- senha plantada passa a valer: quem plantou entra na conta do cliente.
--
-- Medido em 15/10/2026 em `auth.mfa_amr_claims`: nenhum cliente real entra por
-- senha. As sessões por senha são do atacante de 14/10, de contas de teste e a
-- sessão interna que o GoTrue abre ao criar conta pelo código (que ele não entrega
-- a ninguém).
--
-- O gatilho apaga a senha de toda conta nova e de toda troca de senha. Senhas que
-- já existiam ficam como estão (decisão de 15/10/2026): o apagão só acontece
-- quando o valor muda, porque o GoTrue regrava a linha inteira em eventos comuns
-- (login, confirmação) e um `update of encrypted_password` sem essa comparação
-- apagaria as senhas antigas no primeiro login.
--
-- Senha vazia ('') é a convenção do próprio GoTrue para "conta sem senha" (é o
-- que ele grava nas contas do Google), e o login por senha recusa.

create or replace function public.auth_block_new_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.encrypted_password, '') = '' then
    return new;
  end if;

  if tg_op = 'INSERT' or new.encrypted_password is distinct from old.encrypted_password then
    new.encrypted_password := '';
  end if;

  return new;
end $$;

-- Função de gatilho: ninguém a chama pela API. O Postgres só confere EXECUTE ao
-- criar o gatilho, então o GoTrue (`supabase_auth_admin`) dispara sem grant,
-- como já acontece com `handle_new_auth_user`.
revoke all on function public.auth_block_new_password() from public, anon, authenticated;

drop trigger if exists block_new_password on auth.users;
create trigger block_new_password
  before insert or update of encrypted_password on auth.users
  for each row execute function public.auth_block_new_password();
