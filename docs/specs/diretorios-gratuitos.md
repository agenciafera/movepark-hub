# Diretórios gratuitos: onde a Movepark entra e com que texto

> **Status:** levantamento de 27/11/2026, cadastros ainda não feitos. Cada cadastro cria conta,
> aceita termos e publica dados da empresa, então quem faz (ou autoriza um por um) é uma pessoa da
> equipe, com o e-mail `contato@movepark.co`. Código de verificação e senha ficam com essa pessoa.
>
> **Depende de:** [rotina-semanal-busca-e-ia.md](./rotina-semanal-busca-e-ia.md) (a quinta-feira de
> "fontes que a IA lê" e o item 13 da fila, marca) e
> [plano-autoridade-backlinks.md](./plano-autoridade-backlinks.md).

## 1. O que diretório faz e o que não faz

Link de diretório é quase sempre `nofollow` e aponta para a home. Ele **não** sobe a posição de
"estacionamento viracopos" sozinho; o que sobe é a página certa com o termo exato e link interno
(ver a seção 5 da rotina semanal, migration `20261209140000`). O diretório serve para outra coisa:

1. **Entidade.** Google e IA cruzam o nome da marca em várias fontes com os mesmos dados. A
   Bandeira Park é citada a partir do site, do Google e do site do aeroporto; a Movepark aparece
   quase só nela mesma.
2. **Confiança.** No Brasil, quem não conhece a marca procura no Reclame Aqui antes de pagar.
3. **Desambiguação.** Existe homônimo com reputação ruim (seção 2), e hoje ele responde pela marca.

## 2. O homônimo do Reclame Aqui

