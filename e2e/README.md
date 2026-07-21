# Suíte E2E (Playwright)

Camada de teste de navegador do Hub. É a quinta camada, ao lado do Vitest (unit e integração), do pgTAP (`test:db`) e do `deno test` (`test:edge`).

Este diretório é **só o harness**. Os casos do roteiro E1.3 (T-01 a T-16) são a atividade [86ajkdr1d](https://app.clickup.com/t/3010186/86ajkdr1d) e entram em `e2e/public/`, `e2e/manager/` e `e2e/operator/`.

## Alvo atual

| O quê | Onde |
|---|---|
| Navegador | dev server próprio da suíte, na porta **5273**, subido pelo Playwright |
| Banco | **produção** (`mgaigbezdalbyuqiofcf`), com a fixture Mercy |

A porta é 5273 de propósito, separada da 5173 do seu `bun run dev`. Isso evita que a suíte reaproveite um servidor que você deixou aberto, porque o dela sobe com uma diferença importante: **sem `VITE_GOOGLE_MAPS_API_KEY`**.

Sem a chave, o passo 1 do wizard de publicação mostra campos manuais de latitude e longitude em vez do autocomplete do Google. É o que deixa o T-07 determinístico e sem chamada externa paga. O preço: **o autocomplete do Google não tem cobertura E2E**.

Não existe banco de staging do Hub. O projeto `movepark_staging` no Supabase é o dump do backoffice legado (October CMS), sem nenhuma tabela do Hub. Enquanto isso não mudar, a suíte escreve em produção dentro do escopo da fixture.

## Setup

1. Instale o Chromium (uma vez por máquina):

```bash
bunx playwright install chromium
```

2. Copie o exemplo de env e preencha a service_role:

```bash
cp .env.e2e.example .env.e2e
```

O `.env.e2e` fica fora do git. `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` já vêm do `.env` versionado, então só a `SUPABASE_SERVICE_ROLE_KEY` precisa ser preenchida.

3. Libere o redirect do magic link no Supabase. Em **Authentication > URL Configuration > Redirect URLs**, inclua:

```
http://localhost:5273/**
```

Sem isso o bypass de auth falha, e a mensagem de erro do `session.ts` aponta pra cá.

## Rodando

```bash
bun run test:e2e          # tudo
bun run test:e2e:smoke    # só o smoke do harness
bun run test:e2e:ui       # modo interativo
```

Relatório HTML em `playwright-report/`. Trace e vídeo ficam guardados só quando um teste falha.

## Bypass de auth

O app é passwordless (Google, OTP de e-mail, OTP de WhatsApp) e o ADR-006 manda manter o password grant desligado, então a suíte **não** usa `signInWithPassword`. O caminho é outro:

1. o service_role gera um magic link com `auth.admin.generateLink`, que não dispara e-mail nenhum;
2. o navegador abre o link;
3. o Supabase devolve os tokens pro app, e o client do próprio app grava a sessão no localStorage;
4. o Playwright salva isso em `.auth/manager.json` e `.auth/operator.json`.

Deixar o app gravar a sessão evita que a suíte precise conhecer o formato interno do `sb-<ref>-auth-token`. Se o supabase-js mudar esse formato, o bypass continua funcionando.

Os projects `e2e-manager` e `e2e-operator` declaram o `storageState` correspondente e já começam logados. Nenhum spec preenche tela de login.

### Usuários de teste

Já existem em produção, não precisam ser criados. São os mesmos do `CLAUDE.md`, usados também nos roteiros manuais:

| Papel | E-mail | Usado em |
|---|---|---|
| `hub_admin` (super admin) | `developer@fera.ag` | `/manager/*` |
| `company_operator` (Mercy) | `peu+mercy@fera.ag` | `/operator/*` e o onboarding do parceiro |
| `customer` | `peu+teste1@fera.ag` | reservas: busca, checkout, `/account` (sem cobertura E2E ainda) |

O usuário do parceiro é um só ao longo de toda a jornada: entra como lead público e, aprovado, vira o operador da unidade que cadastrou. Por isso os specs de `/operator` precisam de uma company vinculada a ele.

O vínculo do operador com a empresa Mercy vive em `profile_company`. A limpeza apaga a company, e o vínculo cai por cascata. Por isso existe `seedFixtureCompany(status)`: ela recria company e vínculo, e é pré-condição de todo spec de `/operator`. No fluxo real esse vínculo nasce do convite por e-mail, que não dá para automatizar.

## Guardas de escrita

Como o alvo é produção, a limpeza tem travas em `support/db.ts`:

- `assertFixtureScoped()` recusa constantes de fixture largas demais (padrão vazio, `%`, string curta).
- `cleanupFixture()` conta as empresas que casaram com o padrão antes de apagar e aborta se passar de `MAX_FIXTURE_COMPANIES` (hoje 3).

A suíte nunca apaga usuário do `auth.users`. Ao escrever specs novos, use os helpers de `support/db.ts` em vez de montar delete na mão.

### Ordem da limpeza

`location.company_id` é **RESTRICT**, não CASCADE. Sem apagar a unidade antes, o delete da company falha e trava a limpeza da suíte inteira. A ordem em `cleanupFixture()` já cobre isso.

`booking.location_id` também é RESTRICT, e essa trava fica de pé de propósito: se a limpeza estourar ali, é sinal de que a unidade de teste ganhou reserva de verdade, e o certo é investigar, não forçar o delete.

As fotos que o wizard sobe vão para o Storage (`assets-public/<company_id>/`), que não cai por FK nenhuma. `removeCompanyAssets()` limpa isso.

## Estrutura

```
playwright.config.ts     # raiz; projects: setup, e2e-public, e2e-manager, e2e-operator, smoke
e2e/
  tsconfig.json          # isolado do app e do Vitest
  support/
    env.ts               # carrega .env + .env.e2e, valida e falha cedo
    fixtures.ts          # constantes da fixture Mercy
    supabaseAdmin.ts     # clients service_role e anon
    db.ts                # leituras, seed e limpeza FK-safe com guardas
    session.ts           # bypass de auth via magic link
    leadFlow.ts          # passos do modal "Seja parceiro"
    dragHtml5.ts         # arrasto nativo do kanban
  auth/
    manager.setup.ts     # gera .auth/manager.json
    operator.setup.ts    # gera .auth/operator.json
  public/
    harness.spec.ts      # dev server + service_role, sem depender de auth
    T01-lead-parcial.spec.ts
    T02-lead-submissao.spec.ts
    T03-email-novo-lead.spec.ts
  manager/
    T04-kanban-mover.spec.ts
    T05-kanban-tela-cheia.spec.ts
  operator/
    T07-publish-wizard.spec.ts
  smoke/
    auth-bypass.spec.ts  # prova que os storageStates caem logados
```

## Efeitos colaterais de rodar contra produção

- **T-03** dispara e-mail de verdade: um para o lead e um para `hub@movepark.co`.
- **T-04** aprova o parceiro, o que envia o e-mail de convite para o lead.
- **T-07** sobe uma imagem para o Storage de produção (removida no teardown).

## Arrasto no kanban

O kanban usa DnD nativo do HTML5, não dnd-kit. O `locator.dragTo()` do Playwright não dispara o `dragstart` nesse caso: use `dragHtml5()`, que conduz o mouse em passos.

Evite a tentação de disparar `DragEvent` sintético. Funcionaria, mas ignoraria o atributo `draggable` e o teste passaria mesmo com o arrasto quebrado para quem usa o produto.

O smoke está partido em dois de propósito. O de `public/` não depende do project `setup`, então continua rodando mesmo com o bypass quebrado. Se só o de `smoke/` falhar, o problema é auth; se os dois falharem, é ambiente.

## Por que separado do Vitest

O Vitest só varre `src/**/*.test.{ts,tsx}` e `test/**/*.int.test.ts`, então os `.spec.ts` daqui não entram nele. O `e2e/tsconfig.json` também é próprio, pra não herdar os globals nem o happy-dom do Vitest.
