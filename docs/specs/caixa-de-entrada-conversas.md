# Caixa de entrada das conversas da Mia

Tela `/manager/conversas`: lista à esquerda, conversa à direita, como no WhatsApp Web.
Substitui o Studio do Mastra, que é ferramenta de desenvolvedor (lista thread por id
cru, não tem busca, não distingue lida de não lida e não deixa ninguém responder).

Vale só para a Mia (`movepark-hub`). O Go2Park continua no Studio.

## Por que existe uma ponte, e não uma consulta

As conversas **não moram no banco do Hub**. Elas vivem no Postgres do beast-bots
(`ghotifumqvedlkmeqwli`), que é outro projeto Supabase. Então o front nunca fala com
o banco das conversas:

```
Manager (front)  →  Edge `mia-inbox` (portão hub_admin)  →  beast-bots `/inbox`  →  Postgres
```

O portão existe porque o token do beast-bots (`MASTRA_ADMIN_TOKEN`) não pode chegar ao
navegador. A Edge confere `profiles.role === 'hub_admin'` e monta o corpo **campo a
campo**: nada que o cliente mandou passa direto.

> **Armadilha desse desenho, já paga uma vez (27/08/2026):** campo novo que a tela
> mande e o portão não copie **some em silêncio**. A resposta continua 200, e o
> sintoma aparece longe: `busca` e `cursor` foram esquecidos, então a busca não
> filtrava nada e a rolagem infinita devolvia a primeira página de novo. Ao acrescentar
> parâmetro, acrescente também em `corpoParaOBeastBots` e no teste
> `supabase/functions/mia-inbox/index.test.ts`.

## Estado da caixa, na metadata da thread

`mastra_threads.metadata` é `jsonb` e já carrega as chaves `channel_*` do canal. A caixa
acrescenta três, com prefixo próprio:

| Chave | O que guarda |
|---|---|
| `inbox_lida_ate` | ISO da última mensagem que a equipe viu |
| `inbox_assumida_por` | uid de quem assumiu (nulo = agente ativo) |
| `inbox_assumida_em` | ISO |

Escrita com `UPDATE ... SET metadata = metadata || $2::jsonb`, **nunca** com
`updateThread`: ele recebe o objeto inteiro e apagaria as chaves do canal numa corrida.

**Não lida** é derivado, sem contador para dessincronizar: a última mensagem é do cliente
**e** `inbox_lida_ate` está ausente ou é anterior a ela.

## Assumir a conversa cala o agente

`handler-canal.ts` lê a thread antes do `defaultHandler`. Se `inbox_assumida_por` existe:
grava a fala do cliente e sai, sem chamar o agente. O agente **só volta quando alguém
devolve**, nunca sozinho.

> **A thread tem dois nomes, e a busca precisa aceitar os dois.** O canal conhece a
> conversa pelo id externo (`whatsapp:<phoneNumberId>:<telefone>`), e a thread em geral
> se chama `<tenant>:<plataforma>:<id externo>`. Em geral: depois da colisão da D67, 26
> das 195 threads deste tenant ficaram com **id aleatório**, e só o
> `channel_externalThreadId` da metadata as liga ao canal. Procurar só pelo id montado
> não dava erro, dava **"ninguém assumiu"**, e a Mia respondia por cima de quem estava
> atendendo. Medido em 28/08/2026 na conversa do (41) 8814-9449. Por isso
> `SQL_QUEM_ASSUMIU` casa pelos dois e devolve o `id` e o `resourceId` reais: gravar a
> fala do cliente no id montado criaria uma conversa fantasma que ninguém vê.

> **O achado que molda isso:** a mensagem do cliente só é gravada **dentro** do
> `defaultHandler`. Um `return` seco antes dele perderia a mensagem, e o humano não veria
> o que o cliente mandou, que é justamente o ponto da funcionalidade. Por isso o caminho
> pausado chama `saveMessages` por conta própria (`assumida.ts`).

Em dúvida (erro ao ler a metadata), o agente responde: cliente sem resposta nenhuma é
pior que resposta automática numa conversa que alguém atendia.

