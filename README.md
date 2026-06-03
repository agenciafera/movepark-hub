# Movepark Hub

SaaS centralizado para gestão de estacionamentos parceiros — o "Airbnb dos estacionamentos". Substitui os sistemas legados ([`movepark-backoffice-v4`](https://github.com/agenciafera) — October CMS e [`movepark-nextjs`](https://github.com/agenciafera) — site público) por uma plataforma multi-tenant moderna.

Cada **empresa** (tenant) opera N **unidades** (estacionamentos físicos), cada uma com seus **tipos de vaga** e regras próprias de preço, capacidade e cupom. A equipe Movepark administra a plataforma via Manager Panel; cada parceiro acessa o seu próprio Operator Panel.

## Stack

- **Frontend:** React 18 + Vite + TypeScript
- **UI:** TailwindCSS + Radix UI (shadcn) + Lucide icons
- **Estado / dados:** TanStack Query + React Hook Form + Zod
- **Roteamento:** React Router 6
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Lint / format:** ESLint 9 + Prettier (com `prettier-plugin-tailwindcss`)

## Setup local

Usamos **bun** (lockfile `bun.lockb`). Use sempre `bun` — não `npm`/`yarn`/`pnpm`.

```bash
# 1. Instalar dependências
bun install

# 2. Copiar variáveis de ambiente
cp .env.local.example .env.local
# preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# 3. Rodar em dev
bun run dev
```

Scripts disponíveis:

| Script | Ação |
|---|---|
| `bun run dev` | Vite dev server |
| `bun run build` | `tsc -b && vite-react-ssg build` |
| `bun run preview` | Serve o build |
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript sem emitir |
| `bun run gen:types` | Gera [`src/types/database.ts`](src/types/database.ts) a partir do projeto Supabase linkado |

## Estrutura do projeto

```
src/
├── auth/            # AuthProvider, RequireRole, escopos por role
├── components/
│   ├── shared/      # AppShell, Sidebar, Topbar, KpiCard, etc
│   └── ui/          # shadcn primitives (button, dialog, table, ...)
├── features/        # módulos por domínio (bookings, companies, pricing, ...)
├── lib/             # supabase client, query-client, format, utils
├── routes/
│   ├── manager/     # painel interno (role hub_admin)
│   └── operator/    # painel parceiro (role company_operator)
└── types/           # database.ts (gerado), domain.ts (curado)

supabase/
└── migrations/      # SQL migrations versionadas (ver docs/specs/database-schema.md)

docs/
├── specs/           # especificações técnicas (leia primeiro)
└── design-system/   # handoff do design system (HTML/CSS/JS)
```

## Documentação

A pasta [`docs/specs/`](docs/specs/README.md) é a fonte de verdade técnica. Sempre que mudar regra de negócio, atualize a spec correspondente.

| Spec | Conteúdo |
|---|---|
| [domain-model.md](docs/specs/domain-model.md) | Mapeamento legado → Hub, glossário, hierarquia de entidades |
| [database-schema.md](docs/specs/database-schema.md) | Schema PostgreSQL, decisões de modelagem, RLS, migrations |
| [pricing-engine.md](docs/specs/pricing-engine.md) | Motor dinâmico de preço (substitui as 41 classes PHP do legado) |
| [capacity-rules.md](docs/specs/capacity-rules.md) | Disponibilidade por data e checagem de capacidade |
| [booking-flow.md](docs/specs/booking-flow.md) | State machine da reserva, checkout, expiração, cancelamento |
| [coupon-rules.md](docs/specs/coupon-rules.md) | Validação de cupons e cálculo de desconto |
| [voucher-qrcode.md](docs/specs/voucher-qrcode.md) | Geração do voucher PDF e check-in por QR code |
| [manager-panel.md](docs/specs/manager-panel.md) | Painel interno Movepark (`hub_admin`) |
| [operator-panel.md](docs/specs/operator-panel.md) | Painel do parceiro (`company_operator`) |
| [design-tokens.md](docs/specs/design-tokens.md) | Tokens de cor, tipografia e espaçamento |

Outros documentos:

- [docs/simulacao-precos.md](docs/simulacao-precos.md) — simulações do motor de preço aplicadas aos seeds
- [docs/design-system/](docs/design-system/) — handoff do design system (Movepark, base Airbnb-like)

## Glossário (resumo)

Para o mapeamento completo veja [domain-model.md](docs/specs/domain-model.md).

| Termo | Significado |
|---|---|
| `company` | Tenant / marca (ex: virapark, garageinn, aeropark) |
| `location` | Unidade física do estacionamento |
| `parking_type` | Catálogo global de tipos de vaga (covered, valet, premium, ...) |
| `location_parking_type` | Tipo de vaga habilitado em uma unidade — tem capacidade e `pricing_rule` |
| `pricing_rule` | Estratégia de cálculo + tiers/brackets |
| `booking` | Reserva, com 1 vaga + N `booking_item` de serviços |

## Roles

| Role | Painel | Escopo |
|---|---|---|
| `hub_admin` | Manager | Toda a plataforma |
| `company_operator` | Operator | Apenas a `company` à qual está vinculado |

## Migrations

As migrations vivem em [`supabase/migrations/`](supabase/migrations/) e estão catalogadas em [docs/specs/README.md](docs/specs/README.md#migrations) e [database-schema.md](docs/specs/database-schema.md). Use a Supabase CLI ou o MCP para aplicar.
