# Segurança — scan recorrente (E0.6)

Rotina que verifica a postura de segurança do Hub e abre item quando algo regride. O Hub move
pagamento, dados de cliente e KYC de parceiro — pegar regressão cedo é barato; em produção
transacional é caro.

## Camadas

| Camada | Ferramenta | Onde roda |
|---|---|---|
| Dependências | `bun audit` | CI (`.github/workflows/security-scan.yml`, job `dependencies`) |
| Secret scanning | `gitleaks` (config `.gitleaks.toml`) | CI (job `secrets`) — varre histórico |
| Supabase advisors | Management API `/advisors/security` | CI (job `supabase-advisors`, se `SUPABASE_ACCESS_TOKEN` setado) |
| Headers de deploy | `public/_headers` (Cloudflare) | revisão manual + a cada deploy |

## Quando roda

- **Semanal** (segunda 06:00 UTC) — varredura completa; regressão high/critical abre **issue**
  (label `security-scan`).
- **A cada PR** que toca `package.json`/`bun.lock` — barra dependência vulnerável entrando.
- **Sob demanda** — aba Actions → Security Scan → Run workflow.

## Rodar um scan manual (local / agente)

- **Dependências:** `bun audit`
- **Advisors (via MCP/Claude):** `mcp__supabase__get_advisors { type: "security" }` — ou Dashboard →
  Advisors. Triagem: ignore `authenticated_security_definer_function_executable` (esperado nos
  `operator_*`); foque em grants `anon` indevidos, `search_path` mutável, RLS sem policy.
- **Grants `api_*` (regressão do S1):** as funções `api_*` devem ser **só `service_role`** (o gateway
  já autorizou por chave+escopo). Checagem:
  ```sql
  select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'api\_%'
    and exists (select 1 from aclexplode(p.proacl) a
                where a.grantee::regrole::text in ('anon','authenticated'));
  -- deve ser 0
  ```

## Relatórios

Cada rodada manual significativa gera um relatório datado em `docs/security/scan-YYYY-MM-DD.md`
com os achados (severidade, status ✅/🔶/⏭️, remediação). O último:
[`scan-2026-06-23.md`](./scan-2026-06-23.md).

## Configurar o token dos advisors no CI (opcional, recomendado)

1. Supabase Dashboard → Account → **Access Tokens** → gerar token.
2. GitHub → repo → Settings → Secrets and variables → Actions → **`SUPABASE_ACCESS_TOKEN`**.
   Sem o secret, o job dos advisors é pulado (o resto roda normal).

## Regra de ouro (ADR-005 + S1)

Toda função `SECURITY DEFINER` **nova** que confia no chamador (recebe `company_id`/escopo por
parâmetro, sem checar `auth.uid()`) **só pode** ter `EXECUTE` para `service_role`. Nunca conceda a
`anon`/`authenticated`. O secret/advisor scan é o guard contra reincidência.
