# Fórmulas de legenda por tipo de corte

Quatro moldes, um por corte. Não são texto para copiar: são a ordem dos blocos e
o que cada bloco precisa entregar. A copy final sai da leitura do post, e passa
pela skill `revisar-texto` antes de ser gravada.

Lembre dos limites: 2.200 caracteres, 125 visíveis, sem link clicável, sem
travessão.

---

## Corte 1: o gancho da frase-chave

Objetivo: fazer quem nunca ouviu falar da Movepark entender em 3 segundos o que
o artigo resolve.

```
[GANCHO]     Frase-chave + a tensão. Até 125 caracteres.
[PROMESSA]   O que a pessoa leva daqui, em uma frase.
[CORPO]      3 a 5 linhas, uma ideia por linha, começando pela mais concreta.
[PROVA]      Um número com unidade e data.
[CTA]        "O guia completo está no link da bio."
[HASHTAGS]   Praça + intenção + marca.
```

Exemplo de esqueleto preenchido:

> Estacionar no aeroporto de Confins por uma semana custa de R$ 315 a R$ 840.
>
> A diferença quase nunca é o pátio. É o traslado.
>
> O que muda o preço de verdade:
> Distância até o terminal
> Se a vaga é coberta ou não
> Quantas diárias você fecha de uma vez
> O horário do seu voo
>
> Levantamento de agosto de 2026, com 6 lotes conferidos na fonte.
>
> O guia completo está no link da bio.

---

## Corte 2: quanto custa

Objetivo: ser a resposta de preço que a pessoa procurou no Google e não achou.
É o corte com maior chance de salvamento, então o valor precisa estar legível no
slide, não só na legenda.

```
[GANCHO]     A pergunta de preço, do jeito que ela é digitada.
[PROMESSA]   "A conta de <mês/ano>, faixa por faixa."
[CORPO]      Uma linha por faixa de diária. Número primeiro, contexto depois.
[RESSALVA]   Data de referência e de onde veio o número. Obrigatório.
[CTA]        "A tabela atualizada fica no link da bio."
[HASHTAGS]
```

**Nunca publique preço sem data.** Tarifa sem data vira promessa que ninguém
consegue retirar depois, e o post fica errado em silêncio. Se o número veio de
lote sem contrato, cite a fonte pelo nome e nunca linke para ela.

---

## Corte 3: a pergunta que todo mundo faz

Objetivo: resposta primeiro, contexto depois. É o formato que vira citação e que
o Google mostra.

```
[GANCHO]     A pergunta, literal, terminada em "?".
[RESPOSTA]   A resposta na linha seguinte, direta, sem rodeio. Uma ou duas frases.
[PORQUÊ]     2 a 4 linhas explicando o que sustenta a resposta.
[CTA]        "Tem mais dúvida? Manda aqui nos comentários."
[HASHTAGS]
```

O CTA de comentário é de propósito neste corte: pergunta puxa pergunta, e cada
comentário novo é pauta do próximo post.

---

## Corte 4: o erro que custa caro

Objetivo: quebrar objeção sem falar mal de ninguém. O inimigo é a escolha ruim,
nunca o concorrente.

```
[GANCHO]     O erro, na segunda pessoa, sem acusação.
[CUSTO]      O que ele custa, em dinheiro, hora ou estresse.
[SAÍDA]      O que fazer no lugar. Concreto, verificável.
[CTA]        "Compara os lotes no link da bio antes de reservar."
[HASHTAGS]
```

**Não nomeie concorrente**, nem por @, nem por hashtag, nem por descrição
reconhecível. A regra do blog vale igual aqui.

---

## Banco de ganchos

Os quatro formatos que sustentam os primeiros 125 caracteres.

| Formato | Molde | Quando usa |
|---|---|---|
| Número que surpreende | "<Ação> em <praça> custa de R$ X a R$ Y. A diferença é <variável>." | Corte de preço |
| Erro comum | "Quem <ação> em <praça> costuma errar em <ponto>." | Corte de objeção |
| Pergunta digitada | "<pergunta da cauda longa, literal>" | Corte de FAQ |
| Contexto que decide | "<Situação concreta> muda tudo na escolha do estacionamento." | Corte de gancho |

Puxe a pergunta literal do arquivo de cauda longa em vez de inventar:

```bash
jq -r '.perguntas_por_aeroporto.CNF[]' docs/specs/dados/cauda-longa-aeroportos.json
```

## Banco de CTAs

Um por post. Nunca empilhe.

| Intenção | CTA |
|---|---|
| Levar ao blog | "O guia completo está no link da bio." |
| Levar ao destino | "Compara os lotes no link da bio." |
| Levar ao preço | "A tabela atualizada fica no link da bio." |
| Gerar comentário | "Tem mais dúvida? Manda aqui nos comentários." |
| Gerar salvamento | "Salva esse post para consultar na hora de viajar." |
| Gerar compartilhamento | "Manda para quem viaja com você." |

**Proibidos**, porque prometem capacidade que a unidade pode não ter (ADR-009):
"reserve com cancelamento grátis", "garanta sua vaga", "preço fixo garantido".

## O que sempre soa a IA

O portão é a skill `revisar-texto`, mas estes são os vícios que mais aparecem em
legenda e que o analisador marca:

- Travessão. Proibido no projeto inteiro.
- "Não é só X, é Y."
- Regra de três em tudo ("prático, rápido e seguro").
- Superlativo vazio: "incrível", "imperdível", "revolucionário".
- Abertura com "Você sabia que".
- Emoji em série no fim de cada linha.
- Eyebrow em CAIXA ALTA.
