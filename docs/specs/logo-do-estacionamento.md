# Logo do estacionamento na jornada, no e-mail e no voucher

**Origem:** reunião interna de 23/11/2026 (trechos 00:30:32 a 00:36:31). Card no ClickUp:
[Hub: logo do estacionamento na jornada de compra, no e-mail e no voucher](https://app.clickup.com/t/17tn9ea435c).
Migration: `20261206090000_logo_do_estacionamento.sql`.

## Por que existe

O cliente da Pare Seguro via só a marca Movepark e confundia com o Movepark Estacionamento, que
também fica em Guarulhos. O e-mail de confirmação mostrava no rodapé o logo e o endereço da
Movepark e não mostrava o endereço de onde a pessoa ia estacionar.

A decisão da reunião: o hub continua centralizado (a marca da compra é a Movepark) e o logo de quem
opera a vaga entra de forma discreta, como "Operado por [logo]". No mesmo dia o Diego pediu o
e-mail com a Movepark menor e minimalista, sem o endereço da Movepark no rodapé, com o logo
colorido do estacionamento no corpo e o bloco de foto da fachada e mapa que o template do legado
tinha.

## Modelo

| Coluna | Fundo | Onde aparece |
|---|---|---|
| `company.logo_url` | claro | checkout, confirmação, reserva, e-mail de confirmação, PDF do voucher, voucher impresso |
| `company.logo_dark_url` | escuro | topo navy do voucher na conta do cliente |
| `location.logo_url` | claro | troca o da empresa só nesta unidade |
| `location.logo_dark_url` | escuro | troca o da empresa só nesta unidade |

- **Unidade antes da empresa, fundo por fundo.** Unidade com logo nulo segue a empresa. Serve para
  unidade que opera com outra marca (o pedido citou Garageinn Viracopos e Garageinn Serve, Nation
  Park e Park).
- **Um fundo nunca usa o arquivo do outro.** O logo de fundo claro costuma ser escuro e some no
  navy. Sem o arquivo do fundo certo, o lugar fica sem logo, como era antes.
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
| Checkout, desktop | `SummaryCard.tsx` | "Operado por [logo]" sob o nome e o "Ver endereço" do cartão de resumo |
| Checkout, mobile | `routes/checkout.tsx` | mesma linha, centralizada acima do passo a passo (no mobile o resumo fica fechado na gaveta) |
| Confirmação (passo 5) | `Step5Confirmation.tsx` | sob a instrução do QR |
| Reserva / voucher de tela | `bookings/Voucher.tsx` | versão para fundo escuro no topo navy; versão clara no cabeçalho impresso |
| E-mail de confirmação | `_shared/email.ts` (`parkingBlock`) | logo colorido (fundo claro) no topo do bloco do estacionamento, no corpo. Sem logo, o nome em texto |
| PDF do voucher | `_shared/voucher/pdf.ts` | primeira linha do quadro de dados: "Operado por" à esquerda, logo de fundo claro à direita (22pt de altura, até 140pt de largura). Logo que não baixa em 4 s não segura o voucher. A Edge só baixa do Storage público do próprio projeto (host de `SUPABASE_URL`): a coluna aceita qualquer https, e sem essa trava quem escreve na unidade apontaria o fetch do servidor para outro host |

Sem logo cadastrado, nada disso aparece e as telas ficam como eram.

## O e-mail (casco e confirmação)

**Casco (`shell()`), vale para todos os e-mails.** Minimalista: wordmark da Movepark de 16px no
topo sobre branco, título em navy, corpo e um rodapé de três linhas (Central de Ajuda, Privacidade
e Termos; aviso de mensagem automática; razão social). Saíram a faixa violeta com o símbolo
branco, a régua de cores, a banda "Ficou com alguma dúvida?" com redes sociais e o **endereço da
Movepark**, que o cliente confundia com o do estacionamento.

**Bloco do estacionamento (`parkingBlock`), na confirmação**, logo depois da saudação:

1. logo colorido do estacionamento e o nome da unidade (sem logo: nome em texto);
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

- Página da unidade e busca: o card de busca já diz o nome do estacionamento e o pedido foi pela
  jornada de compra. Se a confusão aparecer antes do checkout, a mesma `OperatedBy` serve.
- Lembretes de check-in e check-out, troca de datas e cancelamento: já saem com o casco novo, mas
  sem o bloco do estacionamento. Ligar é chamar `parkingBlock` com os mesmos dados.
- Unidades com checkout externo (`checkout_mode = external`) não passam pelo checkout nem pelos
  e-mails do Hub.

## Pendências

- **Pare Seguro cadastrada em 23/11/2026**, com os logos do site dela
  (`pareseguro-website/assets/logo/pare-seguro-cor.svg` e `pare-seguro-negativo.svg`) convertidos
  para PNG transparente de 160px de altura e gravados em `assets-public/<company_id>/`. As outras
  empresas seguem sem logo. O original de todo parceiro é SVG: converta para PNG antes de subir.
- O PDF do voucher passou a quebrar valor longo em linhas (`wrapText`): o endereço completo da
  Pare Seguro passava da margem direita e saía cortado.
- Mapa do e-mail: ativar a Static Maps API no Google Cloud, criar a chave restrita a ela e gravar
  `GOOGLE_STATIC_MAPS_KEY` nos segredos das Edges. Até lá, o cartão de endereço.
