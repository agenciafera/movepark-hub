# Agente de WhatsApp: reserva no white-label, conhecimento no Hub

> Traz para o Hub o agente que hoje roda no Dify. A **reserva continua nascendo no white-label**,
> exatamente como hoje, e o **conhecimento passa a vir do Hub**. Decidido com o Kallef em
> 21/08/2026. Conecta com [chatbot.md](./chatbot.md), [knowledge-base.md](./knowledge-base.md),
> [mcp.md](./mcp.md) e [espelhamento-preco-wl.md](./espelhamento-preco-wl.md).

## Por que existe

O atendimento de WhatsApp roda hoje num agente do Dify: prompt, tools e nove bases de
conhecimento vindas do Notion, com o n8n fazendo a ponte com o WhatsApp. Sair do Dify tira uma
dependência externa e traz prompt, tools e conhecimento para dentro do repo, onde passam por
revisão e teste.

**O que NÃO muda:** o white-label. Nenhuma alteração do lado do parceiro, nem no fluxo de reserva,
nem na forma de identificar o cliente. Decisão do Kallef, e é o que delimita o escopo desta spec.

## Escopo

| Entra | Fica de fora |
|---|---|
| Runtime do agente no Hub | Qualquer mudança no white-label |
| Conhecimento vindo do RAG do Hub | Reserva nascer no Hub para unidade externa |
| Tools de preço e reserva do WL | Autenticação do cliente no fluxo do WL |
| Prompt versionado, editável em `app_setting` | O bot do site (`chat`), que já existe e continua |

## O que já existe, e é a maior parte

Levantamento de 21/08/2026, comparando as 7 tools do agente do Dify com o que o Hub tem:

| O agente do Dify faz | No Hub | Estado |
|---|---|---|
| `current_time` + `weekday` | `current_datetime` e o bloco de calendário no prompt | ✅ pronto |
| Consulta as 9 bases do Notion | RAG do Hub: 74 FAQs de unidade + camada `auto` + destino + global | ✅ pronto |
| `consulta_preco_reserva` | `wlGetCalculationPrice` em `_shared/wl/client.ts` | ✅ existe, falta virar tool |
| `consulta_placa_veiculo` | Edge `lookup-vehicle-plate`, mesma base externa, devolve `brand`/`model`/`color` | ✅ existe, falta virar tool |
| Resolve unidade → slug do WL | `company.wl_domain` + `location_parking_type.wl_category_slug`/`wl_product_slug` | ✅ é dado, não palpite |
| `gerar_link_pagamento` | nada | ❌ **Edge nova** (`POST /backend/order/quick-pay`) |
| `consulta_reserva_por_numero` | nada | ❌ **Edge nova** (`GET /backend/order/detail`) |
| `consulta_reserva_email_ou_telefone` | nada | ❌ **Edge nova** (`GET /backend/order/last-by-user`) |

O runtime também já existe: a Edge `chat` tem laço de function-calling com teto anti-loop, prompt
em `app_setting`, 12 tools de leitura do registro compartilhado e 9 transacionais executadas pelo
MCP `/customer`. Ela **já é cliente do nosso MCP**.

## As correções que vêm de graça ao sair do Dify

Não são melhorias de estilo: são pontos onde hoje dá para errar em silêncio.

**1. O slug da unidade para de ser adivinhado.** O workflow `prepara_dados_reserva` é um nó de
`gpt-4o-mini` que lê um JSON escrito à mão com as 10 unidades e tenta acertar `categoria`,
`tipo_vaga` e `api_base_url`. No Hub isso é um `select`. E a lista do Dify já está errada: tem
vírgula sobrando no JSON do Move Parking, lista quatro tipos de vaga na Aerovalet Guarulhos contra
três no Hub, e inclui a Move Parking, cuja empresa está `inactive`.

**2. O preço para de ser extraído por LLM.** Hoje um modelo lê o JSON da API e tenta achar
`data.cart.total_price.price`. O Hub tem `parseCalculationPrice`, testado, com tratamento de
estadia mínima (`WlMinimumStayError`).

**3. O `payment_method_code` para de passar por um modelo.** O Dify tem um nó de LLM inteiro para
converter "Link de Pagamento" em `movepark-checkout`. É constante.

**4. O número da reserva para de ser normalizado por LLM.** O formato é `XXXXXX-XXXX`, e o Dify
gasta um `gpt-4o-mini` com a instrução "NUNCA complete ou preencha com zero se tiver dígitos
faltando". É uma regex, e a regex não inventa dígito num número de pedido.

**5. O telefone para de ser normalizado por LLM.** Mesmo caso: tirar caractere especial e prefixar
`55` quando falta o DDI. Regex.

**6. Os dados da reserva param de ser extraídos por LLM.** As duas tools de consulta leem o JSON do
WL com um extrator de modelo que recebe uma lista de caminhos (`property.license_plate`,
`payment_response.qr_code`, e por aí). É desserialização.

Somando: **seis chamadas de modelo por atendimento** que deixam de existir. Isso não é economia de
custo, é remoção de superfície de erro. Cada uma delas pode devolver o campo errado sem falhar.

