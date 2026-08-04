# Testes de ponta a ponta

Duas ferramentas moram aqui, cada uma na sua pasta. Elas não se misturam: têm
config, runner e formato de arquivo próprios.

| Pasta | Ferramenta | Formato | Comando | Roda no CI |
|---|---|---|---|---|
| [`playwright/`](playwright) | Playwright | `.spec.ts` | `bun run test:e2e` | não |
| [`windup/`](windup) | Windup | `.json` | `bun run test:windup` | sim, e barra |

## playwright/

A suíte principal, com 35 specs partidos por audiência (consumer, operator,
owner, manager, public, smoke) e por efeito colateral. Os specs que escrevem em
produção ficam atrás da trava `MP_E2E_TX` e só rodam se você pedir o project
pelo nome.

Config em [`../playwright.config.ts`](../playwright.config.ts), com `testDir`
apontando para cá. Precisa de `.env.e2e` local, com o `SUPABASE_SERVICE_ROLE_KEY`.
O detalhe todo está no [README da suíte](playwright/README.md).

Não roda no CI de propósito: escreve em produção e os specs transacionais cobram
de verdade no Pagar.me.

## windup/

**155 cenários, 778 ações, média 5,0 por cenário. Todos verdes em replay: 0
chamadas de LLM, $0, ~2min o conjunto inteiro com concorrência 2.**

É o único portão de navegador do projeto: o job `windup` do CI barra PR. Roda em
replay puro, então não precisa de chave de modelo nem de segredo.

Toda rota declarada em `src/routes.tsx` tem cenário de navegador. O guard
[`src/routes/routes-coverage.contract.test.ts`](../src/routes/routes-coverage.contract.test.ts)
mantém isso: rota nova sem cenário reprova o job `quality`, e cada rota coberta
por Playwright em vez de Windup carrega escrito o motivo.

| O que a suíte cobre | Cenários |
|---|---|
| Com sessão sintética (rotas logadas) | 113 |
| Com stub de rede | 136 |
| Jornadas (`jornada` + `jornada-longa`) | 48 |
| Validação de campo | 19 |
| Adversariais | 18 |
| Permissão e escopo | 9 |

Config em [`../windup.config.ts`](../windup.config.ts), apontando para o dev
server local na 5173. **Precisa do `bun run dev` no ar.** Roda sem `.env.e2e`,
que é justamente a graça: é o único teste de navegador que roda numa máquina
limpa, e nenhum cenário escreve em produção.

Relatório navegável, com o plano de cada cenário ação a ação:

```bash
WINDUP_BASE_URL=http://localhost:5273 bun run report:windup
```

### Sessão sintética: como as rotas logadas são testadas sem segredo

O `seed` grava o `localStorage` antes de o app carregar, e o `network` responde
as chamadas de auth. Com os dois, uma rota atrás de `RequireRole` abre sem
`.env.e2e` e sem tocar em produção:

```jsonc
{
  "seed": { "localStorage": { "sb-<ref>-auth-token": "<sessão com JWT falso>" } },
  "network": [
    { "url": "**/auth/v1/user*", "json": { "id": "...", "role": "authenticated" } },
    { "url": "**/rest/v1/profiles?*", "json": [{ "id": "...", "role": "hub_admin" }] },
    { "url": "**/rest/v1/company_role_scope?*", "json": [{ "role": "owner", "scope": "team:read" }] }
  ]
}
```

Trocar `role` no stub de `profiles` troca a audiência; trocar a lista de escopos
troca o que a tela deixa fazer. É assim que os dois lados de cada portão ficam
provados sem rebaixar papel de ninguém no ambiente vivo.

**O que isso não prova:** a UI espelha o escopo, ela não é a barreira. Quem
recusa de verdade é o servidor, e isso é pgTAP.

### A ordem dos stubs importa, e o glob é mais guloso do que parece

No matcher, `?` é curinga de **um caractere**, não o literal do início da query.
Então `**/rest/v1/company?*` casa também com `company_role_scope?...`. Posto
antes dos stubs de sessão, ele responde pelos escopos, o `AuthProvider` recebe
um objeto no lugar da lista e **a tela inteira renderiza vazia**, sem erro de
console. Custou duas telas dadas como quebradas antes de a causa aparecer.

Regra: **stubs de sessão primeiro, específicos depois, catch-all por último.** O
primeiro que casa é quem responde.

O mesmo vale para prefixo: `booking?*limit=1*` casa com `limit=100`. Quando duas
consultas batem na mesma tabela (uma lista e um `maybeSingle`), discrimine pelo
valor que **não** é prefixo do outro.

