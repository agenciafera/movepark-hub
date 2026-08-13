-- Leitura pública do `app_setting` é por chave marcada, nunca por tabela.
--
-- O risco que este arquivo tranca: a home precisa de UM número do `app_setting`,
-- e a saída preguiçosa seria abrir a tabela para `anon`. A tabela guarda o
-- recebedor master do split, o remetente de e-mail e o prompt do chatbot, então
-- uma policy sem filtro vazaria tudo isso para qualquer visitante.

begin;
select plan(7);

-- ── A coluna existe e protege por default ───────────────────────────────────
select has_column('public', 'app_setting', 'is_public', 'app_setting tem is_public');

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'app_setting' and column_name = 'is_public'),
  'false',
  'chave nova nasce privada'
);

-- ── Massa de teste: uma pública, uma privada ────────────────────────────────
insert into public.app_setting (key, value, is_public)
values ('zz_teste_publica', '42', true), ('zz_teste_privada', 'segredo', false);

-- ── anon lê só o que está marcado ───────────────────────────────────────────
set local role anon;

select is(
  (select value from public.app_setting where key = 'zz_teste_publica'),
  '42',
  'anon lê a chave marcada como pública'
);

select is(
  (select count(*)::int from public.app_setting where key = 'zz_teste_privada'),
  0,
  'anon não enxerga chave privada'
);

-- A chave real da home, que é o motivo da migration existir.
select is(
  (select count(*)::int from public.app_setting where key = 'social_proof_customers'),
  1,
  'anon lê o contador de clientes da home'
);

-- Nenhuma das chaves sensíveis pode aparecer para quem não está logado.
select is(
  (select count(*)::int from public.app_setting
    where key in ('pagarme_movepark_recipient_id', 'partner_email_from', 'chatbot_system_prompt')),
  0,
  'anon não enxerga recebedor do split, remetente nem prompt do chatbot'
);

-- ── Ler não é escrever ──────────────────────────────────────────────────────
-- A policy nova é só de SELECT. Sem policy de UPDATE para `anon`, a escrita não
-- acha linha e afeta zero, em vez de trocar o número do selo da home.
update public.app_setting set value = '999999' where key = 'social_proof_customers';
select is(
  (select count(*)::int from public.app_setting where key = 'social_proof_customers' and value = '999999'),
  0,
  'anon não escreve na chave pública'
);

rollback;
