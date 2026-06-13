# Testes pgTAP (banco)

Testes de regra de negócio no Postgres (motor de preço, RPCs de onboarding, RLS).
Rodam em transação com rollback (não sujam dados).

```bash
supabase start      # sobe o stack local (uma vez)
bun run test:db     # = supabase test db  → roda supabase/tests/*.test.sql
```

O stack local é construído a partir do **baseline** (`supabase/migrations/20260101000000_baseline_from_live.sql`,
dump fiel do banco vivo) + **seed** (`supabase/seed.sql`, só catálogo/pricing, sem dados de cliente).
Por isso o schema e os dados de preço batem com produção.

## Arquivos
- `pricing.test.sql` — motor de preço (`simulate_price`), valores golden de `docs/simulacao-precos.md`,
  cobrindo as 7 estratégias + flips ⚠️ + a regressão do BUG-001. Espelha `test/pricing/cases.ts`.
- `onboarding_rpc.test.sql` — cadeia de RPCs do onboarding (lead → wizard → go-live) + `slugify`/slug único.
- `storage_buckets.test.sql` — OPS-05: visibilidade dos buckets (`assets-public` público; `vouchers`/`partner-uploads` privados) e RLS de `storage.objects` (escopo por prefixo `company_id`, admin vê tudo, anon não escreve/lê privado).

## Nota sobre o histórico de migrations
O repo foi **rebaselineado** a partir do banco vivo (o histórico anterior estava divergente — várias
migrations aplicadas direto via MCP/dashboard, nunca commitadas). O banco continua sendo a fonte da
verdade. Se um dia for usar `supabase db push`, o histórico remoto (`supabase_migrations.schema_migrations`,
~39 linhas) precisa de um `supabase migration repair` para refletir só o baseline — passo de metadata,
feito sob demanda.