### Limites da ferramenta que já custaram tempo

| Limite | O que fazer |
|---|---|
| Não existe ação de teclado | Feche diálogo pelo botão "Fechar" do Radix, cujo rótulo mora num `span` `sr-only` |
| A postcondição `url` olha só o **caminho**, não a query | Um `?next=/account/clube` não dá para asserir por url |
| `selector_value` exige `value` não vazio | Não dá para asserir campo vazio |
| `attribute` exige `value` | Atributo booleano (`disabled`) vira checagem por seletor: `[role="dialog"] button[disabled]` |
| Toast do Sonner monta fora do `[role="dialog"]` | Cheque a mensagem de erro no `body` |
| `aria-label` não é texto visível | `text_contains` nele dá falso negativo |
| Cinco tipos de ação: `goto`, `click`, `fill`, `wait_for`, `use` | Arrasto, upload e download continuam no Playwright |

`NetworkRule` aceita `method`, o que resolve endpoint que serve GET e POST no
mesmo endereço (é o caso da Edge `chat`: derrubar os dois desligaria o widget e
o cenário nem abriria).

### Como escrever um cenário que preste

**Numere os passos.** Uma lista de asserções soltas vira uma ação só; "Passo 1:
… Passo 2: …" força uma ação de plano por passo.

**Ponha o texto a verificar entre aspas.** Com um literal entre aspas o Windup
escreve a postcondição `text_contains` sozinho, sem chamada extra de LLM e só
depois de confirmar que a página contém o texto.

**Use os `hints` para explicar por que o cenário é assim.** Eles vão junto para
o planner e ficam como documentação de quem ler o JSON depois.

Confira o plano antes de confiar:

```bash
bunx windup explain <id>
jq '.plan.actions' .windup/cache/trajetorias/<id>.json
```

Para provar que uma asserção discrimina de verdade: quebre o produto de
propósito, confirme que o cenário falha, reverta, confirme que volta a passar.

### O planner é a assinatura Claude, não a chave do Gemini

Planejar usa o `claude` CLI pelo perfil **`fera`** (conta da empresa), ligado a
esta pasta por um `.envrc` que o direnv carrega. Custo reportado: **$0**, porque
sai da assinatura. Replay não usa modelo nenhum.

```bash
npx windup claude status --profile fera
npx windup claude login --profile fera --force   # se cair
```

O `.envrc` não é versionado (guarda caminho absoluto de home), então cada
máquina roda o `login --profile fera` uma vez.

Os cenários foram planejados nas duas ferramentas, e a diferença não é sutil:

| | Gemini 3.1 flash-lite | Claude (assinatura) |
|---|---|---|
| Chamadas por cenário | 1 a 6 | 1, quase sempre |
| Custo | ~$0,15 por cenário | **$0** |
| Cenários que nunca saíram | `/cancelamento` | nenhum |

O Gemini entrava em **loop** em algumas páginas: repetia ação atrás de ação até
estourar o teto de 8192 tokens de saída, e o JSON chegava cortado. Dá para ver
com `LOG_LEVEL=debug`:

```
[planner] attempt 1.2: truncated=true out_tokens=8176 len=24005
  tail="…{ \"id\": \"a82\", \"type\": \"wait_for\", …"
```

O `"id": "a82"` entrega: é a **ação número 82**, num schema que limita a 30.
Não era tamanho de página nem de task, e trocar para `gemini-3.1-pro-preview`
não resolvia. Se precisar voltar, `--llm google` continua funcionando, mas
espere esse comportamento de volta.

### O patch que este projeto carrega

O `patches/windupjs@1.9.0.patch` (via `bun patch`) conserta um bug que **impede
o `claude-code` de funcionar**: o adapter faz `spawn` da CLI sem opção `stdio`,
então o stdin do filho vira um pipe que ninguém escreve nem fecha; a CLI espera
3 segundos, avisa e sai com código 1. O patch passa
`stdio: ["ignore", "pipe", "pipe"]`.

O `model` na config também precisa ser **explícito**. Sem ele, o Windup cai no
default do Google e manda `gemini-3.1-flash-lite` como `--model` para a CLI do
Claude, que responde 404. O erro chega como `the claude CLI exited with code 1`,
sem dizer o motivo, porque a CLI devolve o detalhe no stdout e o adapter só
mostra o stderr.

Os dois foram reportados. Ao subir de versão, teste se ainda são necessários e
remova o patch se não forem.

Por que `.windup/cache` é versionado: replay não precisa de conta, de chave, nem
do `claude` CLI instalado. Quem clonar o repo roda os 155 sem configurar nada.
