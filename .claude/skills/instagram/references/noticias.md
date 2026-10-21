# Pauta de notícia: o método completo

O resumo e as travas ficam no [`SKILL.md`](../SKILL.md), Passo 1. Aqui está o
método inteiro: o que conta como pauta, onde procurar, quanto tempo a notícia
vale, como citar, como a notícia chega no destino e o front matter.

## Por que existe

A Movepark reúne estacionamento em 26 destinos no Brasil e 3 em Portugal
(outubro de 2026). Quem segue o perfil está planejando viagem, e o que muda a
viagem dessa pessoa acontece fora do blog: a obra que fecha uma faixa do acesso a
Confins, o feriado que lota Guarulhos, a greve que atrasa voo em Lisboa.

O corte de blogpost envelhece devagar. O post de notícia mostra que o perfil sabe
o que está acontecendo agora, e por isso é ele que faz alguém seguir a conta.

O risco também muda. O blog erra quando desatualiza com o tempo; a notícia erra
no dia, em público, com a marca embaixo. Por isso a pauta de notícia tem mais
trava que o corte de blogpost.

## As três portas

Uma notícia só vira post se passar nas três. Falhou em uma, descarta, por melhor
que seja a história.

| Porta | Pergunta | Passa | Não passa |
|---|---|---|---|
| **Praça** | Afeta quem sai de carro rumo a um destino que a Movepark atende, ou quem viaja no país inteiro? | Obra no viaduto de acesso a Viracopos | Aeroporto novo numa cidade sem destino nosso |
| **Decisão** | Muda o que a pessoa faz: a hora de sair, onde deixar o carro, quanto gasta, quando reservar? | Feriado prolongado com previsão de recorde de passageiros | Companhia aérea troca o uniforme |
| **Fonte** | Tem fonte primária, ou dois veículos independentes, com data de publicação? | Comunicado no site oficial do aeroporto | Print de grupo, post sem data, "fontes dizem" |

A lista dos destinos atendidos sai do banco, não da memória. Somente leitura, pelo
MCP do Supabase (projeto `mgaigbezdalbyuqiofcf`):

```sql
select code, short_name, city, country, public_slug
from public.destination
where is_published
order by country, code;
```

Notícia nacional (feriado, regra da ANAC, recorde de movimento no país) passa na
porta da praça sem um destino só. O post usa os dois ou três destinos mais
afetados como exemplo, e o CTA aponta para o índice `/estacionamentos`.

## O que vira pauta

O `tema` vai no front matter e muda a validade.

| `tema` | O que procurar | Quanto tempo vale |
|---|---|---|
| `crise` | Greve, pane, pista fechada, temporal, apagão, protesto no acesso | Horas. Sai no mesmo dia ou no seguinte, senão descarta |
| `operacao` | Obra no aeroporto, terminal novo ou fechado, embarque e desembarque mudando de lugar, ponto de traslado novo, rota ou companhia nova | Enquanto a mudança durar, com início e fim conferidos |
| `acesso` | Obra ou interdição na rodovia de acesso, pedágio novo, linha de trem ou ônibus até o terminal | Enquanto durar |
| `demanda` | Feriado prolongado, férias escolares, alta temporada, show, congresso, jogo grande, recorde de passageiros | Sai de 7 a 21 dias antes do pico. É antecipação |
| `regra` | Mudança da ANAC, regra de bagagem, documento de embarque, direito do passageiro em atraso ou cancelamento | Enquanto vigente, citando a data em que passou a valer |
| `internacional` | Regra de entrada na Europa, greve em aeroporto de Portugal, voo novo entre Brasil e Portugal | Conforme o tipo de fato, pelas linhas acima |

**O calendário é a pauta mais segura e a mais esquecida.** Feriado e férias
escolares são públicos, têm data certa e ninguém desmente. Toda varredura olha as
três semanas seguintes: o que estiver de 7 a 21 dias à frente vira post de
`demanda`.

## O que nunca vira pauta