## Arquitetura

```
WhatsApp → n8n (só transporte) → Edge do agente no Hub
                                    │
                    ┌───────────────┼────────────────┐
                    ▼               ▼                ▼
            conhecimento      tools do WL      tools do Hub
            (RAG do Hub)    (unidade externa)  (unidade nativa)
                            preço, placa,      MCP /customer,
                            gerar link         com JWT
```

O agente escolhe a família de tools pela `location.checkout_mode`. Unidade externa fala com o WL;
unidade nativa fala com o MCP do Hub, que exige JWT. **As duas convivem de propósito**, e é a
consequência direta de não mexer no WL.

## As tools do WL

### Resolver a unidade

Do banco, nunca de lista escrita à mão:

```sql
company.wl_domain                          -- ex.: virapark-app.movepark.co
location_parking_type.wl_category_slug     -- ex.: aeroporto-afonso-pena
location_parking_type.wl_product_slug      -- ex.: vaga-coberta
```

Só entram unidades com `company.status = 'active'` e `location.is_listed`. Isso já teria excluído
a Move Parking, que o Dify ainda oferece.

### Consultar preço

```
GET {wl_domain}/api/v3/cart/calculation-price
    ?lang=pt-br&initial_date=&final_date=&category_slug=&product_slug=
```

Sem autenticação. **É o mesmo endpoint que o `wl-price-mirror` já amostra**, então o cliente e o
parser são reuso direto.

Vale registrar por que a consulta é ao vivo e não ao espelho: o espelho é amostragem periódica e
pode divergir (`mirror_status = 'divergent'`). Como a reserva vai fechar no WL, o preço citado na
conversa precisa ser o que o parceiro vai cobrar.

### Consultar placa

Reusa a Edge `lookup-vehicle-plate`, que consulta a mesma base externa que o Dify e já devolve
`brand`, `model` e `color` normalizados.

**Ponto de atenção:** ela exige JWT hoje, e o cabeçalho dela explica o motivo, que a API externa é
paga e o JWT evita abuso anônimo. No fluxo do WhatsApp não há JWT. Trocar por chave interna
(`x-<nome>-key` do Vault, molde dos crons) mantém a proteção sem exigir login, e é a saída
recomendada. **Não** deixar anônima.

### Gerar o link de pagamento

```
POST {wl_domain}/api/v3/backend/order/quick-pay      Authorization: Bearer <WL_BACKEND_TOKEN>
{
  "origin": "whatsapp-bot",
  "email", "phone", "full_name",
  "initial_date", "final_date",          // Y-m-d H:i:00
  "vehicle": { "license_plate", "brand", "model", "color" },
  "category_slug", "product_slug",
  "payment_method_code": "movepark-checkout"
}
```

Resposta: `payment_response.payment_url` para link; no PIX, `qr_code_url`, `qr_code` e
`expires_at`. Quando já existe reserva no mesmo período, volta `order_number`, e o agente deve
explicar isso em vez de criar duplicata.

O `WL_BACKEND_TOKEN` já existe como secret e é o mesmo Bearer global usado por `wl-deliver` e
`wl-reconcile`. **Nunca vai ao front.**

### Consultar reserva pelo número

```
GET {wl_domain}/api/v3/backend/order/detail?order_number=XXXXXX-XXXX
    Authorization: Bearer <WL_BACKEND_TOKEN>
```

O número segue o formato `XXXXXX-XXXX`. O Dify aceita o que o cliente digitar (`#123456 .
123456-7890V` é o exemplo do próprio prompt) e limpa antes de consultar. No Hub isso é uma regex,
e ela recusa em vez de chutar quando faltam dígitos.

A resposta traz `status.name`, `payment_method.type`, `payment_response.*`, `property.interval`,
`property.initial_date`/`final_date`, os campos do veículo e `voucher_url`.

**Esta tool é parte do caminho de venda, não só do pós-venda.** Quando o `quick-pay` recusa por já
existir reserva no mesmo período, ele devolve o `order_number`, e o fluxo consulta essa reserva
para responder com o link de pagamento dela. Sem isso o agente ou cria duplicata ou trava numa
mensagem de erro crua.

### Consultar reserva por e-mail ou telefone

```
GET {wl_domain}/api/v3/backend/order/last-by-user?email=<e-mail>
GET {wl_domain}/api/v3/backend/order/last-by-user?phone=5541999999999
    Authorization: Bearer <WL_BACKEND_TOKEN>
```

Um ou outro, nunca os dois: o Dify ramifica por qual dos campos veio preenchido, e o e-mail tem
precedência. Mesma resposta da consulta por número.

O nome do endpoint é literal: devolve a **última** reserva daquela pessoa. Quem tem duas viagens
marcadas recebe uma delas em silêncio, sem aviso de que existe outra. Vale expor isso na resposta
da tool (quantas existem, qual está sendo mostrada) em vez de repetir o comportamento.

## Identidade: anônimo, por decisão

O agente do Dify não autentica ninguém: coleta nome, e-mail e telefone na conversa e cria a
reserva. Isso **se mantém**, porque mudar exigiria mexer no WL.

