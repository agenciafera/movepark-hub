-- RLS da blog_post_redirect no repositório (19/10/2026).
--
-- A tabela nasceu em 20261006120000_seo_cannibalization_consolidation.sql sem
-- `enable row level security`; no banco vivo a RLS foi ligada fora de migration. O banco
-- limpo do CI (`supabase db reset`) ficava com a tabela aberta e o inventário de RLS
-- (supabase/tests/rls_inventory.test.sql) reprovava. Sem policy de propósito: o mapa de
-- slug antigo do blog é lido só pela RPC `url_legacy_map` (security definer).
-- No-op em produção.

alter table public.blog_post_redirect enable row level security;