- **Tragédia.** Acidente aéreo, morte, crime. Marca de estacionamento não comenta,
  nem em tom de pêsames: qualquer post ali soa oportunista.
- **Política.** Greve entra pelo efeito na viagem (horário, fila, o que fazer),
  nunca pelo mérito de quem tem razão.
- **Rumor.** "Pode fechar", "deve aumentar", "fontes dizem". Sem confirmação de
  quem decide, espera a confirmação.
- **Concorrente.** Promoção, inauguração ou problema de outro estacionamento. A
  regra do blog vale igual: o inimigo é a escolha ruim, nunca o rival.

## Onde procurar

A imprensa serve para achar o fato; a fonte primária serve para confirmar. Cite a
primária sempre que ela existir.

| Assunto | Fonte primária | Onde o fato costuma aparecer antes |
|---|---|---|
| Obra, operação ou crise no aeroporto | Site e perfis oficiais de quem opera o aeroporto (a concessionária, ou a Infraero onde ela ainda opera) | Imprensa regional |
| Regra, direito do passageiro, movimento nacional | ANAC e Ministério de Portos e Aeroportos, no `gov.br` | Agência Brasil, imprensa nacional |
| Rodovia de acesso | Concessionária ou órgão estadual de estradas responsável pelo trecho | Imprensa regional |
| Feriado, férias escolares, evento | Lei de feriados, calendário da secretaria estadual de educação, prefeitura, organizador do evento | Imprensa local |
| Portugal | ANA Aeroportos de Portugal, governo português | Imprensa portuguesa |

Não decore qual empresa opera cada aeroporto: concessão troca de mão. Ache o
operador pela busca e confira o domínio oficial antes de citar.

**A varredura.** Busca na web com recorte da última semana, uma rodada por região
e uma pelo calendário. Consultas que funcionam: `aeroporto de Confins obra`,
`Guarulhos mudança embarque terminal`, `feriado novembro aeroportos movimento`,
`aeroporto de Lisboa greve`. No Firecrawl, `firecrawl_search` com `tbs: "qdr:w"`
limita à última semana. Resultado sem data visível não serve de fonte.

**Ritmo.** Uma varredura por semana, no começo da semana. O que passar nas três
portas vira pauta; se nada passar, a semana fica com os cortes de blogpost.
Notícia forçada desgasta o perfil mais do que uma semana sem notícia.

## Validade: as duas datas

Duas datas vão no front matter e o analisador confere as duas.

- **`fonte_data`**: quando a fonte publicou.
- **`validade`**: até quando o post continua verdadeiro. A obra termina, a greve
  acaba, o feriado passa.

1. **Publicar depois da `validade` é proibido.** O analisador bloqueia, tanto pela
   data agendada quanto pela data de hoje.
2. **Fonte com mais de 7 dias na data de publicar pede reconferência.** Abra a
   fonte de novo e procure atualização. Feriado e regra vigente costumam passar
   nessa reconferência; o analisador marca em laranja para lembrar, não para
   barrar.
3. **Crise sai no mesmo dia ou no seguinte.** Greve que acabou anteontem,
   publicada hoje, deixa a marca desinformada em público. O analisador bloqueia
   `tema: crise` com mais de 1 dia entre a fonte e a publicação.
4. **Confira de novo na hora de publicar.** O rascunho pode ter passado um dia
   esperando aprovação.

## Como citar

- A legenda **nomeia a fonte e a data** no corpo: "Segundo a ANAC, em 20/10".
  Legenda não tem link clicável, mas o nome permite a quem lê conferir. O
  analisador exige o `fonte_nome` escrito na legenda e uma data junto.
- **Número da notícia vai exatamente como a fonte deu**, com a unidade.
  Arredondar ou estimar transforma o dado em dado nosso, e a marca passa a
  responder por ele.
- **Previsão da fonte continua sendo previsão**: "a concessionária prevê", nunca
  "vai ter".
