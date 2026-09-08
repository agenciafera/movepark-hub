# IndexNow: avisar o buscador no mesmo minuto da publicação

**Status:** implementado
**Atividade:** Conteúdo 05 do plano de conteúdo dos aeroportos ([86ak6h55g](https://app.clickup.com/t/86ak6h55g))
**Código:** [`scripts/indexnow-ping.mjs`](../../scripts/indexnow-ping.mjs) · lógica pura em [`scripts/indexnow.logic.mjs`](../../scripts/indexnow.logic.mjs) · teste em [`src/lib/indexnow.test.ts`](../../src/lib/indexnow.test.ts)

## Por que existe

O site é SSG: o que está no ar é o retrato do último build. Sem aviso, o buscador só descobre
conteúdo novo quando resolve rastrear de novo, e no Bing isso levava tanto tempo que, em
08/09/2026, ele tinha **8 URLs descobertas** enquanto o Google registrava **808 páginas com
impressão** nos 16 meses do baseline.

Esse atraso não é só de busca. A busca do ChatGPT se apoia no índice da Microsoft, então
conteúdo que o Bing não conhece é conteúdo que não pode ser citado por IA, que é a meta da
Fase 1 do plano de conteúdo.

## Por que IndexNow, e não a API do Bing

A URL Submission API do Bing Webmaster Tools exige chave de API amarrada à conta. O IndexNow
não: a chave é gerada por nós e publicada no próprio site, e o mesmo aviso chega a Bing,
Yandex, Seznam e Naver por um endpoint só. A Microsoft aponta para ele como o caminho atual.

## A chave não é segredo

A chave vive em duas pontas que precisam bater:

- a constante `CHAVE` em [`scripts/indexnow.logic.mjs`](../../scripts/indexnow.logic.mjs)
- o arquivo [`public/d009bb0231ab7732d03b227e6f5fc435.txt`](../../public/d009bb0231ab7732d03b227e6f5fc435.txt), que contém só a chave

O protocolo **exige** que ela esteja publicada em texto puro na raiz: é assim que o buscador
confirma que quem submeteu manda no domínio. Está versionada pelo mesmo critério da anon key
do Supabase, pública por desenho. Trocar a chave é trocar as duas pontas no mesmo commit.

## O que é submetido

O padrão é o **delta**, não o site inteiro. O protocolo serve para avisar mudança, e reenvio
repetido devolve `429`, que queima a reputação da chave.

O delta sai da comparação entre o sitemap recém-construído em `dist/` e o sitemap **que ainda
está no ar**, que é a fotografia da publicação anterior. Não existe arquivo de estado: o
próprio site publicado é o estado. Isso mantém o script sem memória para versionar, sem sujar
o `git status` e funcionando igual na máquina do dev e no builder da Cloudflare.

Entra na lista:

- URL que não existia na publicação anterior
- URL cujo `lastmod` mudou
- URL que **saiu** do sitemap, porque o recrawl encontra o 404 ou o 301 e tira a antiga do
  índice mais rápido

## Quando dispara

O `bun run build` roda em três lugares e só um deles publica. O ping sai apenas quando
`WORKERS_CI=1` e a branch é a `main`, marcadores que o Workers Builds injeta sozinho, sem
precisar de variável configurada no painel. Build local e o workflow do Lighthouse ficam
quietos.

Falha no ping **não derruba o build**: o buscador descobre pelo sitemap de qualquer jeito, e
derrubar a publicação por causa de um aviso seria trocar um atraso de horas por um site sem
atualização nenhuma. O script sai com código 0 e registra o motivo no log.

## Como rodar na mão

```bash
bun run seo:indexnow -- --simular                    # mostra o delta, não envia
bun run seo:indexnow -- --tudo --do-ar --forcar      # submissão completa do sitemap publicado
```

`--do-ar` troca a fonte do `dist` local pelo site publicado. É o certo para submissão manual:
um `dist` velho na máquina anunciaria URL que não existe mais.

## Respostas do protocolo

| Código | Significado |
| --- | --- |
| `200` | aceito |
| `202` | aceito, chave em validação |
| `400` | formato inválido |
| `403` | chave inválida, ou o arquivo `.txt` não está no ar |
| `422` | URL fora do host declarado |
| `429` | submissão em excesso |

## O 403 da estreia é normal

A primeira submissão depois de publicar uma chave nova volta
`403 SiteVerificationNotCompleted`: o serviço ainda não buscou o `.txt` na raiz. Não é chave
errada nem arquivo no lugar errado, é fila. Em 08/09/2026 levou quatro tentativas espaçadas
de dois minutos, cerca de seis minutos ao todo, até responder `200` para as 463 URLs.

Só vale insistir com espaçamento. Repetir em rajada é o que o protocolo pune com `429`.

## O que isto não resolve

O aviso cobre só o `movepark.co`. Os 7 subdomínios de white-label (`nationpark`, `garageinn`,
`aeropark`, `aerovalet`, `plenty`, `airpark`, `virapark`) rodam na Vercel, fora deste
repositório, sem `robots.txt` e sem sitemap, e hoje ocupam mais espaço no índice do Bing que o
próprio site. Isso é problema à parte, com atividade própria.
