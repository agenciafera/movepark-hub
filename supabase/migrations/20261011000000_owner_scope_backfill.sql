-- O pacote do Dono era um retrato, e retrato envelhece (ADR-005).
--
-- Em `20260713000000_permission_scopes.sql` o pacote do Dono foi semeado com
-- `select 'owner', scope from public.api_scope`, o que valia no dia. Só que a regra do
-- ADR-005 não é "o Dono tem os escopos que existiam em 13/07": é **o Dono tem todos os
-- escopos de empresa**. Todo escopo criado depois entrou no catálogo e não entrou no
-- pacote, em silêncio.
--
-- Achado em 11/08/2026 pelo pgTAP `permissions.test.sql` (asserção 7), assim que o job
-- `db` do CI voltou a rodar: 31 escopos de empresa no catálogo, 30 no pacote do Dono.
-- O que faltava era `blog:read`, criado em `20261001010000_blog_api_scopes.sql`.
-- Conferido no banco vivo: a produção tinha exatamente a mesma falta, então isto não é
-- divergência de stack, é um dono real sem um escopo real.
--
-- Consequência prática de faltar: `member_has_scope` lê o PACOTE DO PAPEL, não o
-- catálogo. Um dono sem `blog:read` no pacote é recusado numa escrita gateada por esse
-- escopo, mesmo sendo dono. Não foi o caso aqui porque `blog:read` é leitura de conteúdo
-- público, mas o próximo escopo esquecido pode ser de escrita.
--
-- O backfill é por REGRA, não por lista, e é idempotente: rodar de novo não faz nada, e
-- ele conserta qualquer escopo que tenha ficado para trás, não só o `blog:read`.
--
-- `is_platform_scope` fica de fora, e é o desenho: escopo de plataforma pertence à
-- Movepark, não a empresa nenhuma. O trigger `company_role_scope_no_platform` recusaria
-- de qualquer jeito, e é por isso que `blog:write` não aparece aqui.
--
-- O guarda contra a próxima vez continua sendo a asserção 7 do pgTAP: escopo novo sem
-- pacote quebra o CI, que é onde essa conversa é barata.

-- Dono: todos os escopos de empresa, sem exceção.
insert into public.company_role_scope (role, scope)
select 'owner', s.scope
from public.api_scope s
where not s.is_platform_scope
on conflict (role, scope) do nothing;

-- Gerente: a mesma regra que a migration original escreveu, ou seja, tudo menos gerir
-- usuário, gerir chave e mover dinheiro. Operação e Financeiro não entram: os pacotes
-- deles são lista fechada por desenho, e crescer sozinho seria escalada de privilégio.
insert into public.company_role_scope (role, scope)
select 'manager', s.scope
from public.api_scope s
where not s.is_platform_scope
  and s.scope not in ('team:write', 'api-keys:write', 'payouts:write')
on conflict (role, scope) do nothing;
