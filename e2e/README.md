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

### Um verde do Windup ainda não é cobertura

Medido em 29/07/2026, no cenário `home-vitrine`. O planner gerou uma
postcondição vazia: `expect: { selector: "body" }`. O teste passa, mas removendo
a vitrine inteira do DOM ele continua passando, porque `body` segue lá.

O formato não é o limite. O `Expect` do Windup aceita `text_contains`, `count`,
`not_visible`, `attribute`, `selector_value` e `url`, e o executor usa `locator`
do Playwright, então `text=` e `:has-text()` funcionam. Quem não usa isso é o
planner.

O que já foi tentado, sem resolver:

- reescrever a `task` citando o texto exato a verificar;
- hint nomeando `text_contains` com o selector e o texto prontos;
- hint proibindo `body`, `main`, `div` e `h2` como alvo;
- trocar o modelo: `gemini-3.1-pro-preview` devolveu uma ação só, com
  `expect: { selector: "main" }`. Não é questão de modelo fraco.

Enquanto isso não mudar: **leia o plano antes de confiar no cenário.**

```bash
bunx windup explain <id>                                     # resumo legível
cat .windup/cache/trajetorias/<id>.json | jq '.plan.actions'  # os seletores crus
```

Se a postcondição final for `body` ou `main`, o cenário não está testando nada.

Duas armadilhas de cache que atrapalham a iteração:

- editar só os **hints** não invalida o cache, e a execução seguinte replica o
  plano velho sem avisar. Só a mudança da `task` invalida. Para forçar,
  `bunx windup cache clear`;
- replanejar não é barato como a doc sugere. Um replanejamento aqui custou 4
  chamadas, 63 segundos e $0,043, contra os ~3s e $0,002 anunciados.