## Busca e paginação são do servidor

A lista vem de 30 em 30, cortada pelo **horário** da última conversa da página. `offset`
seria instável aqui: a ordem muda a cada mensagem que chega, e quem rola veria conversa
repetida e conversa pulada.

A busca é consulta, não filtro de navegador. Filtrar no navegador só acha o que coube na
página aberta. Ela alcança:

- o **telefone**, comparado só por dígitos, para "(41) 98814" achar `5541988149449`;
- o **texto de toda mensagem** da conversa, para "voucher" ou uma placa acharem.

> **A fala do cliente não tem `content.content`.** Ela chega do canal com o texto só em
> `parts[].text`, e o papel dela é `signal`, não `user`. Uma busca que olhe apenas a
> primeira forma acha somente o que a Mia respondeu, que é o avesso do útil: quem procura
> uma placa está procurando o que o cliente escreveu.

`parametrosDaBusca` (em `inbox-sql.ts`) guarda o limite disso: menos de 4 dígitos não vira
busca de telefone, senão "carro 2" viraria `%2%`, casaria com quase todo número do banco e
devolveria a lista inteira parecendo resultado.

## Quem escreveu

Os dois balões da esquerda são a Mia e a equipe, e sem nome eles se confundem: quem abre
a conversa amanhã não sabe se aquela frase foi o robô ou um colega. O nome é gravado no
envio (`inbox_enviado_por_nome`) e vem do **perfil de quem tem o JWT**, nunca do corpo,
senão um admin assinaria como outro. Mensagem enviada antes de existir esse campo só tem
o uid, e para essas a tela diz "Equipe", que é o que dá para afirmar com honestidade.

### De que lado fica cada um

O **cliente à esquerda, em cinza**; quem atende (Mia ou equipe) **à direita, em roxo**.
É o arranjo do WhatsApp Web, e a caixa é lida por quem atende: invertido, a pessoa lê a
própria equipe como se fosse o cliente.

A `Bubble` nasceu na bolinha de teste, onde "user" é você e o lado direito é seu. Aqui
quem escreve à direita é a Mia, então o papel do balão é o **oposto** do papel na
conversa. Ela também separa `role` (lado e cor) de `markdown` (como o texto é lido):
enquanto as duas coisas eram a mesma, inverter os lados fazia a Mia aparecer com
`**Virapark**` cru na tela.

## Origem

A conversa diz de onde veio, derivado do formato do id da thread (`:manager:` é a bolinha
de teste do Manager, o resto é WhatsApp). A tela mostra o logo do WhatsApp ou um globo.

O telefone `5500000000000` é o sentinela de "sem cliente" da bolinha de teste e aparece
como **Teste sem cliente**: formatado, viraria "(00) 00000-0000" e passaria por cliente de
verdade na lista.

## Anexos

Imagem, áudio, arquivo e figurinha chegam como data URI, gravados pelo adaptador no
momento em que a mensagem entra. A tela pede cada um **por demanda** (`acao: "anexo"`),
porque carregar tudo junto arrastaria a conversa inteira em base64.

## Levar a conversa embora: texto, não link

**Copiar conversa** é um botão só, com os dois formatos no menu: **Copiar em texto** e
**Copiar em imagem**. A ação é uma (levar a conversa embora) e o formato é detalhe dela;
dois botões lado a lado obrigavam a ler os dois para escolher.

Em texto, a conversa sai no formato que o WhatsApp usa ao exportar:

```
[28/08/2026 09:01] (19) 98826-1313: Bom dia, não consegui achar pelo Waze <imagem>
[28/08/2026 09:01] Mia: Como a sua reserva já tinha início agendado para hoje...
```

O markdown sai (o destino é leitura, não renderização) e a quebra de linha fica: uma
lista de contatos que a Mia manda em três linhas viraria um parágrafo emendado, e quem
colar num modelo leria pior do que o cliente leu no WhatsApp. Anexo vira `<imagem>`,
`<áudio>`, `<arquivo: nome>`: o arquivo não viaja no texto, e omitir esconderia que
existiu um áudio ali.

