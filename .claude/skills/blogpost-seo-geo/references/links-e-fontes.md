# Link interno, link externo e a regra do concorrente

A lista de domínios vive em [`../scripts/fontes.json`](../scripts/fontes.json),
que é lida pelo analisador. Este arquivo explica a regra por trás dela. Ao
descobrir um concorrente novo, acrescente no JSON em vez de deixar no julgamento
de quem escreve, senão a regra vale só enquanto alguém lembra dela.

## Link interno

**Pelo menos um para `/destinos/<slug>`.** É a página que converte e onde mora o
preço vivo. Sem ela, o post preserva o ranking e desperdiça a visita, porque não
tem para onde mandar o leitor. O analisador trata a ausência como bloqueio.

**Dois ou três para outros posts.** O acervo tem 93. Link entre posts distribui
autoridade e ajuda o Google a entender que existe um cluster sobre aquele
aeroporto, com uma página principal (o destino) e satélites (os posts).

**Rótulo que descreve o alvo.** "Estacionamentos no Aeroporto de Guarulhos"
funciona; "clique aqui" não. O texto do link é sinal de relevância para o alvo, e
é a única pista que o leitor tem antes de clicar.

**Caminho relativo.** Use `/destinos/aeroporto-de-confins`, não a URL absoluta.
Post do blog termina com barra: `/blog/<slug>/`. Sem a barra, o worker devolve
301, e um salto interno desnecessário é desperdício.

## Link externo

Pelo menos um, sempre com contexto: uma frase que diz o que a fonte é e por que
está ali. Link externo de fonte reconhecida é sinal de confiança para o Google e
critério de escolha para os motores generativos, que preferem texto que cita.

### Quem é concorrente direto

A pergunta não é "essa empresa é nossa parceira?", é **"essa página pode fechar a
reserva no lugar do Hub?"**. Se a resposta for sim, o link está proibido.

| Categoria | Exemplo | Por quê |
|---|---|---|
| Agregador e comparador de vaga | Parkopedia, ParkVia, Looking4Parking | Disputa exatamente a mesma busca e a mesma reserva |
| Rede de estacionamento | Estapar, Zul+ | Idem |
| **Site próprio de parceiro** | Garageinn, Aeropark, Virapark | Parceiro na operação, concorrente no checkout. O post existe para a reserva fechar no Hub |
| **Estacionamento oficial do aeroporto** | `gru.com.br/estacionamento`, `viracopos.com/.../estacionamento` | É o concorrente número um do produto, não uma fonte neutra |
| Subdomínio de parceiro herdado | qualquer coisa que venda vaga | Idem |

O analisador cobre isso de três formas: lista explícita (`bloqueadas`), padrão no
host (`park`, `parking`, `estacion`, `vaga`, `valet`, `garagem`, exceto domínios
próprios e operadores de aeroporto) e, para operador de aeroporto, bloqueio só
quando o caminho é de estacionamento.

### Quem é fonte segura

Site oficial de aeroporto **fora da página de estacionamento** (voos, terminais,
acessos, obras), órgão público (ANAC, gov.br, IBGE, INMET, Detran), imprensa
estabelecida, Wikipedia para entidade, entidade setorial (IATA, ICAO, Abear).

Boas ocasiões para citar: regra de bagagem ou antecedência que vem da ANAC, dado
de movimento de passageiros do aeroporto, obra ou mudança de acesso noticiada,
previsão de tempo em texto sobre alta temporada, legislação de consumo.

### Como citar

Nomeie a fonte no texto, não só no link: "segundo a ANAC, o tempo recomendado de
antecedência para voo doméstico é de uma hora". Isso serve ao leitor, ao Google e
principalmente ao modelo, que reproduz a atribuição junto com o dado.

Prefira link direto para a página que sustenta a afirmação, não para a home. E
confira que a página existe antes de publicar: link quebrado para fonte é pior
que nenhum link, porque a afirmação fica sem lastro.

## Um caso que já aconteceu

Na reimportação do WordPress, 165 links no corpo dos posts apontavam para um
domínio que sai do ar. Cada caminho precisou ser remapeado para o Hub, e em 4
posts o rótulo visível era a própria URL antiga, o que deixaria na tela um
endereço que não existe mais. A lição prática: **rótulo nomeia o destino, nunca a
URL**, porque URL envelhece e rótulo continua verdadeiro.
