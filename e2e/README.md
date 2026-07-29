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

### Estado em 29/07/2026: instalado, sem cobertura utilizável

O `home-vitrine` **não passa**, e isso é o estado honesto, não um teste
quebrado. O planner não consegue produzir uma asserção válida para uma
verificação de texto trivial.

Histórico curto. Na 1.4.0 o cenário passava com `expect: { selector: "body" }`,
que é falso positivo: removendo a vitrine inteira do DOM, ele continuava
passando. A 1.5.0 trouxe um guard que rejeita postcondição trivial e falha alto
em vez de dar verde à toa. O guard funciona e a mensagem de erro é ótima. O que
não mudou é o planner: ele segue devolvendo `body` e agora bate no guard.

Tentado sem sucesso, nas duas versões:

- `task` citando o texto exato a verificar;
- hint nomeando `text_contains` com selector e texto prontos;
- hint avisando que a home tem 5 `h2`, então asserção em `h2` não discrimina;
- trocar o modelo para `gemini-3.1-pro-preview`.

**O guard ainda tem furo.** A blocklist cobre `body`, `html`, `main`, `div` e
`#root`. Um `expect: { selector: "h2" }` passa, e nesta home isso é igualmente
vazio: são 5 `h2`, então a asserção sobrevive à remoção da vitrine. Foi assim
que um `windup new --validate` gerou um cenário "validado" que não testa nada.

Enquanto o planner não melhorar: **leia o plano antes de confiar no cenário.**

```bash
bunx windup explain <id>                                      # já sinaliza plano fraco
cat .windup/cache/trajetorias/<id>.json | jq '.plan.actions'   # os seletores crus
```

Se a postcondição final for um seletor genérico que existe em mais de um lugar
da página, o cenário não está testando nada.

Sobre custo: replanejar não é barato como a doc sugere. As tentativas aqui
custaram entre 3 e 5 chamadas, de 27 a 89 segundos, e até $0,091 por
replanejamento, contra os ~3s e $0,002 anunciados. O replay em si continua
cumprindo o prometido: 0 chamadas, ~600ms, $0.
