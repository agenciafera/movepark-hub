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

Camada de **smoke de leitura**, adicional ao Playwright e sem sobreposição com
ele. Prova que as páginas públicas renderizam o próprio conteúdo, e nada além
disso. Nenhum cenário escreve, clica ou faz login.

Cinco cenários, todos verdes em replay: **0 chamadas de LLM, $0, 4 segundos o
conjunto inteiro.**

| Cenário | Rota | O que assere |
|---|---|---|
| `home-vitrine` | `/` | "Estacionamentos Populares" |
| `como-funciona` | `/como-funciona` | "Reserve sua vaga em menos de 2 minutos." |
| `destinos-catalogo` | `/destinos` | "Destinos atendidos pela Movepark" |
| `faq-publica` | `/faq` | "Perguntas frequentes" |
| `seja-parceiro` | `/seja-parceiro` | "Encha suas vagas com reservas online" |

Config em [`../windup.config.ts`](../windup.config.ts), apontando para o dev
server local na 5173. **Precisa do `bun run dev` no ar.** Roda sem `.env.e2e`,
que é justamente a graça: é o único teste de navegador que roda numa máquina
limpa. Planejar um cenário novo precisa da `GEMINI_API_KEY` no `.env.local`;
replay não precisa de chave nenhuma.

### Por que só leitura, e por que não convertemos o Playwright

O formato do Windup tem **cinco tipos de ação**: `goto`, `click`, `fill`,
`wait_for` e `use`. Isso põe fora de alcance boa parte do que a suíte Playwright
faz, e não é questão de esforço:

| A suíte usa | Onde | No Windup |
|---|---|---|
| arrasto HTML5 nativo | T-04, T-05 (kanban) | não existe ação de arrasto |
| upload de arquivo | T-07 (foto do wizard) | não existe ação de upload |
| download | C-14, C-15 (voucher PDF) | não dá para asserir |
| dois contextos de browser | O-01 (dono + cliente) | não é expressável |

Some a isso que os specs transacionais existem para proteger dinheiro real
(`guardTx()`, `MP_E2E_TX`, limpeza FK-safe). O Windup tem `setup`/`teardown`
como comandos de shell, mas nada equivalente a travar project por nome.

### Como escrever um cenário que preste

**Ponha o texto a verificar entre aspas na `task`.** Quando o Windup vê um
literal entre aspas, ele escreve a postcondição `text_contains` sozinho, sem
chamada extra de LLM e só depois de confirmar que a página contém o texto. Fora
desse caminho, o planner tende a devolver seletor genérico, que o guard recusa.

Prefira um texto que prove que o **conteúdo** renderizou, não só o título da
página, e confira o plano antes de confiar:

```bash
bunx windup explain <id>                                      # sinaliza plano fraco
cat .windup/cache/trajetorias/<id>.json | jq '.plan.actions'   # os seletores crus
```

### Aresta conhecida: planejar é caro e sai na sorte

Em algumas páginas o planner entra em **loop**: repete ação atrás de ação até
estourar o teto de 8192 tokens de saída, e o JSON chega cortado. O erro aparece
como `degenerate/truncated response at the token limit`.

Dá para ver acontecendo com `LOG_LEVEL=debug`:

```
[planner] attempt 1.1: truncated=true out_tokens=8176 len=24507
  tail="…\"value_ref\": \"Reserve sua vaga em"
[planner] attempt 1.2: truncated=true out_tokens=8176 len=24005
  tail="…{ \"id\": \"a82\", \"type\": \"wait_for\", …"
```

O `"id": "a82"` entrega o problema: é a **ação número 82**, num schema que
limita a 30. Um plano bom tem 3 ações e ~440 tokens. O teto de 8192 é trava de
custo funcionando; o defeito está antes dele.

Não é tamanho de página nem de task. A `/como-funciona` tem 255 elementos e
sofre; a `/seja-parceiro` tem 450 e passa de primeira. Encurtar a task para um
literal só não mudou nada. Trocar para `gemini-3.1-pro-preview` também não.

**É sorte, não impossibilidade.** A `/como-funciona` só entrou depois de várias
tentativas, quando uma delas não degenerou. A `/cancelamento` ficou de fora:
3 tentativas, 18 chamadas, $0,38, nenhum plano.

Custo total para deixar estes cinco no ar: **cerca de $0,90**, contra os
~$0,0025 por cenário anunciados. Por isso `.windup/cache` é versionado: o preço
é pago uma vez, por quem escreve. Quem clona o repo roda de graça.

Consequência prática: **cresça essa camada em lotes pequenos**, e não conte com
planejar um cenário novo no meio de uma tarefa com pressa.

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