- A fonte é o órgão ou o veículo. Nunca um perfil de concorrente, nunca o post de
  outro perfil de viagem.

## A ponte até o destino

Post que termina na notícia é jornal, e o perfil vende estacionamento. Toda
notícia fecha no que ela muda **para quem vai de carro**, e daí no destino:

```
[GANCHO]     O fato, com a praça. Até 125 caracteres.
[O QUE MUDA] O efeito para quem vai de carro até o aeroporto.
[O QUE FAZER] 2 a 4 linhas concretas: sair mais cedo, reservar antes, qual acesso usar.
[FONTE]      Quem disse e quando. Obrigatório.
[CTA]        "Compara os lotes no link da bio." apontando para o destino afetado.
[HASHTAGS]   Praça + intenção + marca.
```

O molde com exemplo está em [`legendas.md`](legendas.md).

O `cta_url` aponta para `/estacionamentos/<public_slug>` do destino afetado, com
UTM, ou para `/estacionamentos` quando a notícia é nacional.

**O ADR-009 vale igual, e aqui a tentação é maior.** Alta demanda puxa "garanta
sua vaga", "últimas vagas", "vai lotar". Todas proibidas: a legenda não sabe
quantas vagas a unidade tem. Fale da demanda, que tem fonte, e do comportamento
("reserve com antecedência", "compare antes"), nunca da vaga.

## Formato e imagem

- **Post único ou carrossel curto, de 3 a 5 slides.** Notícia não sustenta 7
  slides e envelhece antes de alguém arrastar até o fim.
- **Story acompanha bem**, com o sticker de link para o destino. Em crise, story
  sozinho pode ser o formato certo: some em 24 horas junto com o problema.
- **A imagem nunca encena o fato.** Foto gerada por IA de fila na greve, pista
  alagada ou terminal lotado é imagem falsa de acontecimento real, e vira
  desinformação mesmo com a legenda correta. Use cena genérica (pátio, estrada de
  acesso, carro saindo de casa, mala no porta-malas) ou o slide tipográfico do
  template, variante `texto`. Foto real do acontecimento só com direito de uso e
  crédito.
- A regra de frota moderna e cenário atual do Passo 7 vale igual.

## Cadência

- **Nunca dois posts no mesmo dia**, notícia inclusive. Crise fura a fila: o corte
  de blogpost marcado para o dia anda um dia.
- Notícia de `demanda` entra no calendário como qualquer corte, com data
  escolhida dentro da janela de 7 a 21 dias.

## O front matter

O `origem_post` segue o formato da fila de publicação (`fato-AAAA-MM-DD-<assunto>`,
ver [`instagram-fila-de-publicacao.md`](../../../../docs/specs/instagram-fila-de-publicacao.md)),
e é o prefixo `fato-` que avisa o analisador que o post é de notícia. Os valores
abaixo são ilustrativos.

```markdown
---
tipo: post
origem_post: fato-2026-10-20-obra-acesso-confins
tema: acesso
destination: aeroporto-de-confins
keyphrase: aeroporto de Confins
fonte_nome: <órgão ou veículo, como vai escrito na legenda>
fonte_url: https://<site oficial>/<comunicado>
fonte_data: 2026-10-20
validade: 2026-11-30
publicar_em: 2026-10-22
cta_url: https://movepark.co/estacionamentos/aeroporto-confins?utm_source=instagram&utm_medium=social&utm_campaign=fato-confins-obra-acesso
slides:
  - texto: Obra muda o acesso ao aeroporto de Confins
    arquivo: aeroporto-de-confins-obra-acesso-01.jpg
    alt: carro na rodovia de acesso ao aeroporto de Confins no fim da tarde
hashtags: [confins, dicasdeviagem, movepark]
---
```

A `keyphrase` da notícia é a praça somada ao assunto, do jeito que a pessoa
digita ("aeroporto de Confins", "obra no aeroporto de Confins"), e segue as regras
do Passo 4: nos primeiros 125 caracteres e no alt da capa.
