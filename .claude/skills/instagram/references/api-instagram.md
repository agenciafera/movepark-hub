# API de publicação do Instagram: o que é limite duro

Conferido na documentação da Meta em 03/09/2026. Tudo aqui é limite da
plataforma, não preferência da marca. O que quebra a marca está no `SKILL.md`.

## Conta e permissão

| Item | Valor |
|---|---|
| Tipo de conta | Instagram **profissional** (Business ou Creator) |
| Permissões (Instagram Login) | `instagram_business_basic`, `instagram_business_content_publish` |
| Permissões (Facebook Login) | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` |

A Movepark já tem app Meta com verificação de negócio aprovada, usada pelo
WhatsApp Cloud API (`supabase/functions/_shared/whatsapp.ts`). Adicionar a
permissão de publicação é review incremental, não cadastro novo.

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

Máximo de **10 filhos** pela API. O recorte de todos os slides segue a proporção
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

`user_tags` pede coordenada x/y de 0.0 a 1.0 em imagem. `location_id` **não
funciona** em item de carrossel.

## Limite de taxa

**100 posts publicados por API em janela móvel de 24 horas**, por conta.
Carrossel conta como 1. A operação da Movepark publica 4 por semana, então o
limite nunca é o gargalo.

## O que a API não faz

- Não agenda.
- Não publica em story pela mesma rota de feed.
- Não edita legenda de post já publicado (só pela rota de update, com limites).
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
