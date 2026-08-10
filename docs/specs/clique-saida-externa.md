# Registro de clique de saída (E0.16)

> **Épico:** E0.16 · **Fase:** 0 · **Depende de:** E0.14
> **Status:** implementado em 10/08/2026. Migration `20261001000000_external_exit_click.sql`,
> `src/features/listing/exitClick.ts`, `src/lib/anonSession.ts`.

## Por quê

A reserva da unidade externa não nasce no Hub, então não há `booking` para ancorar métrica.
Sem registro de saída não dá para saber se a vitrine externa converte ou se o cliente some no
caminho, nem reconciliar com o relatório do parceiro.

Quando o épico foi aberto havia uma unidade externa. Hoje são **seis**, doze vagas, cinco delas
listadas e vendendo em quatro destinos. O clique de saída é o único ponto do funil que o Hub
consegue observar.

## Como

**Fire-and-forget.** O registro não pode atrasar o redirect: `sendBeacon` ou insert
assíncrono, nunca `await` antes de navegar. Um clique perdido é aceitável; um redirect lento
não é.

**Guardar o que permite reconciliar, não quem clicou.** Local, tipo de vaga, datas da busca,
sessão anônima, timestamp. **Sem PII.**

## O funil que isso destrava

```
impressão na busca → clique de saída → reserva confirmada no relatório do parceiro
```

É o que responde se a vitrine externa vale o esforço, e alimenta a decisão de quando começar a
negociar a migração daquele parceiro para o Hub.

## Como ficou

| Peça | Onde |
|---|---|
| Tabela | `external_exit_click` |
| Gravação | RPC `log_external_exit`, SECURITY DEFINER, `anon` + `authenticated` |
| Leitura do funil | RPC `manager_external_exit_clicks`, hub_admin |
| Disparo | `src/features/listing/exitClick.ts` |
| Sessão anônima | `src/lib/anonSession.ts` |
| Retenção | 180 dias, dentro de `cron_prune_integration_logs` |
| Testes | Vitest 13, pgTAP `external_exit_click.test.sql` (15) |

### `keepalive`, e não `sendBeacon`

O épico sugeria `sendBeacon`. Ficou `fetch` com `keepalive: true`, pelo mesmo motivo que o
`sendBeacon` existiria: autorizar o navegador a terminar a requisição depois que a página saiu.
Um `fetch` comum é cancelado no unload, e o clique se perde justamente nos casos que mais
importam, que são os que de fato saíram.

O `sendBeacon` não deixa definir cabeçalho, e o PostgREST exige `apikey` e `Content-Type`. Daria
para contornar mandando a chave na query string, mas aí a chave anônima entra no log de acesso
de todo mundo no caminho. `keepalive` resolve sem esse custo.

`sendExitClick` **não devolve promessa**, de propósito: sem promessa não há como alguém dar
`await` nela antes de navegar, que é o bug que este arquivo inteiro existe para não ter. Há
teste travando isso.

### A tabela não aceita escrita direta

Nem `anon` nem `authenticated` têm policy de INSERT. Quem grava é a RPC definer, e ela só aceita
**vaga ativa de unidade externa**: um `uuid` qualquer é recusado. Isso limita o alvo às doze
vagas que existem, em vez de deixar um endpoint anônimo aceitando qualquer coisa.

A RPC devolve `boolean` (gravou ou não). Quem chama ignora; o retorno existe para o teste
conseguir afirmar cada recusa.

### Dedup de 5 minutos

Mesma sessão, mesma vaga, mesmas datas, dentro de cinco minutos: não conta de novo. Clique
duplo, voltar-e-clicar e abrir em nova aba são a mesma intenção, e contá-los como três infla
justamente a métrica que existe para decidir se vale migrar o parceiro.

Datas diferentes na mesma sessão contam, porque são outra intenção de compra.

### Sem PII, e a trava para continuar assim

A sessão anônima é um `randomUUID` por aba em `sessionStorage`. Não deriva de nada do usuário,
morre quando a aba fecha, e a tabela não tem coluna que a ligue a `profiles`. Nem para quem está
logado: a reconciliação com o parceiro se faz por unidade e data, nunca por pessoa.

Há um teste que varre as chaves do evento procurando `email`, `phone`, `name`, `cpf`, `profile`,
`user`, `ip` e `document`. Ele existe porque o jeito de essa tabela virar base de rastreamento é
alguém adicionar "só um campinho" numa terça-feira.

## O que este épico NÃO entrega

O funil tem três elos e só o do meio existe agora:

- **Impressão na busca:** o Hub não registra impressão. Nunca registrou, e ninguém pediu ainda.
- **Clique de saída:** ✅ este épico.
- **Reserva confirmada no parceiro:** o WL não devolve reserva por API. Hoje isso chega por
  relatório manual, e o cruzamento é por unidade e data, que é exatamente o que a tabela guarda.

Com o elo do meio no lugar, dá para responder "quantas pessoas o Hub mandou para o parceiro X em
agosto" e levar esse número para a mesa de negociação. A taxa de conversão completa depende dos
outros dois.

## Limite conhecido

A dedup é por sessão informada pelo cliente, então não protege contra inflação deliberada: basta
rotacionar a sessão. Ela resolve o caso real, que é o mesmo humano clicando duas vezes.

Defesa contra abuso pediria rate-limit na borda, como o que já existe para a Public API
(`API_RATELIMIT` no Worker). A hora de fazer isso é quando o número virar base de decisão
comercial ou de repasse, não antes.
