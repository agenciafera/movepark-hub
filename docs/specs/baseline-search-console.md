# Baseline do Search Console

**Status:** implementado · primeira coleta congelada em 24/08/2026, em [`dados/gsc-baseline-2026-08-24/`](./dados/gsc-baseline-2026-08-24/RESUMO.md)
**Atividade:** Conteúdo 03 do plano de conteúdo dos aeroportos ([86ak6h4xj](https://app.clickup.com/t/86ak6h4xj))
**Código:** [`scripts/gsc-baseline.mjs`](../../scripts/gsc-baseline.mjs) · lógica pura em [`scripts/gsc-baseline.logic.mjs`](../../scripts/gsc-baseline.logic.mjs) · teste em [`src/lib/gscBaseline.test.ts`](../../src/lib/gscBaseline.test.ts)

## Por que existe

A Fase 1 do plano de conteúdo vai reescrever o acervo de posts dos quatro aeroportos da onda 1.
Sem congelar o desempenho de busca **antes** de publicar, daqui a 90 dias ninguém consegue dizer
se o plano funcionou: o Search Console mantém só 16 meses de histórico, e a janela que hoje
cobre o período pré-plano vai ter escorregado.

Este coletor congela esse marco zero em arquivo versionado. Ele também calibra o volume: a
coleta de autocomplete (atividade de cauda longa) mede a amplitude dos termos, e o Search
Console mede a demanda que já chega ao site hoje.

## Propriedade

`sc-domain:movepark.co`, que é propriedade de domínio e por isso já cobre todo subdomínio.
Não é preciso criar propriedade nova para o `hub.` nem para preview. Trocar a propriedade por
`GSC_PROPERTY` ou por `--property`.

## Credencial

Service account com acesso de leitura, e não OAuth de pessoa. O motivo é que a leitura repete:
a atividade Conteúdo 21 refaz a mesma medição depois da consolidação, e um token amarrado à
conta de alguém morre quando essa pessoa sai ou revoga o acesso.

Setup, uma vez:

1. No Google Cloud Console, crie a service account e habilite a **Google Search Console API** no
   projeto.
2. Baixe a chave em JSON e guarde **fora do repositório** (ex.: `~/.config/movepark/`). O
   `.gitignore` barra `*service-account*.json` como segunda barreira.
3. No Search Console, em Configurações › Usuários e permissões, adicione o `client_email` da
   service account como usuário **Restrito** (leitura basta).
4. No `.env.local`, aponte `GSC_SERVICE_ACCOUNT_JSON` para o caminho do JSON.

O script troca a chave por um access token pelo fluxo JWT bearer usando o `crypto` do Node, sem
SDK do Google, para o repositório não ganhar uma dependência inteira por causa de um script.

## Como rodar

```bash
bun run seo:gsc-baseline
```

O `--env-file-if-exists` no script do `package.json` não é decoração. O bun carrega o
`.env.local` para o processo dele, mas **não repassa** essas variáveis para o `node` que ele
lança, então sem a flag o coletor morre em "Falta a credencial" mesmo com a credencial
configurada certa. A variante `-if-exists` é de propósito: quem não tem `.env.local` cai na
mensagem de erro do próprio script, que explica o que fazer, em vez de num crash do node.

Aceita `--inicio`, `--fim` e `--property` para recortes fora do padrão. Sem argumento, a janela
é de 16 meses terminando três dias atrás: o Search Console leva alguns dias para fechar o dado,
e o script pede `dataState: "final"` de propósito, porque baseline que muda depois de gravado
não é baseline.

## O que sai

Uma pasta por coleta, nomeada pela data final da janela:
`docs/specs/dados/gsc-baseline-<AAAA-MM-DD>/`.

| Arquivo | Conteúdo |
| --- | --- |
| `consultas.csv` | Dimensão `query`: clique, impressão, CTR e posição de cada termo |
| `paginas.csv` | Dimensão `page`, com a coluna do aeroporto já resolvida a partir da URL |
| `consulta-por-pagina.csv` | Cruzamento `query + page`: qual URL responde hoje por qual termo |
| `dias.csv` | Dimensão `date`: a curva diária, para achar quebra e sazonalidade |
| `recorte-clusters.csv` | As 12 células do cruzamento 4 aeroportos x 3 clusters de cabeça |
| `recorte-consultas.csv` | Toda consulta classificada, com os clusters em que ela bateu |
| `RESUMO.md` | Leitura pronta: tabela por aeroporto, top 15 termos e top 30 páginas |
| `meta.json` | Propriedade, janela, contagem de linhas e quando foi gerado |

A pasta é versionada. Rodar de novo no mesmo dia reescreve a mesma pasta; rodar em outro dia
cria pasta nova, e nenhuma coleta anterior é tocada.

## Os recortes

**Aeroportos da onda 1:** GRU, VCP, CNF e CWB. O casamento é por termo com fronteira de palavra,
não por `includes` cru, porque `gru` dentro de `grupo` contaminava a contagem. A URL casa
primeiro pelo slug do destino e, se não bater, pelos mesmos termos da consulta, porque o slug
dos posts herdados do WordPress não segue o slug do destino.

**Clusters de cabeça,** os mesmos três do mapa de canonicalização (Conteúdo 02):

| Cluster | Intenção |
| --- | --- |
| `proximidade` | perto, próximo, distância, ao lado |
| `barato` | barato, economia, desconto, cupom, promoção |
| `preco` | preço, valor, diária, tarifa, quanto custa |

Uma consulta que bate em mais de um cluster soma em **um só**, o de maior prioridade na ordem
acima, para nenhum clique ser contado duas vezes no total. A prioridade coloca `barato` na
frente de `preco` porque é a intenção mais específica das duas: quem busca "estacionamento
barato em GRU" já escolheu o critério, quem busca "preço" ainda está pesquisando. O
`recorte-consultas.csv` guarda todos os clusters casados, então a sobreposição fica auditável.

As 12 células saem sempre, inclusive as vazias. Célula ausente some do relatório e some da
comparação de 90 dias, que é justamente o que este arquivo existe para permitir.

**Posição média** é ponderada por impressão (`soma(posição x impressões) / soma(impressões)`).
Média simples daria o mesmo peso a um termo de 3 impressões e a um de 30 mil. Célula sem
impressão nenhuma sai vazia, não como zero: posição zero não existe e seria lida como primeiro
lugar.

## Como comparar depois

Rode o coletor de novo, com a mesma janela relativa, e compare `recorte-clusters.csv` célula a
célula com a coleta anterior. O que importa na leitura de 90 dias é impressão e posição por
célula, não o total do site: o total mistura marca, blog antigo e páginas fora do plano.
