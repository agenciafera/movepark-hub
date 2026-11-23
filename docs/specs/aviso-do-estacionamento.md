# Aviso do estacionamento por unidade

**Origem:** pedido de 23/11/2026. Migration: `20261206120000_aviso_do_estacionamento.sql`.
Coluna: `location.partner_notice_md`.

> **Estado no banco vivo:** o SQL foi aplicado em 23/11/2026 pelo `execute_sql` do MCP (o
> `db push` está bloqueado pelo histórico remoto, que tem versões aplicadas fora do push), e por
> isso esta migration **não consta no histórico remoto** de migrations. O arquivo é idempotente
> (`add column if not exists`, constraints dentro de `if not exists`) para o `db push` reaplicar
> sem erro quando o histórico for consertado.

## Por que existe

A Pare Seguro (Guarulhos) vai cobrar por mala extra: cliente chega com 6 a 8 malas, a van do
traslado lota e gente fica sem embarcar. A Movepark não cobra nada por isso. O papel do Hub é dar
ciência ao cliente **antes de pagar** e de novo **antes de chegar**, para a cobrança no pátio não
ser surpresa.

Já existia o `location.notice`, mas ele é outra coisa: é o **aviso crítico de entrada** do bloco
"Como chegar" ("use a Rua X, o GPS erra a entrada"), texto puro, ligado por `has_notice` e visto só
na ficha (PRD-11, [customer/listing-detail.md](./customer/listing-detail.md) §5.5). Misturar os
dois faria a regra das malas aparecer como erro de GPS, e o aviso de GPS viajar no e-mail. Por isso
o aviso de política é coluna própria.

## Modelo

| Coluna | Tipo | Regra |
|---|---|---|
| `location.partner_notice_md` | `text`, nulo | Markdown **restrito**. Até 2.000 caracteres (`location_partner_notice_md_tamanho`). Sem HTML cru: `<` seguido de letra, barra ou `!` é recusado (`location_partner_notice_md_sem_html`). Nulo ou só espaço = nenhum aviso. |

**Markdown restrito** é o que um aviso de política precisa e nada mais: parágrafo, lista (`-`, `*`
ou `1.`), negrito (`**x**`), itálico (`_x_` ou `*x*`) e link (`[texto](https://...)`). Título,
imagem, citação e tabela não existem; `#` e `>` no começo da linha saem como texto. **Cada linha não
vazia é um parágrafo** (ou item de lista): o parceiro escreve linha a linha, e o resultado tem que
sair como ele vê na caixa de texto. Só `http(s)` vira link; outro esquema sai como o rótulo, sem
destino.

O parser existe duas vezes, porque são dois runtimes que não se importam: `src/lib/markdownRestrito.ts`
(front) e `supabase/functions/_shared/markdown-restrito.ts` (Edges). Os dois têm o mesmo teste de
amostras; ao mudar um, mude o outro. No front o Markdown vira elemento React
(`@/components/shared/MarkdownRestrito`), nunca `dangerouslySetInnerHTML`. Nas Edges vira HTML com
todo texto e href escapados (`markdownRestritoToHtml`) ou linhas de texto puro para o PDF
(`markdownRestritoToLinhas`).

## Quem edita (ADR-005)

A escrita é a policy `location_operator_update` da própria tabela: `hub_admin`, ou membro com
`locations:write`. No pacote de papéis isso é **Dono e Gerente**; Operação e Financeiro só leem. O
campo fica na seção "Aviso do estacionamento" do formulário da unidade, no Manager
(`/manager/companies/:id`, dialog da unidade) e no Operator (`/operator/locations/:id/editar`), com
dica de formatação, contador e preview ("Como o cliente vai ver"). O operador edita porque a regra
é do parceiro; o Manager existe para a equipe cadastrar em nome dele, como fez com a Pare Seguro.

## Onde renderiza, e só quando preenchido

Vazio = o bloco não existe: sem título órfão, sem espaço sobrando. Todas as superfícies passam pelo
mesmo `temAviso()` antes de desenhar qualquer coisa.

