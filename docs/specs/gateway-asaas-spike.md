# Spike Asaas: o que foi medido no sandbox (14/08/2026)

> **Status:** spike de avaliação, sem decisão de arquitetura tomada. Nada aqui é ADR ainda.
> Reproduzível por [`scripts/asaas-probe.ts`](../../scripts/asaas-probe.ts).

Contexto: avaliamos trocar o Pagar.me pelo Asaas porque precisamos de controle de saldo e de
repasse ao parceiro. Este documento guarda **só o que foi medido contra a API**, para nenhuma
decisão futura ser tomada em cima de suposição. O que está aqui saiu de resposta HTTP real,
não de leitura de doc.

Conta usada: `MOVEPARK TECNOLOGIA LTDA`, sandbox, status `APPROVED`.

## Os dois desenhos possíveis, e o que cada um faz

### Desenho 1: cobrança na conta raiz, split para a subconta

É o que mais se parece com o que rodamos hoje. A Movepark é a titular da cobrança e o parceiro
recebe a parte dele por split.

Medido: cobrança de R$ 100 na raiz, split de 85% para a subconta, com **Conta Escrow habilitada
na subconta** (`enabled: true`, `daysToExpire: 7`).

| O que se esperava | O que aconteceu |
|---|---|
| Valor do parceiro retido pela Escrow | `escrow: null` na cobrança |
| Saldo bloqueado na subconta | `balance: 84.15`, **disponível na hora** |

**A Conta Escrow não retém crédito recebido via split.** Habilitar a Escrow na subconta não tem
efeito nenhum sobre o dinheiro que chega nela por split de uma cobrança de outra conta.

### Desenho 2: cobrança na própria subconta, split da comissão para a raiz

Medido: cobrança de R$ 100 criada com a **apiKey da subconta**, split de 15% para a carteira da
raiz, mesma Escrow habilitada.

| O que se esperava | O que aconteceu |
|---|---|
| Valor retido pela Escrow | `escrow: { status: "ACTIVE", expirationDate: "2026-08-21" }` |
| Saldo bloqueado na subconta | saldo disponível **não subiu**, seguiu em `84.15` |

**A Escrow funciona, e só funciona assim:** a cobrança precisa nascer na subconta.

## O achado que não estava na doc

No Desenho 2, a comissão da Movepark que volta por split para a raiz **também entra em garantia**.
Extrato da conta raiz logo depois do pagamento:

```
  14.85  saldo 70.29  INTERNAL_TRANSFER_CREDIT     Comissão recebida do parceiro
 -14.85  saldo 55.44  PAYMENT_CUSTODY_BLOCK        Bloqueio de saldo Conta Escrow da comissão
                                                   recebida do parceiro
```

O dinheiro entra e sai no mesmo instante. **A nossa receita fica retida pelo mesmo `daysToExpire`
que retém a do parceiro.** Isso não aparece em lugar nenhum da documentação e tem efeito direto
no nosso capital de giro: com `daysToExpire: 7`, a comissão de toda venda demora uma semana para
ficar disponível.

## Consequências do Desenho 2, se for o escolhido

Cada uma é trabalho e nenhuma é opcional:

- **O parceiro passa a ser o titular da cobrança.** Muda quem aparece no comprovante do cliente e
  muda a nota fiscal. O [ADR-004](../../CLAUDE.md) precisa ser reescrito: hoje ele diz que o
  parceiro não tem conta no gateway e fica invisível. Com BaaS ele segue sem ser **contatado** pelo
  Asaas, mas passa a ser o vendedor do ponto de vista fiscal.
- **Precisamos da apiKey de cada parceiro.** Ela volta **uma única vez**, no corpo do `POST
  /v3/accounts` (`accessToken.apiKey`), e não é recuperável depois. A raiz consegue gerar outra,
  mas não consegue ler a existente. Guardar isso cifrado no banco vira requisito.
- **A chave da raiz não opera a cobrança da subconta.** Confirmar a cobrança da subconta com a
  chave da raiz devolve **404**. As operações de cobrança seguem a chave dona.

## Transferência entre contas (o desenho alternativo)

Medido: `POST /v3/transfers { value: 1.00, walletId: <subconta> }` com a chave da raiz.

```json
{ "status": "PENDING", "transferFee": 0, "operationType": "INTERNAL", "type": "ASAAS_ACCOUNT" }
```

Funciona, sem taxa. É o caminho de custódia: a cobrança fica na raiz (Movepark titular, como hoje)
e o repasse sai quando a gente decidir. Não tem retenção automática por prazo, e o dinheiro é
nosso enquanto está parado.

## Outros fatos medidos

- **A taxa sai antes do split.** R$ 100 viram `netValue` R$ 99,01 (taxa de R$ 0,99 no sandbox), e o
  percentual do split incide sobre o líquido: 85% de 99,01 = R$ 84,15. Quem emite a cobrança
  absorve a taxa, e **não existe equivalente do `charge_processing_fee`** do Pagar.me, que hoje usamos
  para jogar a taxa no parceiro.