A página [`reclameaqui.com.br/empresa/movepark-estacionamentos`](https://www.reclameaqui.com.br/empresa/movepark-estacionamentos/)
**não é da Movepark.** O CNPJ dela é 22.132.629/0001-28, **CPP Estacionamentos Ltda**, pátio em
Guarulhos (Vila Florida) aberto em 2015, com o site `moveparkestacionamentos.com.br`. Em 27/11/2026
ela tinha reputação **Não recomendada**, 16 reclamações, 31,3% respondidas, e aparece na busca
"movepark estacionamento aeroporto". Isso fecha o item 13 da fila da rotina semanal: é homônimo.

São três CNPJs com o mesmo nome. Só o primeiro é nosso:

| CNPJ | Razão social | Quem é |
|---|---|---|
| 68.183.164/0001-35 | Movepark Tecnologia Ltda | a Movepark (`movepark.co`) |
| 22.132.629/0001-28 | CPP Estacionamentos Ltda | pátio de Guarulhos que se apresenta como "MovePark Estacionamentos" |
| 66.606.374/0001-63 | Movepark 1 Estacionamentos Ltda | outra homônima, já registrada na memória do projeto; nunca completar cadastro nela |

**Consequência para o schema:** a `organizationSchema()` (`src/lib/jsonld.ts`) declara
`alternateName: ["Movepark Brasil", "Movepark Estacionamentos"]`. O segundo nome é exatamente o do
homônimo, então o site afirma ao Google que as duas entidades são a mesma. Tirar esse nome e
desambiguar no `llms.txt` é a ação de código que acompanha o cadastro no Reclame Aqui.

## 3. Os diretórios, por prioridade

A Movepark é plataforma online, sem balcão de atendimento. Isso tira dela os diretórios locais que
exigem endereço onde o cliente vai. O endereço do CNPJ é residencial e **não entra em diretório
nenhum**.

| # | Diretório | Cabe? | O que fazer | Para onde aponta |
|---|---|---|---|---|
| 1 | **Reclame Aqui** | Sim | Cadastrar a empresa no CNPJ 68.183.164/0001-35 (é gratuito), com o nome "Movepark" e o site `movepark.co`. Responder tudo o que chegar. Não reivindicar nem responder na página do homônimo | home |
| 2 | **Trustpilot** | Sim (negócio online) | Conta gratuita de empresa no domínio `movepark.co`, verificada pelo e-mail do domínio. Pedir avaliação só depois do check-out, sem incentivo | home |
| 3 | **Crunchbase** | Sim | Perfil gratuito de organização: descrição, site, LinkedIn, ano de fundação | home |
| 4 | **StartupBase (Abstartups)** | Sim | Perfil gratuito de startup brasileira | home |
| 5 | **Parkopedia** | Em parte | Não lista intermediário. Serve para conferir se Virapark e Garageinn estão lá com endereço e site corretos, e sugerir correção | ficha do parceiro |
| 6 | **Perfil do Google dos parceiros** | Sim, pelo parceiro | Já é o item 10 da fila (Conteúdo 112). A Movepark não é elegível a perfil próprio, porque o Google não aceita negócio só online | white-label ou ficha |
| 7 | **Tripadvisor** | Não como empresa | O Tripadvisor cadastra hotel, restaurante e atração; plataforma de estacionamento fica de fora. O fórum de Campinas tem tópicos "Estacionamento Viracopos", e uma resposta identificada cabe lá (seção 5) | página de Viracopos |
| 8 | **Reddit** | Não é diretório | Não existe cadastro de empresa. Vale resposta identificada em tópico real de r/campinas, r/saopaulo ou r/viagens, de conta pessoal com histórico. Post promocional de conta nova é removido e marca a conta | página de Viracopos |
| 9 | Bing Places, Apple Business Connect | Não | Os dois exigem endereço de atendimento | |
| 10 | Wikidata | Ainda não | Exige referência independente (imprensa). Revisitar quando sair matéria da pauta do índice de férias (Conteúdo 71) | |

Cylex, Hotfrog, Apontador e similares pedem endereço e dão link de baixo valor. Ficam fora.

## 4. Os dados do cadastro (iguais em todo lugar)

A IA cruza fonte por fonte. O mesmo nome, a mesma descrição e o mesmo contato em todos.

- **Nome:** Movepark
- **Razão social:** Movepark Tecnologia Ltda
- **CNPJ:** 68.183.164/0001-35
- **Site:** https://movepark.co
- **E-mail:** contato@movepark.co
- **WhatsApp:** (11) 99475-2952
- **Categoria:** estacionamento de aeroporto; serviço de reserva de estacionamento; viagem
- **Área atendida:** Brasil (online, sem endereço de atendimento)
- **Redes:** instagram.com/moveparkestacionamento, linkedin.com/company/movepark, a página do
  Facebook de `src/lib/redes.ts`
- **Logo:** https://movepark.co/brand/logo-movepark.svg

**Descrição curta (até 160 caracteres):**

> A Movepark compara estacionamentos perto dos aeroportos do Brasil, com preço da diária,
> distância até o terminal e reserva online nos parceiros.

**Descrição longa:**

> A Movepark é um site que compara estacionamentos perto de aeroportos e rodoviárias do Brasil.
> Para cada aeroporto, a página mostra o estacionamento oficial e os pátios do entorno, com preço
> da diária, distância até o terminal e traslado. Nos parceiros, a reserva e o pagamento por PIX
> ou cartão acontecem no site, pelo valor que aparece na tela. Nos demais, a página mostra o
> preço publicado pelo próprio estacionamento, com a data da consulta. Em Viracopos, por exemplo,
> a comparação completa fica em https://movepark.co/estacionamentos/aeroporto-viracopos.

**Linha de desambiguação** (no "sobre" do Reclame Aqui e onde houver campo livre):

> A Movepark (Movepark Tecnologia Ltda, CNPJ 68.183.164/0001-35) não tem relação com a MovePark
> Estacionamentos de Guarulhos.

## 5. Resposta em fórum (Tripadvisor e Reddit)

Só em tópico aberto que pergunte de estacionamento em Viracopos, de conta pessoal de alguém da
equipe, **dizendo que trabalha na Movepark**. Fórum que proíbe link de quem tem vínculo fica sem
o link. Preço citado tem que ter data e sair de fonte conferida no dia; o modelo abaixo usa os
valores da dona de preço de VCP em 26/11/2026 e precisa ser reconferido antes de postar.

> Trabalho na Movepark, então leve isso em conta. O estacionamento oficial de Viracopos cobrava
> R$ 83,00 a diária no edifício garagem e R$ 31,00 no bolsão F em 26/11/2026. Para viagem de
> vários dias, os pátios de fora com van costumam sair mais barato. A lista com preço e distância
> de cada um está em https://movepark.co/estacionamentos/aeroporto-viracopos.

## 6. Registro

| Data | Diretório | URL do perfil | Quem fez | Nota |
|---|---|---|---|---|
| | | | | |
