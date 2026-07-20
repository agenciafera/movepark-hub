# Suíte E2E (Playwright)

Camada de teste de navegador do Hub. É a quinta camada, ao lado do Vitest (unit e integração), do pgTAP (`test:db`) e do `deno test` (`test:edge`).

Este diretório é **só o harness**. Os casos do roteiro E1.3 (T-01 a T-16) são a atividade [86ajkdr1d](https://app.clickup.com/t/3010186/86ajkdr1d) e entram em `e2e/public/`, `e2e/manager/` e `e2e/operator/`.

## Alvo atual

| O quê | Onde |
|---|---|
| Navegador | dev server local (`bun run dev`, porta 5173), subido pelo próprio Playwright |
| Banco | **produção** (`mgaigbezdalbyuqiofcf`), com a fixture Mercy |

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
http://localhost:5173/**
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

Já existem em produção, não precisam ser criados:

| Papel | E-mail | Usado em |
|---|---|---|
| `hub_admin` | `developer@fera.ag` | `/manager/*` |
| `company_operator` (Mercy) | `peu+mercy@fera.ag` | `/operator/*` |

O vínculo do operador com a empresa Mercy vive em `profile_company`. Se a limpeza da fixture apagar a company, esse vínculo cai junto e o storageState do operator para de dar acesso a `/operator/recebimento`. Quem recria a company (os specs do roteiro) precisa recriar o vínculo.

## Guardas de escrita

Como o alvo é produção, a limpeza tem duas travas em `support/db.ts`:

- `assertFixtureScoped()` recusa constantes de fixture largas demais (padrão vazio, `%`, string curta).
- `cleanupFixture()` conta as empresas que casaram com o padrão antes de apagar e aborta se passar de `MAX_FIXTURE_COMPANIES` (hoje 3).

A suíte nunca apaga usuário do `auth.users`. Ao escrever specs novos, use os helpers de `support/db.ts` em vez de montar delete na mão.

## Estrutura

```
playwright.config.ts     # raiz; projects: setup, e2e-public, e2e-manager, e2e-operator, smoke
e2e/
  tsconfig.json          # isolado do app e do Vitest
  support/
    env.ts               # carrega .env + .env.e2e, valida e falha cedo
    fixtures.ts          # constantes da fixture Mercy
    supabaseAdmin.ts     # clients service_role e anon
    db.ts                # leituras + limpeza FK-safe com guardas
    session.ts           # bypass de auth via magic link
  auth/
    manager.setup.ts     # gera .auth/manager.json
    operator.setup.ts    # gera .auth/operator.json
  public/
    harness.spec.ts      # dev server + service_role, sem depender de auth
  smoke/
    auth-bypass.spec.ts  # prova que os storageStates caem logados
```

O smoke está partido em dois de propósito. O de `public/` não depende do project `setup`, então continua rodando mesmo com o bypass quebrado. Se só o de `smoke/` falhar, o problema é auth; se os dois falharem, é ambiente.

## Por que separado do Vitest

O Vitest só varre `src/**/*.test.{ts,tsx}` e `test/**/*.int.test.ts`, então os `.spec.ts` daqui não entram nele. O `e2e/tsconfig.json` também é próprio, pra não herdar os globals nem o happy-dom do Vitest.