- **`walletId` da raiz não vem no `/myAccount`.** Sai de `GET /v3/wallets`.
- **O sandbox recusa celular com dígito repetido** (`11999999999` devolve `invalid_mobilePhone`).
- **CNPJ de subconta é único.** Repetir devolve `O CNPJ ... já está em uso`, então teste precisa
  gerar documento válido a cada execução.
- **A Conta Escrow já estava liberada** na nossa conta de sandbox, sem pedido ao gerente.

## Limites da Conta Escrow, medidos

Reprodutível em [`scripts/asaas-probe-escrow-prazo.ts`](../../scripts/asaas-probe-escrow-prazo.ts)
e [`scripts/asaas-probe-escrow-finish.ts`](../../scripts/asaas-probe-escrow-finish.ts).

**O prazo máximo de retenção é 45 dias.** Varri os valores e a partir de 60 a API recusa:

```
daysToExpire=30   -> HTTP 200 aceito
daysToExpire=60   -> HTTP 400 "O período de expiração não pode ser maior que 45."
```

Isso é decisivo para reserva antecipada: a janela de risco vai até o check-in, e reserva feita com
dois meses de antecedência já ultrapassa o teto.

O teto não está na documentação técnica, mas o próprio Asaas o publica no blog institucional: *"a
liberação pode ser feita de três formas: automática após o prazo definido (até 45 dias), manual via
API de pagamentos ou por desativação da funcionalidade"*
([blog.asaas.com](https://blog.asaas.com/conta-escrow-asaas/)). Medição e fornecedor batem.

**Valor sob garantia não pode ser estornado.** A garantia zera o saldo disponível, e o estorno
precisa de saldo:

```
saldo da subconta com garantia ativa: { "balance": 0 }
POST /payments/{id}/refund -> HTTP 400
  "Não é possível efetuar o estorno pois não há saldo suficiente."
```

**A liberação manual funciona, mas só com a chave da raiz.** Com a chave da subconta vem 404:

```
POST /escrow/{id}/finish (chave da SUBCONTA) -> HTTP 404
POST /escrow/{id}/finish (chave da RAIZ)     -> HTTP 200
escrow depois: { "status": "DONE", "finishReason": "REQUESTED_BY_CUSTOMER" }
saldo depois:  { "balance": 199.01 }
```

**Mesmo depois de liberar, o estorno falhou.** A conta recebeu o líquido e o estorno cobra o bruto:

```
saldo 199.01  ·  estorno de 200.00  ->  HTTP 400 "Saldo insuficiente."
```

A diferença é exatamente a taxa de R$ 0,99. **Toda conta que recebe precisa carregar um float para
conseguir estornar**, porque nunca recebe o valor cheio. Numa subconta de parceiro recém-criada esse
float é zero, então o primeiro cancelamento sempre trava. Vale para qualquer desenho: a conta raiz
sofre do mesmo, só que na prática tem saldo acumulado para cobrir.

## A conta principal não é chamada de "conta de custódia" pelo Asaas

Pergunta que apareceu na decisão e que vale ficar registrada: os Termos e Condições de Uso do Asaas
definem a conta assim:

> "Conta Asaas é definida como uma conta de pagamento digital pré-paga, **exclusiva para fins
> comerciais**, local onde consta o saldo, bem como onde ficam registradas as transações de pagamento
> realizadas pelo Cliente."

Não há, em nenhum material do Asaas, definição da conta principal como conta de custódia. A palavra
custódia aparece só no marketing do produto **Conta Escrow**, que retém saldo de subconta.

O que joga a favor do nosso desenho: os Termos listam **"envio de pagamentos a terceiros"** entre as
finalidades da conta. Repassar ao parceiro é uso previsto.

O que não existe: cláusula dizendo que o saldo é recurso de terceiro sob nossa guarda. Perante o
Asaas, aquele saldo é da Movepark. **A custódia é uma construção do nosso contrato com o parceiro e
da nossa escrituração, não um tipo de conta que o gateway ofereça.**

⚠️ Verificação incompleta: a página dos Termos responde **HTTP 403** a leitura automatizada, então o
texto acima vem de trechos indexados, não do documento inteiro. A cláusula que mais importa, se
existe restrição a movimentar recurso de terceiro ou a atuar como intermediador, **não foi lida**.
Antes de fechar o desenho, alguém precisa ler o documento completo.

## Em aberto

- **Expiração do PIX em minutos.** Não deu para testar: `GET /payments/{id}/pixQrCode` devolve
  `Você não possui uma chave Pix cadastrada para recebimentos de cobranças via Pix`. Falta cadastrar
  chave PIX no sandbox. Importa porque hoje a validade do QR é amarrada à janela de hold
  (E0.3.1-a) e o `dueDate` do Asaas tem granularidade de dia.
- **Liberação do BaaS**, que é o que impede o Asaas de mandar e-mail ao parceiro. Depende do
  gerente de contas.
- **Mensalidade da Escrow em produção:** R$ 99,90 da conta principal mais R$ 9,90 por subconta
  habilitada, conforme a doc. Não verificado com o comercial.
