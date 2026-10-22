# API de publicação do Instagram: o que é limite duro

**Esta é a fonte canônica dos limites da plataforma.** Nenhum número daqui é
repetido no `SKILL.md`, justamente para não existirem duas versões que
divergem quando a Meta mudar um deles. Conferido na documentação em
03/09/2026 e revisto em 21/10/2026. O que quebra a marca, e não a publicação, está no `SKILL.md`,
Passo 2.

## Conta e permissão

| Item | Valor |
|---|---|
| Tipo de conta | Instagram **profissional** (Business ou Creator) |
| Permissões (Instagram Login) | `instagram_business_basic`, `instagram_business_content_publish` |
| Permissões (Facebook Login) | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` |

**App Review não é exigido** para app que só publica na conta da própria empresa: o
acesso padrão basta (doc oficial de App Review, conferida em 21/10/2026). Só vira
necessário se um parceiro for publicar na conta dele pela plataforma.

O que está configurado desde 21/10/2026: app **MoveparkInst** (portfólio Clientes
Agência Fera), usuário do sistema **movepark-instagram** com acesso à Página Movepark
(`315106352508707`) e conta `17841465371053612` em `INSTAGRAM_USER_ID`. O token fica em
`INSTAGRAM_ACCESS_TOKEN`; o diagnóstico é a action `diagnose` da Edge `publish-instagram`.

## O fluxo é sempre de dois passos

```
POST /{ig-user-id}/media          -> devolve creation_id (o "container")
POST /{ig-user-id}/media_publish  -> publica o creation_id
```

**O container expira em 24 horas.** Consultado depois disso, devolve status
`EXPIRED`. É por isso que o agendamento não pode criar o container antes da hora:
o job cria e publica na mesma execução.

**Não existe publicação futura nativa na API.** Quem agenda é a aplicação. A
Meta só pede que a aplicação respeite o limite de taxa por conta.

### Carrossel

1. Um container por item, cada um com `is_carousel_item=true`.
2. Um container pai com `media_type=CAROUSEL` e `children` (array de IDs).
3. Publica o pai.

A API aceita até **20 filhos** desde 2026; a skill fixa 10. O recorte de todos os slides segue a proporção
do **primeiro** slide, então o slide 1 define o enquadramento do carrossel inteiro.

## Imagem

| Item | Limite |
|---|---|
| Formato | **JPEG e só JPEG.** PNG, WebP e GIF são recusados. MPO e JPS também |
| Tamanho do arquivo | 8 MB |
| Largura mínima | 320 px |
| Largura máxima | **1440 px** |
| Proporção | de **4:5** a **1.91:1** |
| Espaço de cor | sRGB (outros são convertidos) |
| Hospedagem | `image_url` público, alcançável por requisição do servidor da Meta |

O padrão da casa é **1080 x 1350** (4:5), que é o retrato mais alto aceito e o
que ocupa mais tela no feed.

> O blog gera `.webp` com 1600px de largura. **As duas coisas são inválidas
> aqui.** Converter é parte do corte, não detalhe de acabamento.

## Legenda e campos de texto

| Campo | Limite |
|---|---|
| `caption` | 2.200 caracteres |
| Hashtags na legenda | 30 (contando as que forem para o comentário) |
| Menções `@` | 20 |
| `alt_text` | 1.000 caracteres |
| Visível antes do "mais" | ~125 caracteres |

`alt_text` vale para **imagem única e item de carrossel**. Reel e story não
aceitam o campo.

**Story:** JPEG até 8 MB, e a Meta recomenda 9:16 "para não cortar nem sobrar faixa vazia". A
casa usa 1080 x 1920, gerado pelo `render-story.mjs` a partir do slide. Story some em 24 horas
e cada um conta no limite de 100 publicações por dia.

`user_tags` pede coordenada x/y de 0.0 a 1.0 em imagem. `location_id` **não
funciona** em item de carrossel.

## Limite de taxa

**100 posts publicados por API em janela móvel de 24 horas**, por conta.
Carrossel conta como 1. A operação da Movepark publica 4 por semana, então o
limite nunca é o gargalo.

## O que a API não faz

- Não agenda.
- Não publica story em carrossel: cada story é um envio próprio (`media_type=STORIES`) e um
  `media_publish`. A fila faz isso desde 22/10/2026, um story por slide 9:16.
- Não aceita sticker em story (link, enquete, local). Menção a usuário sem sticker é aceita.
- Não edita legenda de post já publicado: a rota de update só liga e desliga comentários.
- Apaga post (desde dez/2025, permissão `instagram_manage_contents`), o que a Movepark não usa.
- Aceita `is_ai_generated` para declarar foto de IA. A Movepark decidiu não marcar
  (decisão 8 da spec da fila).
- Não devolve link clicável em legenda, porque o Instagram não tem isso.

## Indexação por buscadores

Desde **10/07/2025**, conteúdo público de conta profissional maior de 18 anos é
indexado por Google e Bing: posts, reels e carrosséis, com **legenda e alt**.
Story fica de fora. Existe um botão de opt-out em Privacidade da conta, na opção
de aparecer em resultados de busca. **Ele precisa continuar ligado**, senão a
metade de SEO deste trabalho é jogada fora.

## Fontes

- [Publish Content, Instagram Platform](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [IG User Media, referência de parâmetros](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/)
