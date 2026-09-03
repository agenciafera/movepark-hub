# Robô de pesquisa de preço de concorrente

> **Épico:** E0.17 · **ADRs:** ADR-009 (capacidade), ADR-010 (lote mapeado)
> **Status:** entregue em 03/09/2026. Migration `20261112090000_robo_de_pesquisa_de_preco.sql`,
> Edge `prospect-price-research` (cron semanal), tela `/manager/pesquisa-de-preco`.
>
> Fecha o ciclo aberto por [`lote-mapeado-vitrine.md`](./lote-mapeado-vitrine.md) (as colunas
> `researched_*`) e por `20261111091500` (a validade de 90 dias).

## O problema que ele resolve

A página de destino só responde "quanto custa" onde existe preço. Hoje são **4 fichas com
preço entre 145 mapeadas**, todas conferidas à mão em 28 e 29/08/2026. Com a validade de 90
dias, as quatro vencem em 27/11/2026 e a resposta some de novo.

Reconferir 145 sites à mão, de 90 em 90 dias, não acontece. Quem depende de mutirão depende de
alguém lembrar, e a página fica muda no intervalo. O que não tem robô não tem cadência.

## A regra que decide o desenho inteiro

**O robô propõe. Uma pessoa publica.**

Ele nunca escreve em `prospect_location`. Escreve numa fila de propostas
(`prospect_price_research`), e um `hub_admin` aplica pela RPC. Não é excesso de zelo: o número
publicado é uma afirmação da Movepark sobre o preço de outra empresa. Um modelo lendo HTML
troca diária por mensalidade, pega preço de moto, pega promoção vencida e pega o preço de
outra unidade da mesma rede. Qualquer um desses publicado sozinho é exatamente o processo que
a validade de 90 dias existe para evitar.

O que o robô entrega não é o preço: é o trabalho braçal de achar a fonte, abrir a página e
destacar o trecho. A decisão continua humana, e passa a levar segundos.

## A prova viaja junto

Cada proposta guarda três coisas além dos números:

| Campo | Para quê |
|---|---|
| `source_url` | A URL exata que foi lida, não o domínio |
| `fetched_at` | O instante do acesso, que vira o `researched_at` publicado |
| `evidence` | O **trecho literal** da página de onde os números saíram |

É o que transforma "achamos que o Park Confins cobra R$ 35" em "em 12/11/2026 o site do Park
Confins publicava esta frase". Se a reclamação vier do concorrente, a resposta é o trecho.

Número sem trecho não vira proposta: `parseExtracao` zera os valores quando o modelo devolve
preço sem evidência.

## Como uma passada funciona

```
pg_cron, domingo 05:00 UTC
  └─ Edge prospect-price-research
       ├─ 1. escolhe até 8 fichas (selectCandidatos)
       ├─ 2. descobre o site pelo google_place_id (Places API, fieldMask id,websiteUri)
       ├─ 3. lê o robots.txt do site e obedece
       ├─ 4. baixa a página, tira script/style, corta em 20 mil caracteres
       ├─ 5. Gemini com responseSchema, temperatura 0
       └─ 6. grava PROPOSTA (nunca prospect_location)
```

**Quem entra na passada** (`selectCandidatos`, pura e testada): ficha publicada, não
convertida, com `google_place_id`, sem proposta em aberto e sem falha nos últimos 30 dias, cujo
preço está a 30 dias ou menos do vencimento (ou nunca existiu). A ordem é por urgência: quem
nunca teve preço primeiro, depois quem vence antes.

**Por que semanal.** Preço de estacionamento não muda toda semana, cada passada custa chamada
de Places, download e chamada de modelo, e a validade de 90 dias dá doze passadas de folga
antes de um preço vencer. Domingo 05:00 UTC é o buraco entre o espelho de preço (04:00 e
07:00) e o refresh do Google (03:00).

**Por que 8 por passada.** A Edge derruba a invocação em 150s e cada ficha custa uns 10s. O que
não coube volta no topo da passada seguinte, porque a ordem é por urgência.

### O robots.txt não é formalidade

O robô acessa o site de outra empresa para publicar uma afirmação sobre o preço dela. "Eu
ignorei o robots.txt" é a primeira coisa que aparece se a conversa virar reclamação, e é a
mais difícil de justificar depois. Então:

- User-agent identificado: `MoveparkPriceBot/1.0 (+https://movepark.co/sobre)`.
- `robots.txt` lido e obedecido (`robotsPermite`, com Allow vencendo Disallow mais específico,
  grupo do nosso agente vencendo o `*`).
- 404 no robots libera, que é o padrão do formato. Erro de servidor **não** libera: sem
  resposta não dá para afirmar que o dono permitiu, e a ficha volta na passada seguinte.
- Uma requisição por ficha por passada, uma vez por semana.
- Rede social (Facebook, Instagram, linktree, WhatsApp) é descartada antes de qualquer
  download: não é tabela de preço.

### O que o modelo pode e não pode devolver

O prompt é de extração, não de redação: temperatura 0 e `responseSchema` obrigatório.

- Só preço de **carro**, em reais. Moto, mensalista e serviço extra ficam fora.
- Duração que a página não publica volta **nula**. Multiplicar a diária por 7 é proibido:
  preço que a página não publica não existe, e publicá-lo seria inventar a oferta do outro.
- Teto de sanidade por duração (R$ 500 na diária, R$ 12.000 no mês): acima disso é leitura
  errada, não preço. Zero e negativo também caem fora.

