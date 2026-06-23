-- Permissões por escopo (ADR-005) — passo A: novos valores do enum company_role.
-- Hoje company_role = ('owner','operator'). Os 4 presets fixos são:
--   owner = Dono · operator = Operação (reusado, sem migração de dados) · manager = Gerente · finance = Financeiro.
-- CRÍTICO: Postgres não permite usar um valor de enum novo na MESMA transação em que
-- ele é adicionado. Por isso estes ADD VALUE ficam SOZINHOS neste arquivo — o seed dos
-- presets (que referencia 'manager'/'finance') mora na migration B, já noutra transação.
-- `if not exists` torna idempotente.

alter type public.company_role add value if not exists 'manager';
alter type public.company_role add value if not exists 'finance';