A consequência é que o Hub passa a ter duas famílias de tools com premissas opostas, e isso
precisa estar claro para quem for mexer depois: as tools do WL são anônimas por contrato com o
parceiro, e as do Hub exigem JWT por ADR-006. Uma não é modelo para a outra.

## Segurança

### A busca por e-mail ou telefone entrega o voucher de terceiro

Com o DSL em mãos, dá para ser exato sobre o tamanho disso. O `last-by-user` não pede nenhuma
prova de posse: o identificador é só um parâmetro de query, autenticado pelo Bearer da Movepark,
não pela pessoa. Quem digitar o e-mail de outra recebe nome, veículo, placa, período, status de
pagamento e **`voucher_url`**.

O `voucher_url` é o que importa aqui. Ele não é um recibo, é a **credencial de check-in**: quem
tem o voucher retira o carro. A tool, como está, transforma "sei o e-mail de alguém" em "tenho o
voucher da reserva dessa pessoa".

**No Hub isso tem conserto para o telefone, e não tem para o e-mail.** No WhatsApp o número da
conversa já é prova de posse, porque quem fala está de posse da linha. Então:

| Caminho | Decisão |
|---|---|
| Telefone **da conversa**, vindo do metadado do WhatsApp | pode consultar |
| Telefone **digitado** pela pessoa na conversa | não consulta |
| E-mail | não consulta sem outro fator |

O corte é entre número **do canal** e número **do texto**, e ele precisa estar no código, não no
prompt: prompt não é controle de acesso, e um modelo aceita "o telefone é 41 9xxxx, pode
verificar" com naturalidade. Para o e-mail, o caminho honesto é confirmar por um dado que só o
titular sabe (a placa, por exemplo) ou mandar o voucher para o próprio e-mail em vez de exibir na
conversa.

Enquanto o Dify estiver no ar o furo continua existindo do lado dele. Isso é motivo para migrar
antes, não para reproduzir.

### O token do WL vazou nos exports

O mesmo Bearer aparece em texto puro nos nós de HTTP de **três** DSLs (`Gerar link de pagamento`,
`Consultar reserva por número` e `Consultar reserva por e-mail ou telefone`). É o token global de
backend: autoriza criar reserva e ler pedido em todos os white-labels. Rotacionar, e tratar
export de DSL como arquivo com segredo.

## Nada mais bloqueia

Com os cinco DSLs lidos, o inventário fechou. O que falta construir são **três chamadas ao mesmo
backend do WL**, todas no path `/api/v3/backend` que o `_shared/wl/client.ts` já fala, com o
mesmo Bearer e o mesmo `X-Tenant`:

| Rota | Para quê |
|---|---|
| `POST /order/quick-pay` | cria a reserva e devolve link ou PIX |
| `GET /order/detail` | consulta pelo número, e trata duplicata na venda |
| `GET /order/last-by-user` | consulta por telefone (com a regra de posse acima) |

Elas nascem juntas, porque o caminho de venda usa as duas primeiras e a terceira é o que responde
quem já comprou.

## Prompt

Vem do `pre_prompt` do DSL, não do campo `description`. O `app.description` guarda uma versão
velha, com 5 unidades em vez de 9 e a frase "você não tem ferramentas para consultar reserva", que
é falsa desde que as duas tools de consulta entraram.

Mora em `app_setting`, editável sem deploy, com o default versionado no código (mesmo padrão do
`chatbot_system_prompt`). A regra anti-alucinação do prompt atual (todo dado de contato vem da
Knowledge da unidade ou de uma tool) fica, e o RAG do Hub a serve melhor: os campos estruturados
agora existem e a camada `auto` os responde sempre atualizados.

## Testes

| Camada | O quê |
|---|---|
| Deno | resolução unidade → slug a partir do banco, incluindo unidade inativa e sem mapeamento |
| Deno | montagem do payload do `quick-pay`, com e sem dados de veículo |
| Deno | tratamento de `order_number` (reserva duplicada) e de erro do WL |
| Vitest | as tools do WL só aparecem para unidade com `checkout_mode = 'external'` |
| pgTAP | a consulta de mapeamento não devolve unidade de empresa inativa |

Nenhum teste chama o `quick-pay` de verdade: ele cria reserva e cobra.

## Pendências

1. Decidir a autenticação da consulta de placa (recomendado: chave interna do Vault).
2. Decidir se o Hub expõe a consulta por e-mail, e sob qual segundo fator. A por telefone da
   conversa está resolvida acima; a por e-mail não tem solução que não mexa no fluxo.
3. Decidir se o Hub registra a intenção de venda quando a reserva nasce no WL. Hoje não registra:
   `origin: whatsapp-bot` fica só do lado do parceiro, e do ponto de vista do Hub a venda não
   aconteceu. Existe meio-termo, gravar a intenção sem virar `booking`, que dá atribuição sem
   tocar no WL.
4. Contrato com o n8n: quem guarda o histórico da conversa, e como chegam `phone_number`,
   `contact_name` e `origin`.
