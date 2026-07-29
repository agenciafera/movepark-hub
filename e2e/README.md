# Testes de ponta a ponta

Duas ferramentas moram aqui, cada uma na sua pasta. Elas não se misturam: têm
config, runner e formato de arquivo próprios.

| Pasta | Ferramenta | Formato | Comando |
|---|---|---|---|
| [`playwright/`](playwright) | Playwright | `.spec.ts` | `bun run test:e2e` |
| [`windup/`](windup) | Windup | `.json` | `bun run test:windup` |

## playwright/

A suíte principal, com 35 specs partidos por audiência (consumer, operator,
owner, manager, public, smoke) e por efeito colateral. Os specs que escrevem em
produção ficam atrás da trava `MP_E2E_TX` e só rodam se você pedir o project
pelo nome.

Config em [`../playwright.config.ts`](../playwright.config.ts), com `testDir`
apontando para cá. Precisa de `.env.e2e` local, com o `SUPABASE_SERVICE_ROLE_KEY`.
O detalhe todo está no [README da suíte](playwright/README.md).

## windup/

Cenário escrito em português num JSON. O Windup chama o LLM uma vez para montar
um plano de ações e daí em diante replica esse plano sem modelo nenhum: cerca de
600ms e custo zero por execução.

Config em [`../windup.config.mjs`](../windup.config.mjs), apontando para o dev
server local na 5173. Roda sem `.env.e2e`, mas o planejamento de um cenário novo
precisa da `GEMINI_API_KEY` no `.env.local`.

```bash
bunx windup new "descreva o teste aqui"   # cria o cenário
bunx windup explain <id>                  # mostra o plano em cache, passo a passo
```

Vale conferir o plano com `explain` depois de criar um cenário: a qualidade da
verificação final depende de quão específica foi a descrição.