**Copiar imagem** faz o mesmo em PNG, com as bolhas da tela: cliente à esquerda em
cinza, quem atende à direita em roxo, nome e horário. Serve para quem vai ler, e também
para um modelo que lê imagem.

A **foto entra na imagem**, não só a palavra "imagem": antes de montar o layout, cada
anexo do tipo imagem ou figurinha é baixado (`acao: "anexo"`, o mesmo caminho da tela) e
decodificado, porque o layout precisa do tamanho antes de empilhar. Ela é encolhida para
caber (260x300 no máximo, sem distorcer e sem ampliar figurinha pequena) e desenhada no
topo da bolha, com o texto por baixo, como no WhatsApp. Foto que falha ao carregar volta
a ser `<imagem>` no texto: some a foto, não a informação de que havia uma.

O desenho é `canvas` puro, sem `html2canvas` nem parente: são cinco formas (bolha, texto,
nome, hora, marca de anexo), e uma dependência que reimplementa meio CSS erraria em fonte
e emoji por um resultado igual. O layout mora separado do desenho, em
`conversaEmImagem.ts`: a conta de quebrar linha e empilhar bolha é pura e tem teste, e só
o desenho toca no canvas. Três coisas que a medição corrigiu: a hora é desenhada **fora**
da bolha, então usa cinza nos dois lados (um tom claro combinando com o roxo sumia no
branco); o vão entre bolhas guarda essa hora, e com 12px ela encostava na bolha seguinte
quando duas falas vinham do mesmo lado; e palavra maior que a linha (a URL do voucher)
não é partida, porque quebrada ela deixa de ser clicável.

Conversa muito longa não vira imagem: acima de 20000px o canvas falha e a imagem já seria
ilegível. Nesse caso a tela avisa e manda copiar em texto, que não tem teto. Truncar em
silêncio seria pior, porque a pessoa compartilharia meia conversa achando que
compartilhou toda.

> **Isto substituiu o link público de leitura** (29/08/2026), que gerava um token de 64
> hex e abria `/conversa/<token>` numa Edge `verify_jwt = false`. Saíram junto a rota,
> a página, a Edge (apagada do projeto, não só do repo), as entradas do worker e os
> verbos `compartilhar`/`descompartilhar`/`publica` do beast-bots. Texto puro serve o
> mesmo propósito e não deixa uma URL viva com a conversa de um cliente atrás dela.

## Onde está cada coisa

| Camada | Arquivo |
|---|---|
| Tela | `src/routes/manager/conversas.tsx`, `src/features/inbox/` |
| Página pública | `src/routes/conversa-publica.tsx` |
| Portão | `supabase/functions/mia-inbox/`, `supabase/functions/conversa-publica/` |
| Rota e SQL | beast-bots: `platform/channels/inbox-route.ts`, `inbox-sql.ts` |
| Pausa do agente | beast-bots: `platform/channels/handler-canal.ts`, `assumida.ts` |

## Riscos que já morderam

1. **Rota customizada do Mastra nasce pública.** `/inbox` precisa estar nominalmente em
   `protected` no `platform/server/auth.ts`. Há teste de contrato para isso.
2. **Quem tem o id da thread, lê.** A memória não separa por agente, então todo id que
   chega do cliente passa por `memoriaPertenceAoTenant`.
3. **Página sem lista derruba a tela.** `pages.flatMap((p) => p.conversas)` vira
   `[undefined]` quando o backend responde sem a lista, e isso derrubou a sidebar inteira
   do Manager. O `?? []` é por página, não só no fim.
4. **A lista se reordena sozinha.** A paginação é por cursor e cada mensagem que chega
   joga a conversa para o topo. Quando o polling recarrega as páginas abertas, uma
   conversa da página 2 pode ter subido para a 1 e aparecer nas duas. `juntarPaginas`
   deduplica por id na hora de montar a lista.
5. **Conversa assumida e esquecida** fica sem resposta para sempre, por decisão. A tela
   mitiga com o filtro "Assumidas".
