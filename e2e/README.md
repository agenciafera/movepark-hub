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

Config em [`../windup.config.ts`](../windup.config.ts), apontando para o dev
server local na 5173. Roda sem `.env.e2e`, mas o planejamento de um cenário novo
precisa da `GEMINI_API_KEY` no `.env.local`.

```bash
bunx windup new "descreva o teste aqui"   # cria o cenário
bunx windup explain <id>                  # mostra o plano em cache, passo a passo
```

### Estado em 29/07/2026 (Windup 1.6.0): funcionando

O `home-vitrine` passa e a asserção é real. Verificado quebrando o produto de
propósito: troquei o texto do `<h2>` em `src/features/home/PopularParkingLots.tsx`
e o cenário **falhou**; revertendo, voltou a passar. É o teste de regressão que
qualquer teste automatizado deve sobreviver.

O plano em cache:

```json
{ "expect": { "text_contains": { "selector": "body", "text": "Estacionamentos Populares" } } }
```

Quando a `task` cita o texto entre aspas, o Windup escreve essa postcondição
sozinho, de forma determinística, sem chamada extra de LLM e só depois de
confirmar que a página realmente contém o texto. **Então escreva o texto a
verificar entre aspas na `task`.** É o que separa um cenário útil de um vazio.

Custo medido: 1 chamada, 3,7s e $0,0024 para planejar; replay em 969ms com 0
chamadas e $0.

Histórico, porque explica as regras acima. Na 1.4.0 o cenário passava com
`expect: { selector: "body" }`, falso positivo que sobrevivia à remoção da
vitrine. A 1.5.0 passou a rejeitar postcondição trivial, mas o planner continuava
devolvendo `body` e nada era autorável. A 1.6.0 fechou as duas pontas: o
pre-pass determinístico acima, e um guard que **conta matches na página ao vivo**
e recusa seletor de visibilidade nua que casa mais de um elemento
(`"h2" matches 5 elements on this page`).

Ainda assim, **leia o plano antes de confiar no cenário**:

```bash
bunx windup explain <id>                                      # sinaliza plano fraco
cat .windup/cache/trajetorias/<id>.json | jq '.plan.actions'   # os seletores crus
```

Duas arestas que sobraram:

- o planner trunca resposta com frequência nesta base (`truncated response`), e aí
  o replanejamento sobe para 3 a 5 chamadas, 40 a 90 segundos e até $0,069. O
  caminho bom só acontece quando a task cita o texto entre aspas;
- quando o produto quebra de verdade, a mensagem que aparece é a do
  replanejamento que falhou, não "o texto esperado não foi encontrado". Dá para
  confundir regressão do app com problema da ferramenta.
