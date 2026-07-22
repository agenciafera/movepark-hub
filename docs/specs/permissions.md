# Permissões por escopo + papéis fixos (ADR-005)

Fonte da verdade do controle de acesso dentro de uma empresa. Unifica **UI, RLS/RPC e chaves de
API** num único vocabulário: **o escopo**. "A mesma permissão = o mesmo escopo."

## Modelo

Duas camadas, independentes:

- **`user_role`** (`hub_admin` / `company_operator` / `customer`) — define a **área** do app
  (`/manager`, `/operator`, consumidor). Inalterada.
- **`company_role`** — papel **dentro da empresa** (`profile_company.role`). 4 presets fixos:

| Papel (enum) | Rótulo | Resumo |
|---|---|---|
| `owner` | Dono | Acesso total: tudo + gerir usuários e chaves + mover dinheiro |
| `manager` | Gerente | Tudo operacional, financeiro (leitura) e catálogo/preços; **não** gere usuários/chaves nem saca |
| `operator` | Operação | Reservas, check-in e ocupação. Sem preços, financeiro ou usuários |
| `finance` | Financeiro | Financeiro/repasses (leitura) + reservas (leitura). Sem operação ou catálogo |

> O enum reusa `operator` como "Operação" (sem migração de dados); `manager`/`finance` foram
> adicionados (migration `20260712000000`). Presets **fixos**: não há construtor de regras na UI.

> **Fora deste modelo — ações self-service do consumidor.** Operações do próprio usuário sobre a
> própria conta (ex.: **exclusão da conta**, E0.9) **não** são company-scoped e **não** têm escopo
> no catálogo. A autorização é `auth.uid() = alvo` (a RPC só toca a linha do próprio usuário). Ver
> [account-deletion.md](./customer/account-deletion.md).

## Vocabulário de escopos

O catálogo é a tabela **`api_scope`** (mesma da Public API). A coluna **`assignable_to_api_key`**
separa o que pode ir pra uma chave de API (escritas de catálogo) do que é **só-interno** (equipe,
chaves, financeiro). Escopos in-app adicionados (migration `20260713000000`): `pricing:write`
(atribuível), `finance:read`, `payouts:read`, `payouts:write`, `team:read`, `team:write`,
`api-keys:write` (só-internos).

### Escopo de plataforma (`is_platform_scope = true`)

Terceira categoria, ortogonal a `assignable_to_api_key`: pertence à **Movepark**, não à empresa nem
ao parceiro. Não entra em `company_role_scope` (o trigger `company_role_scope_no_platform` recusa) e
não conta na invariante "o Dono tem todos", que vale sobre o catálogo de empresa.

| Escopo | Atribuível a chave | Para quê |
|---|---|---|
| `checkout:link` | ✔ | Tool que gera link de checkout, concedida só à chave do bot interno |
| `fares:write` | – | Editar plano de cancelamento (Básica/Flex/Superflex) por tipo de vaga |

É o gate certo quando a resposta para "quem manda nisso?" é a Movepark. No front sai de graça: o
`hasScope` devolve `true` para `hub_admin` (inclusive impersonando) e `false` para todo membro de
empresa, então o mesmo escopo esconde o item do menu, tira a rota do alcance e barra a ação, sem um
`if` de papel espalhado pela UI. Migration `20260904000000_fares_write_platform_scope.sql`.

## Matriz papel → escopo (seed `company_role_scope`)

`owner` = catálogo inteiro. Não-Dono:

| Escopo \ Papel | manager | operator | finance |
|---|:--:|:--:|:--:|
| `*:read` de catálogo/preço/disp./ocupação/faq | ✔ | ✔ | ✔ |
| `locations:write` · `parking-types:write` · `pricing:write` | ✔ | – | – |
| `bookings:read` | ✔ | ✔ | ✔ |
| `bookings:write` · `cancel` · `checkin` | ✔ | ✔ | – |
| `coupons:*` · `discounts:*` · `addons:*` · `reviews:write` · `webhooks:write` | ✔ | – | – |
| `reviews:read` | ✔ | ✔ | – |
| `wps:write` | ✔ | ✔ | – |
| `finance:read` · `payouts:read` | ✔ | – | ✔ |
| `payouts:write` | – | – | – |
| `team:read` | ✔ | ✔ | ✔ |
| `team:write` · `api-keys:write` | – | – | – |

`payouts:write` (saque/KYC bancário) é **exclusivo do Dono**.

## Enforcement (server-authoritative)

Três pontos, todos a partir dos helpers `member_has_scope(company_id, scope)` e
`current_member_scopes(company_id)` (SECURITY DEFINER; **hub_admin e dono → todos os escopos**):

1. **RPC** — cada `operator_*`/`payout_*`/`company_*` de escrita exige o escopo
   (`if not member_has_scope(...) then raise … errcode 42501`). Cupons/descontos/serviços/chaves
   funilam pelo respectivo `*_assert_company_access`; preço/ocupação/avaliações/financeiro/equipe
   checam inline. Migration `20260714000000`.
2. **RLS** — as escritas diretas de `location`/`location_parking_type` (sem RPC) têm o escopo na
   policy de UPDATE (`locations:write` / `parking-types:write`).
3. **UI** — `useAuth().hasScope(scope)` gateia rota (`<RequireScope>` em `routes.tsx`), itens da
   sidebar (`filterNavByScopes`) e ações na página (botões/seletor de papel). hub_admin → sempre
   `true`. Os escopos vêm no `loadSession` (cruza `company_role_scope` com o papel do usuário).

> **Leitura vs. escrita:** o gating de **escrita** é server-authoritative (RPC + RLS). A **leitura**
> de dados da própria empresa segue a RLS por associação (qualquer membro lê); a UI é que esconde as
> seções por escopo. Um membro sem o item no menu não tem como agir (a ação é bloqueada no servidor).

## Convite de usuário (E1.7)

Quem tem **`team:write`** (Dono) convida por e-mail na tela **Operador → Usuários**. A Edge
**`invite-company-member`** (com verify-jwt) autoriza pelo `member_has_scope` do convidante,
cria/encontra o `auth.user`, vincula em `profile_company` com o papel escolhido (não rebaixa um
hub_admin) e envia o magic link (`tplTeamInvite`). O Manager também escolhe o papel ao vincular um
usuário a uma empresa. Guarda de **último dono** atualizada: rebaixar o único dono para **qualquer**
papel não-Dono é bloqueado.

## Compatibilidade

A E1.6 fez backfill de `owner` por padrão, então os vínculos existentes seguem com acesso total; só
membros explicitamente `operator`/`manager`/`finance` ficam restritos. Reconfira membros não-Dono ao
ativar.

## Arquivos

- Migrations: `20260712000000_company_role_add_values.sql`, `20260713000000_permission_scopes.sql`,
  `20260714000000_regate_operator_rpcs.sql`.
- Front: `src/auth/AuthProvider.tsx` (`hasScope`, `companyScopes`), `src/auth/RequireScope.tsx`,
  `src/components/shared/Sidebar.{tsx,logic.ts}`, `src/features/team/{api,team.logic}.ts`,
  `src/routes/operator/users.tsx`, `src/routes/manager/users.tsx`.
- Edge: `supabase/functions/invite-company-member/`.
- Testes: `supabase/tests/permissions.test.sql`, `operator_rpc_scope.test.sql`, `team.logic.test.ts`,
  `Sidebar.logic.test.ts`, `RequireScope.test.tsx`, `operator/users.test.tsx`,
  `invite-company-member/logic.test.ts`.
