# Logo do estacionamento na jornada, no e-mail e no voucher

**Origem:** reunião interna de 23/11/2026 (trechos 00:30:32 a 00:36:31). Card no ClickUp:
[Hub: logo do estacionamento na jornada de compra, no e-mail e no voucher](https://app.clickup.com/t/17tn9ea435c).
Migration: `20261206090000_logo_do_estacionamento.sql`.

## Por que existe

O cliente da Pare Seguro via só a marca Movepark e confundia com o Movepark Estacionamento, que
também fica em Guarulhos. O e-mail de confirmação mostrava no rodapé o logo e o endereço da
Movepark e não mostrava o endereço de onde a pessoa ia estacionar.

A decisão da reunião: o hub continua centralizado (a marca da compra é a Movepark) e o logo de quem
opera a vaga entra de forma discreta, como "Operado por [logo]".

**Regra de marca (Diego, 23/11/2026).** Em e-mail, voucher e qualquer comunicação que envolva um
estacionamento parceiro, **o logo do parceiro vai no topo e o da Movepark vai sempre no rodapé**.
Em fundo escuro, o logo do parceiro sai **todo branco**. Nas telas da compra (checkout e
confirmação) o parceiro continua discreto, como "Operado por". No mesmo dia o Diego pediu o
e-mail com a Movepark menor e minimalista, sem o endereço da Movepark no rodapé, com o logo
colorido do estacionamento no corpo e o bloco de foto da fachada e mapa que o template do legado
tinha.

## Modelo

| Coluna | Fundo | Onde aparece |
|---|---|---|
| `company.logo_url` | claro | checkout, confirmação, reserva, e-mail de confirmação, PDF do voucher, voucher impresso |
| `company.logo_dark_url` | escuro | topo navy do voucher na conta (opcional: sem ele, o colorido) |
| `location.logo_url` | claro | troca o da empresa só nesta unidade |
| `location.logo_dark_url` | escuro | troca o da empresa só nesta unidade |

- **Unidade antes da empresa, fundo por fundo.** Unidade com logo nulo segue a empresa. Serve para
  unidade que opera com outra marca (o pedido citou Garageinn Viracopos e Garageinn Serve, Nation
  Park e Park).
- **Em fundo escuro, todo branco.** A tela pinta de branco o arquivo que tiver (CSS
  `brightness(0) invert(1)`, `LOGO_WHITE_FILTER`), então o escuro cai no colorido quando não há
  versão própria. O contrário não vale: logo branco some no fundo claro, e o lugar fica sem logo.
  Por isso o upload pede PNG transparente: JPG de fundo sólido viraria um retângulo branco.
- **Só PNG ou JPG em https**, por constraint (`*_logo_*_formato`). O Gmail não mostra SVG e o
  pdf-lib do voucher só embute PNG e JPG. O upload do Manager recusa outro formato e limita a 2 MB.
- **Leitura pública.** `company` tem privilégio por coluna (20261129090500): `logo_dark_url` foi
  concedida a `anon` e `authenticated`, igual a `logo_url`. `location` tem SELECT de tabela.
- **Escrita.** Empresa: formulário "Editar empresa" do Manager (PostgREST, RLS `company_admin_write`).
  Unidade: diálogo "Configuração da unidade" do Manager (UPDATE em `location`, RLS por escopo).
  O arquivo vai para `assets-public/<company_id>/` pela Edge `upload-asset`.

A regra de resolução existe em dois runtimes: `src/lib/parkingLogo.ts` (front) e
`resolveParkingLogo` em `supabase/functions/_shared/voucher/fields.ts` (Edges). Mudou um, mude o
outro.

## Onde o logo entra

| Lugar | Arquivo | Como |
|---|---|---|
| Ficha da unidade (`/estacionamentos/<destino>/<lote>`) | `routes/listing.tsx` | logo colorido logo acima do H1, 36px no celular e 40px no computador. Pré-renderizado no build (`fetchListing` lê os logos); trocar o logo no Manager republica a página pelos gatilhos `company_site_rebuild` e `location_site_rebuild` |
| Card da busca e da página de destino | `search/ParkingCard.tsx` (prop `logo`), `ResultCard.tsx` | logo colorido (28px, até 140px de largura) acima do título. A Edge `search` devolve `operator.logo` (unidade antes da empresa) |
| Checkout, desktop | `SummaryCard.tsx` | "Operado por [logo]" sob o nome e o "Ver endereço" do cartão de resumo |
| Checkout, mobile | `routes/checkout.tsx` | mesma linha, centralizada acima do passo a passo (no mobile o resumo fica fechado na gaveta) |
| Confirmação (passo 5) | `Step5Confirmation.tsx` | sob a instrução do QR |
| Reserva / voucher de tela | `bookings/Voucher.tsx` | logo todo branco no topo navy; colorido no cabeçalho impresso; "Reserva feita pela [Movepark]" no rodapé |
| E-mails de reserva | `_shared/email.ts` (`shell` com `partner`) | logo colorido no topo de todo e-mail de reserva (confirmação, lembretes, troca de datas e de veículo, novo código de acesso, extensão, cancelamento, pedido de avaliação); sem logo, o nome em texto. A Movepark desce para o rodapé |
| PDF do voucher | `_shared/voucher/pdf.ts` | logo colorido no cabeçalho (34pt de altura, até 200pt de largura; sem logo, o nome em texto) e "Reserva feita pela Movepark" no pé da folha. Logo que não baixa em 4 s não segura o voucher. A Edge só baixa do Storage público do próprio projeto (host de `SUPABASE_URL`): a coluna aceita qualquer https, e sem essa trava quem escreve na unidade apontaria o fetch do servidor para outro host |

Sem logo cadastrado, nada disso aparece e as telas ficam como eram.

## O e-mail (casco e confirmação)

**Casco (`shell()`), vale para todos os e-mails.** Minimalista: topo branco, título em navy, corpo
e um rodapé curto (Central de Ajuda, Privacidade e Termos; aviso de mensagem automática; razão
social). E-mail de reserva recebe `partner` (`partnerFrom`, a partir de `company_name` e
`parking_logo`, que os remetentes leem com `LOCATION_BRAND_SELECT` e `locationBrand`): o topo é do
estacionamento e o wordmark da Movepark (14px) abre o rodapé. E-mail sem parceiro (lead, KYC,
equipe, resumo do parceiro) abre com o wordmark de 16px da Movepark. Saíram a faixa violeta com o símbolo
branco, a régua de cores, a banda "Ficou com alguma dúvida?" com redes sociais e o **endereço da
Movepark**, que o cliente confundia com o do estacionamento.

**Bloco do estacionamento (`parkingBlock`), na confirmação**, logo depois da saudação:

1. nome do estacionamento e da unidade (o logo já está no topo do e-mail);
2. duas colunas, foto da fachada e miniatura do mapa, que abre o Google Maps. No celular empilham;
3. endereço por extenso com "Como chegar".

O resumo embaixo fica só com a reserva (código, vaga, datas, veículo, total), porque
estacionamento, unidade e endereço já estão no bloco.

**Foto da fachada.** As fotos do site são AVIF/WebP, que o Outlook e parte dos clientes de e-mail
não mostram, e a borda da Cloudflare não converte imagem (`/cdn-cgi/image` dá 404). O e-mail usa
um JPG de 560px em `/Estacionamentos/<marca>/email/<arquivo>.jpg`, gerado por
`scripts/fotos-email.sh` a partir da primeira foto da unidade (`location.photos[0]`) e commitado
junto. Antes de enviar, `withEmailMedia` (em `_shared/booking-confirmation.ts`) confere o arquivo
com um HEAD: se não existir, o e-mail sai sem foto, nunca com imagem quebrada. Em 23/11/2026 existem
as de Pare Seguro, Abbapark e Nationpark, as três unidades que vendem pelo Hub. **Unidade nova no
checkout do Hub: rode o script para a primeira foto dela.**

**Mapa.** Google Static Maps (`staticMapUrl`, zoom 15, 280x210 em escala 2, pino na cor da
marca), ligado pelo segredo **`GOOGLE_STATIC_MAPS_KEY`** das Edges. A API não está ativada na
chave do site (403 em 23/11/2026). Sem o segredo, a coluna do mapa vira um cartão com o endereço e
"Abrir no Google Maps", e o endereço não se repete embaixo. A chave vai visível no HTML do e-mail,
então tem que ser **dedicada e restrita à Static Maps API**, nunca a chave do site nem a
`GOOGLE_PLACES_SERVER_KEY`.

## Fora do escopo

- Vitrine da home (`FeaturedParkingLots`): usa o mesmo `ParkingCard`, mas lê de outra fonte e
  ainda não passa `logo`.
- Lembretes, troca de datas e cancelamento: já saem com o parceiro no topo e a Movepark no rodapé,
  mas sem o bloco de foto e mapa. Ligar é chamar `parkingBlock` com os mesmos dados.
- E-mails para o próprio parceiro (resumo diário, saque, KYC) seguem com a Movepark no topo: quem
  lê é o parceiro, e a confusão de marca era do cliente final.
- Unidades com checkout externo (`checkout_mode = external`) não passam pelo checkout nem pelos
  e-mails do Hub.

## Pendências

- **Logos cadastrados em 23/11/2026 para os nove parceiros ativos**, em `assets-public/<company_id>/`
  como `logo-<marca>.png` (colorido) e `logo-escuro-<marca>.png` (branco), PNG transparente de
  ~200px de altura:
  - Pare Seguro: do site dela (`pareseguro-website/assets/logo/pare-seguro-cor.svg` e
    `pare-seguro-negativo.svg`).
  - Abbapark, Aeropark, Aerovalet, Garageinn, Nationpark, Plenty Park e Virapark: dos SVGs de
    `public/images/parceiros/`. Abbapark e Aerovalet vinham com fundo branco sólido, tirado na
    conversão.
  - BePark: `logo-bepark.png` do repositório do site dela (`bepark-website/src/assets/img`).
  - A versão escura é **vazada**: o que é branco ou prateado no original vira transparente e o resto
    vira branco. Uma silhueta branca simples apagava o "G" da Garageinn e o texto da faixa da Plenty
    Park; a Plenty pediu um corte mais baixo porque o texto dela é prateado, não branco.
  - Converter: SVG em PNG transparente pelo Chrome headless (`--default-background-color=00000000`),
    recorte do vazio e, para o escuro, alfa = alfa × clamp((235 − min(R,G,B)) / 45).
- O PDF do voucher passou a quebrar valor longo em linhas (`wrapText`): o endereço completo da
  Pare Seguro passava da margem direita e saía cortado.
- Mapa do e-mail: ativar a Static Maps API no Google Cloud, criar a chave restrita a ela e gravar
  `GOOGLE_STATIC_MAPS_KEY` nos segredos das Edges. Até lá, o cartão de endereço.