O texto que entra no prompt é conteúdo de terceiro e pode conter instrução endereçada ao
modelo. Duas defesas: a saída é reduzida a números e a um trecho (nada vira comando), e nenhum
campo chega à página sem uma pessoa aprovar.

## A decisão, na tela

`/manager/pesquisa-de-preco` mostra, na mesma linha, o que está publicado hoje e o que o robô
achou, mais o trecho da página e o link para a fonte. A decisão é comparativa por natureza: "de
R$ 22,90 (29/08) para R$ 24,90 (12/11)" se decide numa olhada, e dois números em telas
diferentes, não.

O link para o site do concorrente existe **aqui e só aqui**. Na página pública a regra continua
sendo nunca linkar quem vende vaga; no painel é o contrário, quem decide precisa abrir a fonte
antes de aprovar.

**Aplicar substitui os quatro valores, a data e a fonte de uma vez**, nulos inclusive. A linha
publicada passa a descrever uma leitura só, de uma fonte só, numa data só. Misturar diária de
novembro com semanal de agosto sob um `researched_at` único publicaria uma data que não vale
para metade dos números.

Tentativa que não achou preço entra como `failed` e aparece na fila com o motivo (site fora do
ar, robots recusou, o lugar não publica site no Google). Não é ruído: é o aviso de que aquela
ficha vai ficar sem preço quando a validade vencer. Dispensar limpa a linha, e a ficha volta a
ser candidata em 30 dias.

## A chave do cron mora só no banco

Os outros seis crons de Edge deste projeto guardam a chave em dois lugares: no Vault, para o
`pg_cron` mandar no header, e nos secrets da Edge, para a função comparar. Aqui ela mora só no
Vault, e a Edge pergunta ao banco se bate (`cron_key_matches`, que devolve booleano e nunca o
segredo, e só `service_role` executa).

Duas razões: o valor nasce de `gen_random_bytes` dentro do banco e nunca precisa ser lido por
um humano, nem passar por terminal, CLI ou transcrição de sessão; e rotacionar vira um UPDATE
no Vault, sem redeploy da função.

## O que isto NÃO faz

- **Não afrouxa o ADR-010.** Nenhuma coluna nova em `prospect_location`. A fila é tabela
  separada, e o site nunca a lê.
- **Não guarda o site do concorrente no cadastro.** A URL é redescoberta a cada passada pelo
  `google_place_id`. Endereço de site do concorrente não aparece na página de destino, e a
  regra de crescimento do ADR-010 não autorizaria a coluna.
- **Não cria promessa de transação** (ADR-009). Nada vira `Offer` no JSON-LD, nada toca
  `booking`, `fare`, cupom ou payout.
- **Não pesquisa preço de parceiro.** Esse vem do motor, e em unidade externa do espelho
  ([espelhamento-preco-wl.md](./espelhamento-preco-wl.md)).

## Custo

Por ficha: uma chamada de Places Details (fieldMask `id,websiteUri`, SKU Essentials), um
download de página e uma chamada de `gemini-2.5-flash` com até 20 mil caracteres. Com 8 fichas
por semana, é ruído no orçamento das duas APIs, ambas já usadas pelo projeto
(`GOOGLE_PLACES_SERVER_KEY` e `GEMINI_API_KEY`).

## Testes

- `supabase/functions/prospect-price-research/index.test.ts` (Deno, 20 casos): a escolha de
  candidatos com todas as portas de exclusão, o parser de robots.txt (Allow x Disallow, grupo
  do agente, comentário), o HTML virando texto sem script nem style, e o parser da saída do
  modelo (sem evidência, valor absurdo, zero, sem extrapolar a diária).
- `supabase/tests/price_research.test.sql` (pgTAP, 14 casos): a proposta não muda o preço
  publicado, uma proposta aberta por lote, aplicar substituindo os quatro valores e carimbando
  a data do acesso, proposta sem valor ou sem fonte recusada, e os grants.
- `src/routes/manager/pesquisa-de-preco.test.tsx` (Vitest, 6 casos): a comparação lado a lado,
  o trecho e o link da fonte, aplicar e recusar chamando o servidor, e a linha sem preço que
  não oferece Aplicar.

## Operação

Rodar uma passada na mão (o header vem do Vault, ninguém precisa saber a chave):

```sql
select net.http_post(
  url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/prospect-price-research',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-price-research-key',
    (select decrypted_secret from vault.decrypted_secrets where name = 'prospect_price_research_key')
  ),
  body := '{"limit": 3}'::jsonb,
  timeout_milliseconds := 150000
);
```

`body` aceita `prospect_location_id` para forçar uma ficha específica e `limit` para o tamanho
da passada (teto de 25).

## Limites conhecidos

- **Site em SPA não é lido.** Página que só monta o preço com JavaScript volta sem texto e
  entra como `failed`. Renderizar JS no Edge é outro problema, e a maioria dos sites de
  estacionamento é HTML servido.
- **Uma página por ficha.** O robô lê a home do site, não navega até `/precos`. Quando o preço
  mora numa página interna, a passada volta sem número. Seguir link é o próximo passo natural,
  e vale medir antes: link errado gasta a passada e traz preço de outra coisa.
- **Ninguém é avisado quando a fila cresce.** A decisão depende de alguém abrir
  `/manager/pesquisa-de-preco`. Se virar problema, o molde já existe no
  `site-rebuild-health.yml`.
