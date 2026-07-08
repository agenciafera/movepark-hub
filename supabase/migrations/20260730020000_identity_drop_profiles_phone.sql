-- E0.10 · Identidade unificada — DROP final de profiles.phone (ADR-006).
-- Passo derradeiro: só depois de (1) triggers/RPC/edges/front pararem de ler/escrever a coluna
-- (migrations 20260730000000/…010000 + o código já no ar). A credencial mora no auth.users; o
-- contato do pedido no snapshot da booking. Ver docs/specs/customer/identity-unification.md.
alter table public.profiles drop column if exists phone;
