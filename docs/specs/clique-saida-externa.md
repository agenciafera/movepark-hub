# Registro de clique de saída (E0.16)

> **Épico:** E0.16 · **Fase:** 0 · **Depende de:** E0.14

## Por quê

A reserva da unidade externa não nasce no Hub, então não há `booking` para ancorar métrica.
Sem registro de saída não dá para saber se a vitrine externa converte ou se o cliente some no
caminho, nem reconciliar com o relatório do parceiro.

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

