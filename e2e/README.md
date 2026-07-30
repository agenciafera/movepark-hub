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

Seis cenários, todos verdes em replay: **0 chamadas de LLM, $0, 3 segundos o
conjunto inteiro.**

| Cenário | Rota | O que assere |
|---|---|---|
| `home-vitrine` | `/` | "Estacionamentos Populares" |
| `como-funciona` | `/como-funciona` | "Reserve sua vaga em menos de 2 minutos." |
| `destinos-catalogo` | `/destinos` | "Mais buscados" |
| `cancelamento-politica` | `/cancelamento` | "Prazo por Tarifa" |
| `faq-publica` | `/faq` | "Perguntas frequentes" |
| `seja-parceiro` | `/seja-parceiro` | "Vaga vazia não volta." |

Config em [`../windup.config.ts`](../windup.config.ts), apontando para o dev
server local na 5173. **Precisa do `bun run dev` no ar.** Roda sem `.env.e2e`,
que é justamente a graça: é o único teste de navegador que roda numa máquina
limpa.

### O planner é a assinatura Claude, não a chave do Gemini

Planejar usa o `claude` CLI pelo perfil **`fera`** (conta da empresa), ligado a
esta pasta por um `.envrc` que o direnv carrega. Custo reportado: **$0**, porque
sai da assinatura. Replay não usa modelo nenhum, então não depende de nada
disso.

Para trabalhar nos cenários você precisa do perfil logado:

```bash
npx windup claude status --profile fera
npx windup claude login --profile fera --force   # se cair
```

O `.envrc` não é versionado (guarda caminho absoluto de home), então cada
máquina roda o `login --profile fera` uma vez.

Se preferir planejar pelo Gemini numa execução, `--llm google` usa a
`GEMINI_API_KEY` do `.env.local`. Não recomendado: ver a comparação abaixo.

### Duas correções que este projeto carrega

O `patches/windupjs@1.8.0.patch` (via `bun patch`) conserta um bug que **impede
o `claude-code` de funcionar**: o adapter faz `spawn` da CLI sem opção `stdio`,
então o stdin do filho vira um pipe que ninguém escreve nem fecha; a CLI espera
3 segundos, avisa e sai com código 1. O patch passa
`stdio: ["ignore", "pipe", "pipe"]`.

E o `model` na config precisa ser **explícito**. Sem ele, o Windup cai no
default do Google e manda `gemini-3.1-flash-lite` como `--model` para a CLI do
Claude, que responde 404. O erro chega como `the claude CLI exited with code 1`,
sem dizer o motivo, porque a CLI devolve o detalhe no stdout e o adapter só
mostra o stderr.

Os dois foram reportados. Ao subir de versão, teste se ainda são necessários e
remova o patch se não forem.

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

### Por que o planner é o Claude, e não o Gemini

Os seis cenários foram planejados nas duas ferramentas. A diferença não é sutil.

| | Gemini 3.1 flash-lite | Claude (assinatura) |
|---|---|---|
| Chamadas por cenário | 1 a 6 | **1, sempre** |
| Tempo por cenário | 4s a 120s | 9s a 25s |
| Custo dos seis | ~$0,90 | **$0** |
| Cenários que nunca saíram | `/cancelamento` | nenhum |
| Ações por plano | 3 | 1 a 2 |

O Gemini entrava em **loop** em algumas páginas: repetia ação atrás de ação até
estourar o teto de 8192 tokens de saída, e o JSON chegava cortado
(`degenerate/truncated response at the token limit`). Dá para ver com
`LOG_LEVEL=debug`:

```
[planner] attempt 1.2: truncated=true out_tokens=8176 len=24005
  tail="…{ \"id\": \"a82\", \"type\": \"wait_for\", …"
```

O `"id": "a82"` entrega: é a **ação número 82**, num schema que limita a 30.
Não era tamanho de página nem de task, e trocar para `gemini-3.1-pro-preview`
não resolvia. A `/cancelamento` consumiu 4 tentativas e $0,61 sem nunca sair;
pelo Claude saiu de primeira, em 9 segundos.

Se algum dia precisar voltar ao Gemini, `--llm google` continua funcionando, mas
espere esse comportamento de volta.

Por que `.windup/cache` é versionado, mesmo agora que planejar é grátis: replay
não precisa de conta, de chave, nem do `claude` CLI instalado. Quem clonar o
repo roda os seis em 3 segundos sem configurar nada.