| Superfície | Onde | Como |
|---|---|---|
| Ficha da unidade (`/estacionamentos/<destino>/<lote>`) | seção própria "Aviso do estacionamento", depois de "Como chegar" e antes das avaliações | `MarkdownRestrito` num cartão com ícone. **Fato da unidade**, não promessa de transação: renderiza também na unidade externa (ADR-009) e fica fora dos blocos de garantia e cancelamento. É SSG: o loader (`fetchListing`) traz a coluna e o trigger `location_site_rebuild` republica a ficha no UPDATE |
| Checkout (`/checkout/:code`) | fim do `SummaryCard` (desktop e gaveta do mobile), depois da política de cancelamento | bloco discreto com ícone e o Markdown em `caption-sm`. O cliente lê antes de pagar; é separado da política de cancelamento, que é regra da Movepark |
| E-mail de confirmação | `tplBookingConfirmation`, entre o bloco da unidade e o resumo da reserva | `partnerNoticeBlock`: caixa com borda violeta à esquerda, título "Aviso do estacionamento" e o HTML inline escapado |
| Voucher PDF (anexo do e-mail e bucket) | depois dos campos da reserva, acima do rodapé | título e linhas de texto puro (`•` e `1.`), quebradas na largura da folha. O que não cabe acima do rodapé fecha com "..."; caractere fora do WinAnsi (emoji) sai, porque a Helvetica embutida não o codifica |
| Voucher na conta (`/bookings/:code`) | abaixo dos campos do bilhete | `MarkdownRestrito` em caixa cinza, o mesmo texto do PDF |

O dado chega às Edges pelo `VOUCHER_BOOKING_SELECT` e `mapBookingRowToVoucher`
(`_shared/voucher/fields.ts`, campo `partner_notice_md` do `VoucherBooking`). Como o template é
canônico no código (ADR-007) e empacotado no deploy de cada Edge, mudar o bloco exige redeploy de
toda Edge que importa `_shared/email.ts` ou `_shared/voucher`.

## Copy

Título fixo em toda superfície: **"Aviso do estacionamento"**. O corpo é do parceiro e passa pela
skill `revisar-texto` quando a equipe escreve em nome dele: frase curta, sem travessão, sem número
que ninguém confirmou. O aviso descreve a regra do parceiro e diz que o valor é cobrado por ele; não
promete nada em nome da Movepark.

Primeiro aviso cadastrado (Pare Seguro, Guarulhos, 23/11/2026): cobrança por mala extra pela van
do traslado, paga ao estacionamento na chegada. Limite de malas e valor ficam a cargo da Pare Seguro
e entram no texto quando ela confirmar.

## Testes

| Camada | Arquivo |
|---|---|
| Parser (front) | `src/lib/markdownRestrito.test.ts` |
| Parser, HTML e linhas (Edge) | `supabase/functions/_shared/markdown-restrito.test.ts` |
| E-mail com e sem aviso, HTML cru escapado | `supabase/functions/_shared/email.test.ts` |
| PDF com e sem aviso, quebra de linha, emoji | `supabase/functions/_shared/voucher/pdf.test.ts` |
| Ficha (própria e externa, vazio) | `src/routes/listing.aviso.test.tsx` |
| Checkout | `src/features/checkout/SummaryCard.test.tsx` |
| Voucher da conta | `src/features/bookings/Voucher.test.tsx` |
| Formulário (dois escopos, preview) | `src/features/locations/LocationForm.test.tsx`, `src/routes/operator/location-edit.test.tsx` |
| Banco (coluna, constraints, escopo, trigger) | `supabase/tests/aviso_do_estacionamento.test.sql` |

## Fora desta entrega

- **Base de conhecimento da Mia.** O trigger `location_knowledge_enqueue` indexa `directions_text`,
  `notice` e `reservation_policy`, não esta coluna. A Mia só responde sobre o aviso quando ganhar
  uma fonte `location_partner_notice` em `knowledge-embed` e no trigger.
- **Public API e MCP.** `api_update_location` e `get_location_info` não leem nem escrevem o campo.
  Entrar lá exige o checklist do ADR-003 (OpenAPI, card, escopo, doc).
- **Gêmeo Markdown da ficha** (`scripts/generate-geo-artifacts.mjs`): o `.md` da unidade ainda não
  inclui o aviso.
- **Lembretes** (`booking-reminders`): o lembrete de entrada, 24h antes, não repete o aviso.
