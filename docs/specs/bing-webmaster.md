# Bing Webmaster Tools

> **Status:** ⬜ **pendente**, e depende de gente. Todo o conteúdo aqui é preparação: o registro
> exige login numa conta Microsoft, que nenhum agente tem e nenhum código substitui.
>
> **Atividade:** Conteúdo 05 do plano de conteúdo dos aeroportos
> ([86ak6h55g](https://app.clickup.com/t/86ak6h55g)), Fase 0.
>
> Conecta com [plano-conteudo-aeroportos.md](./plano-conteudo-aeroportos.md) (Fase 0),
> [baseline-search-console.md](./baseline-search-console.md) (o número de comparação) e
> [indexnow.md](./indexnow.md), que ataca o mesmo objetivo sem conta e já está em código.

## Por que existe

A busca do ChatGPT se apoia no índice da Microsoft. Ninguém checou se o `movepark.co` está lá, e
sem essa checagem toda conversa sobre citação em IA é palpite.

## Como o Bing Webmaster Tools funciona

Ele é o equivalente do Search Console no lado da Microsoft: mostra o que o bingbot rastreou, o que
indexou, com que consultas o site aparece e o que ele considera erro. É leitura sobre um site que já
existe, não um cadastro que coloca o site no ar.

Três coisas costumam confundir:

**Registrar não coloca o site no índice.** O bingbot já pode rastrear o `movepark.co` hoje, e o
`robots.txt` não bloqueia ninguém. O painel dá visibilidade e alguns controles, não presença.

**Provar posse é obrigatório, e tem quatro caminhos.** Nenhum deles é "criar conta e digitar o
domínio":

| Caminho | O que exige | Custo aqui |
|---|---|---|
| **Importar do Google Search Console** | Autorizar o BWT a ler a conta do GSC | **Nenhum.** Dispensa a verificação e traz os sitemaps junto |
| Registro DNS | Criar um TXT ou CNAME na zona | Acesso ao DNS, sem tocar no repo |
| Arquivo XML | Servir `BingSiteAuth.xml` na raiz | Commit, push na `main` e ~2 min de build |
| Meta tag | `msvalidate.01` no `<head>` | Mesmo custo do arquivo |

**Aqui o primeiro caminho é o certo.** A propriedade no Google é `sc-domain:movepark.co`,
propriedade de domínio, como está registrado na spec do baseline. O BWT importa isso, verifica a
posse pela autorização e carrega os sitemaps sem que ninguém copie nada. Os outros três continuam
disponíveis se a importação falhar.

Como a propriedade do Google é de domínio, o time já tem acesso ao DNS. Então o caminho 2 é o
fallback natural, e ele também não passa pelo repo.

## O passo a passo

1. Entrar em `bing.com/webmasters` com uma conta Microsoft da Movepark.
2. Escolher **importar do Google Search Console** e autorizar. Selecionar `sc-domain:movepark.co`.
3. Conferir que o sitemap aparece em **Sitemaps**. Se não aparecer, submeter
   `https://movepark.co/sitemap.xml`, que o `robots.txt` já anuncia.
4. Abrir **Site Explorer** ou **Index Explorer** e anotar quantas URLs o Bing tem indexadas.
5. Preencher a tabela abaixo e marcar a linha da Fase 0 com ✅ e a data, no padrão que o mapa de
   canonicalização e o baseline do Search Console já usam.

## A comparação, e a armadilha nela

O critério da atividade é comparar o indexado do Bing com o do Search Console. O número **não** é o
do baseline congelado.

O baseline diz **709 páginas distintas**, e isso é "páginas que receberam impressão em 16 meses".
Uma página pode estar indexada e nunca ter aparecido numa busca, e uma página pode ter tido
impressão e depois cair do índice. O comparável é o relatório **Indexação de páginas** do Search
Console, que informa quantas URLs o Google tem indexadas neste momento.

Comparar 709 com o número do Bing daria uma diferença que não significa nada.

Vale saber também que o lado do Google **já tem problema conhecido**: a spec do blog registra
**94 URLs em "rastreada, mas não indexada"**. Uma diferença grande pode ser esse defeito, e não
ausência no Bing.

## Resultado

Preencher quando o passo a passo rodar. Não estimar nenhum campo.

| Medida | Valor | Coletado em |
|---|---|---|
| Método de verificação usado | | |
| URLs indexadas no Bing | | |
| URLs indexadas no Google (relatório Indexação de páginas) | | |
| Sitemap submetido e lido pelo Bing | | |
| URLs no sitemap no dia da coleta | | |

Diferença entre os dois índices, em pontos percentuais sobre o Google: ____

**Se a diferença passar de 30%**, abrir atividade própria para investigar, que é o que a Conteúdo 05
pede. Antes de abrir, descontar as 94 URLs já conhecidas como não indexadas no Google, senão a
investigação começa perseguindo um número errado.

## O que o código já resolve, e o que ele não resolve

O [IndexNow](./indexnow.md) foi entregue em 29/08/2026 e ataca o mesmo objetivo de fundo, estar no
índice da Microsoft, por um caminho que dispensa conta: o site avisa o buscador quando um post ou
um destino muda.

Ele **não** fecha esta atividade. Submeter URL é diferente de ver o que foi indexado, e nenhum
critério de aceite daqui é atendido por lá. As duas frentes são somáveis: o IndexNow empurra, o
painel mede.
