-- pgTAP: inventário de RLS do schema `public`. Ver database-schema.md e ADR-005.
--
-- Os outros arquivos `rls_*` provam comportamento tabela a tabela: quem lê o quê,
-- quem é recusado. Este aqui prova o contorno, e é o único que enxerga a tabela
-- criada amanhã: uma migration que esqueça o `enable row level security` deixa a
-- tabela aberta para qualquer portador da anon key, que é pública por design.
--
-- Ele nasce verde de propósito. O valor não está em achar algo hoje, está em falhar
-- no dia da migration, quando o custo de consertar ainda é um `alter table`.

begin;
select plan(4);

-- Piso de sanidade: sem ele, um schema vazio (banco meio migrado, baseline que não
-- aplicou) faria as asserções abaixo passarem sobre nada.
select cmp_ok(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'),
  '>=', 60,
  'o schema public tem pelo menos 60 tabelas (guarda contra teste vácuo)'
);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'toda tabela do schema public tem RLS ligada'
);

-- ── as fail-closed: RLS ligada e ZERO policies ───────────────────────────────
-- Zero policies não é esquecimento, é a postura mais fechada que existe: ninguém
-- passa, nem `authenticated`. Só `service_role` (que ignora RLS) alcança, ou seja,
-- só Edge Function. É o certo para segredo de login, hash de handoff, saldo e fila.
--
-- A lista é EXATA nos dois sentidos, e é essa a graça:
--   entrar sem estar aqui  → tabela nova sem policy, provavelmente esquecimento;
--   sair daqui             → alguém deu policy para o OTP, e isso é incidente.
select set_eq(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid) $$,
  array[
    'identifier_otp',        -- código de login: quem lê, entra como a vítima
    'checkout_handoff',      -- hash do handoff, mesmo risco
    'wallet_ledger',         -- saldo; escrita de fora cunharia moeda
    'payment_webhook_event', -- evento cru do gateway
    'partner_lead',          -- lead entra por Edge, nunca direto do formulário
    'knowledge_chunk',       -- base do RAG
    'knowledge_source_queue' -- fila de ingestão da base
  ],
  'as tabelas fail-closed são exatamente estas sete'
);

-- ── nenhuma escrita passa com predicado trivial ──────────────────────────────
-- Uma policy de escrita com `using (true)` ou `with check (true)` tem a aparência de
-- proteção e o efeito de nenhuma. É o jeito mais comum de a RLS ficar frouxa sem que
-- ninguém perceba, porque a tabela continua listada como protegida.
select is(
  (select count(*)::int
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polcmd <> 'r'
      and (pg_get_expr(p.polqual, p.polrelid) = 'true'
           or pg_get_expr(p.polwithcheck, p.polrelid) = 'true'
           or (p.polqual is null and p.polwithcheck is null))),
  0,
  'nenhuma policy de escrita passa com predicado trivial'
);

select * from finish();
rollback;
