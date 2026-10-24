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

## Chamado aberto pela reserva (25/09/2026)

O cliente abre um chamado de dentro da reserva no site (ver
[chamado-de-atendimento.md](./chamado-de-atendimento.md)). A Edge `open-support-ticket` chama o
`/inbox` com a ação `abrir-chamado`: a conversa do telefone nasce (ou é reaproveitada, pelos
dois nomes da `SQL_QUEM_ASSUMIU`) com `inbox_assumida_por = 'chamado'`, `inbox_chamado` (o
código) e `inbox_chamado_em`. A fala do cliente e a confirmação enviada entram na thread. A
lista traz `chamado`, a tela mostra o selo e sobe a conversa para o topo enquanto o cliente
espera. **Devolver** limpa `inbox_chamado` junto com a marca de assumida.

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

> **O tipo vem com parâmetro.** O Mastra grava o tipo como o WhatsApp manda:
> `data:audio/ogg; codecs=opus;base64,...`. A leitura do `/inbox` aceitava só
> `data:<tipo>;base64,` e descartava o anexo em silêncio, então o player nunca apareceu.
> `lerDataUri` (beast-bots, `transcricao.ts`) aceita o parâmetro, e o verbo `anexo`
> devolve o `data:` sem ele, que é o que o `<audio>` do navegador aceita sem discussão.

## Áudio: ouvir e ler (16/10/2026)

Até 16/10 o canal do Mastra só guardava imagem e PDF; o áudio virava o texto
`[Attached file: file (audio/ogg; codecs=opus)]`, sem o arquivo. **75 áudios** chegaram
assim entre 27/08 e 16/10, de 67 conversas, e a Mia respondeu "não consigo ouvir" a
todos. Esses estão perdidos: o arquivo nunca foi salvo. A fala continua na tela pelo
marcador, como "(áudio)", porque o filtro de marcador só age quando o anexo existe.

Desde o commit `3ffcd49` do beast-bots o áudio vai ao modelo e fica gravado na mensagem.
Em cima disso:

- **Transcrição na chegada.** O `handler-canal.ts` transcreve o áudio com o Gemini (o
  modelo padrão da plataforma, sem raciocínio) **em paralelo** com o turno da Mia, para
  não somar tempo dentro do `waitUntil` do Cloudflare, e grava o texto depois que o
  turno termina, porque é dentro dele que a fala vira linha no banco. A fala é achada
  pelo `wamid`.
- **Onde fica:** `content.metadata.inbox_transcricoes`, por posição da parte do áudio
  (`{ "2": "quero vaga coberta" }`), no mesmo lugar do `inbox_enviado_por_nome`.
  **Nunca** como parte de texto: a metadata não vai ao modelo, e uma parte de texto faria
  a Mia receber a mesma fala duas vezes no histórico.
- **Silêncio não vira fala.** Medido com 3 s de silêncio: com a instrução comum o modelo
  devolveu "Ainda bem". A instrução abre pelo caso sem fala, e o resultado gravado é
  `(áudio sem fala)`, que a tela mostra como "Áudio sem fala".
- **Conversa assumida.** O caminho de pausa (`assumida.ts`) gravava só o texto do
  cliente, e o áudio mandado com a conversa assumida sumia, que é justamente a hora em
  que uma pessoa precisa ouvi-lo. Agora ele grava os anexos que o modelo lê (os mesmos
  tipos de `midiaParaOModelo`, porque o histórico volta ao modelo quando a conversa é
  devolvida), já com a transcrição.
- **Reserva no painel.** Se a transcrição da chegada falhar (Gemini fora, turno cortado
  pelo prazo), a tela espera 60 s a partir da fala e então pede pelo verbo
  `transcrever` do `/inbox`, que transcreve, grava na mensagem e devolve. Transcrição
  já gravada volta sem chamar o modelo. O verbo está na lista fechada da Edge
  `mia-inbox` e leva só `messageId` e `parte`.
- **Na tela:** a ficha do áudio traz `transcricao` (texto, ou `null` enquanto não há),
  então o texto aparece logo abaixo do player, sem clique; os bytes do áudio continuam
  por demanda. `undefined` é backend antigo, e a tela não pede nada a ele.
- **Busca e cópia:** a busca procura também no texto transcrito (contra os valores, não
  as chaves, senão "2" casaria com toda conversa com áudio). O "Copiar conversa" leva
  `<audio: "texto falado">`.

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
| Transcrição do áudio | beast-bots: `platform/channels/transcricao.ts`; tela: `Anexo.tsx` + `estadoDaTranscricao` |

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
6. **A lista lia o banco inteiro para mostrar trinta linhas.** A paginação existia, mas o
   corte vinha no fim: o `SQL_LISTAR` fazia `DISTINCT ON` sobre todas as mensagens do
   tenant e convertia cada `content` em JSON para montar a prévia. O `content` carrega os
   anexos em base64, então cada página descompactava 241 MB. Medido em 24/10/2026 (9.214
   threads, 51.758 mensagens): **18,8 s por página**, e a sidebar do Manager repete a
   consulta a cada 15 s para o contador de não lidas. Corrigido no beast-bots (`624e4ba`):
   a página é escolhida só pelo horário da última mensagem, que sai do índice
   `(thread_id, "createdAt" desc)` sem abrir a mensagem, e a prévia e a contagem são lidas
   depois, apenas das trinta. Ficou em 36 a 65 ms. **Regra:** nada que leia `content`
   roda antes do `limit` da página; há teste de contrato no `dominio.test.ts` do beast-bots.
   A busca continua lendo o conteúdo (é o que ela procura) e leva de 2 a 12 s conforme o
   termo; um pré-filtro `ilike` no texto cru foi medido e saiu mais lento.
