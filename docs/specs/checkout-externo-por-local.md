# Checkout externo por local (E0.14)

> **Épico:** E0.14 · **Fase:** 0 · **Q vinculados:** Q-017, Q-018
> **Status:** implementado em 04/08/2026 (migration `20260921000000_checkout_mode_external.sql`).
> Dez unidades em modo externo: seis desde 10/08/2026, as três da Aerovalet desde 12/08/2026 e a
> BePark desde 01/09/2026 (ver o fim deste arquivo).
> Hoje **toda** unidade que a vitrine mostra é externa: as dez publicadas são as dez externas.
> Nada virou `external` ou `silent` na base: os defaults preservam o comportamento atual e a
> virada é ato de `hub_admin`, unidade por unidade.

Permite que uma unidade apareça na vitrine do Hub e feche a reserva no white-label do
parceiro, **sem que o parceiro saiba ou precise fazer nada**.

## Por quê

Trazer para o Hub uma reserva que já entra como afiliado rende **+R$ 3,65** por reserva
(de R$ 27,37 para R$ 31,02) e custa renegociação de contrato, dois painéis para o dono,
voucher novo e o risco de pagamento, suporte e cancelamento passando a ser nossos. Mover
uma reserva de entrada direta para o nosso canal rende **+R$ 13,11** e não exige nada disso.
Logo: base instalada aponta para fora, lote novo nasce no Hub.

## O que JÁ existe (reaproveita, não reescreve)

| Camada | Onde |
|---|---|
| Conexão com o WL | `company.wl_domain` (backend), `wl_tenant_key`, `wl_sync_enabled` |
| De/Para de vaga | `location_parking_type.wl_category_slug` + `wl_product_slug` |
| Admin do De/Para | `src/routes/parking-types.tsx`, alimentado por `useWlCatalog` (dropdown) |
| Catálogo do parceiro | `wlGetCatalog()` em `supabase/functions/_shared/wl/client.ts` |
| Sync / reconciliação | `wl-sync`, `wl-reconcile`, `wl-deliver`; `wl_reconcile_log` |

⚠️ `checkout_handoff` **NÃO é isso**: é sessão para reserva feita por agente (`#ht=`).
Nome parecido, propósito diferente. Não reaproveitar.

## Schema novo

```sql
alter table public.location
  add column checkout_mode text not null default 'hub'
    check (checkout_mode in ('hub','external')),
  add column checkout_mode_changed_at timestamptz,
  add column checkout_mode_changed_by uuid references profiles(id);

alter table public.company
  add column hub_relationship text not null default 'onboarded'
    check (hub_relationship in ('silent','onboarded')),
  add column wl_public_domain text;
```

**São dois níveis para duas perguntas diferentes.** Empresa responde "o parceiro sabe que
existe no Hub?"; local responde "onde a reserva fecha?". Hoje toda empresa `silent` tem
todos os locais `external`, mas quando começarmos a negociar a migração vai existir o caso
intermediário: parceiro já onboardado com um local ainda externo. Um campo só obrigaria a
reescrever nessa hora.

**Por que `checkout_mode` em `location` e não em `company`:** o Aerovalet tem três locais em
três aeroportos, e GRU pode ir nativo enquanto os outros seguem externos. **E não em
`location_parking_type`:** a página é por local e o objeto de capacidades é lido uma vez por
página. Modo por tipo de vaga obrigaria a mesma single a prometer e negar cancelamento ao
mesmo tempo, que é exatamente o que o ADR-009 proíbe.

`location.is_listed` é outro eixo e não se mistura: aparecer na vitrine e onde a reserva
fecha são independentes.

## URL de saída: compor, não guardar

```
https://{company.wl_public_domain}/{lpt.wl_category_slug}/{lpt.wl_product_slug}?utm_source=...&utm_medium=organic&utm_campaign=afiliado-movepark
```

Exemplo real: `https://virapark.movepark.co/virapark/vaga-coberta?utm_campaign=afiliado-movepark`

**Composição no servidor, nunca no front.** A marcação de afiliado é o que separa 17% de 9%
de participação; se um link sair sem ela, a receita cai quase pela metade naquela venda e
**nenhum relatório avisa**. Entra como teste automatizado, não como item de checklist.

⚠️ **Dois domínios distintos:** `virapark-app.movepark.co` é o backend (é o que está em
`wl_domain`); `virapark.movepark.co` é o frontend e é quem recebe a tag. **Não derivar** um do
outro removendo o `-app`, que quebra no dia em que um parceiro usar domínio próprio.

**O UTM do botão prevalece sobre o que veio de fora (decidido em 04/08/2026).** Se o cliente
chegou ao Hub com `?utm_source=google&utm_campaign=black-friday`, esses valores **não** entram no
link de saída: a tripla sai sempre fixa. Os dois conjuntos respondem perguntas diferentes em
sistemas diferentes. O UTM de entrada responde "o que trouxe essa pessoa até a Movepark?", é
capturado em `src/lib/utm.ts` (last-touch em `sessionStorage`), vira `booking.utm_*` e alimenta o
`/manager/attribution`. O UTM de saída responde "quem mandou esse visitante pra você?" no Analytics
do parceiro, e a resposta é sempre a mesma: a Movepark, como afiliado.

Repassar seria entregar a marcação comercial para o tráfego controlar: o relatório do parceiro
diria que a visita veio do Google, a comissão daquela venda cairia quase pela metade, e cairia em
silêncio, só nos links de quem chegou por campanha. **Mesclar UTM de entrada na URL de saída é
proibido**, inclusive "só no `utm_content`". O pgTAP compara a URL inteira, então a tentativa
quebra o teste antes de quebrar a receita.

Efeito colateral aceito: não dá para responder "qual campanha da Movepark gerou este clique de
saída?" olhando só a URL. Quando essa pergunta importar, a resposta é o evento da E0.16, que é
nosso e não trafega no link do parceiro.

✅ Verificado em 03/08/2026: o frontend aceita o **mesmo** slug da API
(`/virapark/vaga-coberta` carrega). Não precisa de campo de slug público; `/vaga-avulsa` é
alias antigo.

## Contexto da busca viaja no link (E0.15)

Sem as datas, quem clica recomeça a seleção no site do parceiro, e a desistência acontece bem
no ponto de saída. O white-label aceita as datas na query e **mantém a seleção**:

```
?startDateTime=2026-08-12T16%3A00%3A00.000Z&endDateTime=2026-08-21T16%3A00%3A00.000Z
```

ISO 8601 em **UTC**, com milissegundos, e os dois-pontos percent-encoded.

⚠️ **Converta pelo fuso da unidade, não pelo do navegador.** `location.timezone` existe na
tabela justamente para isso. Um check-in de 13:00 em São Paulo é `16:00:00.000Z`; se a conta
sair pelo relógio de quem navega, o cliente que abre o link de outro fuso chega ao parceiro com
outro horário, e a divergência aparece só no balcão.

**Quem monta o quê.** A URL base, com a marcação de afiliado, continua vindo pronta do servidor
(`external_checkout_url`). O front **só acrescenta** `startDateTime` e `endDateTime` no fim, num
helper único e testado. Acrescentar no fim é seguro porque não toca nos parâmetros que já vieram;
**reescrever ou remontar a query no cliente é proibido**, pelo mesmo motivo do UTM: é assim que a
marcação de afiliado some sem ninguém notar. O teste do helper afirma que os três `utm_*`
sobrevivem intactos depois do append.

## Prazo de validade da exceção

**Data de revisão: 20/01/2027**, quando a negociação com os estacionamentos acontece.

A exceção é nominal e tem prazo por desenho: sem data, ela vira o caminho padrão por inércia e o
checkout do Hub nunca é exercitado em produção, que é o risco levantado quando o modelo foi
proposto. A data serve para **forçar a revisão**, não para desligar a venda sozinha: expirar em
silêncio derrubaria uma unidade viva sem ninguém olhando.

**O prazo mora fora do código (decidido em 09/08/2026).** Não existe `checkout_mode_expires_at`
nem aviso de vencimento no Manager, e não vamos construir. A data vive num lembrete do ClickUp
para 20/01/2027, com a consulta das unidades ainda em `external` e o comando de reversão dentro.

O motivo é proporção. Quando isso foi decidido havia **uma** unidade externa, e coluna, aviso na
tela e teste para vigiar uma linha é mais máquina do que problema, ainda mais porque código que
ninguém exercita apodrece. Se o conjunto de externas crescer a ponto de a revisão manual não dar
conta, aí o aviso na tela passa a valer o esforço, porque deixa de depender da caixa de lembretes
de uma pessoa.

Em 12/08/2026 são **nove** unidades e dezessete vagas. A decisão continua valendo, porque a
revisão de janeiro é uma consulta só e cabe numa sentada, mas o número já não é o mesmo que a
sustentou: o próximo lote que entrar é hora de reabrir a conta, não de reafirmar por hábito.

Esse lote entrou em 01/09/2026 (BePark, dez unidades e dezoito vagas), e a conta foi reaberta:
**segue fora do código**, porque o que mudou foi a contagem e não a natureza do problema. Dez
linhas ainda cabem numa consulta, e a revisão de janeiro continua sendo uma sentada. O que a
BePark muda de verdade é outro parágrafo desta spec: ela é a primeira unidade que **nasceu**
externa em vez de virar, então "lote novo nasce no Hub", lá no topo, deixou de descrever a
prática. Quem revisar em janeiro decide as duas coisas juntas, o prazo e a regra de entrada.

Reverter continua sendo uma linha:

```sql
update location set checkout_mode = 'hub' where id = '<uuid>';
```

## Permissão

Super admin é `user_role = 'hub_admin'`. Parceiro é `company_operator` (com `company_role`
owner/operator/manager/finance) e **nenhum deles pode encostar em `checkout_mode`**.

- **Esconder o campo no React não é permissão.** Sob `locations:write`, um operador muda por
  API sem ver a tela. Precisa de regra de RLS: coluna gravável só por `hub_admin`.
- **Não criar scope novo em `api_scope`.** Aquela tabela é para chave de API de parceiro, e
  nunca se quer que uma chave de parceiro mude onde a reserva acontece. Regra dura, não
  escopo delegável.

## Validação de pré-voo

Não deixa ligar `external` se:
- a empresa não tiver `wl_public_domain`, `wl_domain` e `wl_tenant_key`; ou
- algum `location_parking_type` **ativo** do local estiver sem `wl_product_slug`.

O toggle fica desabilitado **com o motivo na tela** ("3 tipos de vaga sem mapeamento"), não
apenas cinza.

## Guardas de silêncio (empresa `hub_relationship = 'silent'`)

Não por convenção, por regra. Um único e-mail automático derruba a estratégia inteira.

- **Zero comunicação de saída.** Filtro na origem da fila, não no template.
- **Sem fluxo de onboarding.** Não entra em `company_onboarding` nem muda `onboarding_status`.
- **Sem recebedor de repasse.** Guard que impede criar split enquanto `silent`.
  ⚠️ Virapark já tem `payout_recipient` e `company_payout_account`; Garageinn tem conta.
  Hoje `pagarme_split_enabled = false`, mas ao ligar para as nativas isso vira caminho aberto.
- **Sem usuários.** Convite bloqueado; perfis existentes têm que ser internos.

**Teste obrigatório:** falha se uma empresa `silent` aparecer em qualquer fila de e-mail de
parceiro. É o tipo de coisa que quebra em produção uma vez, e de forma irreversível.

## Estado em 03/08/2026

Nenhum parceiro real tem login: todos os perfis ligados às empresas são `@fera.ag` (interno)
ou `@teste.com`. A premissa do silêncio se sustenta hoje.

## Como ficou (04/08/2026)

| Peça | Onde |
|---|---|
| Colunas + CHECK | `location.checkout_mode`, `checkout_mode_changed_at/by`; `company.hub_relationship`, `wl_public_domain` |
| URL de saída | `external_checkout_url(location_parking_type)`, campo computado do PostgREST |
| Pré-voo | `location_external_readiness(uuid)` → `{ready, missing_company, unmapped_count, unmapped_names}`, sobre o miolo `_external_readiness(company_id, location_id)` |
| Regra dura | trigger `location_checkout_mode_guard` (+ `company_hub_relationship_guard`) |
| Guardas de silêncio | triggers em `company_onboarding`, `payout_recipient`, `profile_company` e no `onboarding_status` da própria empresa |
| Silêncio no e-mail | `sendPartnerEmail()` em `supabase/functions/_shared/email.ts` |
| Manager | coluna **Plataforma** e diálogo "Configuração da unidade" em `/manager/companies/:id/locations`, que reúne os campos que só a Movepark define (o modo de checkout e a [Go2Park](./go2park-transfer-ao-vivo.md)); domínio público e "Relação silenciosa" no cadastro da empresa |
| Testes | pgTAP `checkout_mode_external.test.sql` (26), Deno `_shared/partner-email.test.ts` (5), Vitest `LocationPlatformDialog.test.tsx` + `locations/api.test.tsx` + `routes/manager/locations.test.tsx` |

**O pré-voo vale nos dois caminhos, e o INSERT ficou quebrado até 12/08/2026.** A tela do Manager
liga o externo por UPDATE, então era só esse caminho que tinha teste. O gatilho, porém, também
roda em INSERT, e ali perguntava o pré-voo por `new.id`: em `BEFORE INSERT` a linha ainda não
está em `public.location`, o select não achava nada e o erro que subia era
`location_external_readiness: unidade % não encontrada` (P0002). Criar unidade já em `external`
era impossível, e a mensagem mandava procurar dado apagado em vez de olhar o gatilho. Quem
respondia o pré-voo desde sempre era a **empresa**, e essa o INSERT tem em `new.company_id`: o
miolo virou `_external_readiness(company_id, location_id)` e o gatilho passou a chamá-lo por ali.
No INSERT não há vaga para conferir De/Para, então o conjunto sai vazio e o pré-voo aprova, que é
a leitura certa (unidade recém-criada não tem tipo de vaga para mapear). A regra não afrouxou:
empresa sem white-label segue recusada, agora com `23514` no lugar do P0002 enganoso.

**Quem é "backend" para as guardas.** As regras duras deixam passar quem chega **sem JWT**
(service role, migration, seed) e exigem `hub_admin` de quem chega **com** JWT. Não dá para
olhar `current_user` dentro de uma função `SECURITY DEFINER` (lá ele é o dono da função, não
quem chamou), e o anônimo não alcança nenhum desses caminhos: não tem policy de escrita em
`location` nem `EXECUTE` nas RPCs.

**Pré-voo cobre `wl_category_slug` também.** A spec original citava só `wl_product_slug`, mas a
URL precisa das duas partes; faltando qualquer uma, o link sairia quebrado.

**A marcação de afiliado é `?utm_source=movepark&utm_medium=organic&utm_campaign=afiliado-movepark`**
e vive dentro da função SQL, num lugar só. O teste pgTAP compara a URL inteira: se alguém tirar a
marcação, o teste cai antes de a receita cair.

**Slug do De/Para é validado (`wl_slug_safe`).** Quem grava `wl_category_slug`/`wl_product_slug` é
o parceiro, pelo escopo `parking-types:write`, e um slug com `?` ou `#` fecharia a URL antes dos
nossos parâmetros: a venda passaria a contar como entrada direta e nenhum relatório acusaria. Fora
do formato `^[a-z0-9][a-z0-9._-]*$`, o pré-voo reprova e a URL sai nula. Sem link é melhor que link
torto. O host não é atacável por esse caminho: fica antes da primeira barra e vem de
`wl_public_domain`, coluna que só `hub_admin` grava.

**As guardas de silêncio são de entrada, e isso é literal.** Enquanto a empresa é `silent`, não
nasce onboarding, recebedor nem vínculo de usuário. Linha que já existe continua sendo atualizada:
a primeira versão pegava `UPDATE` também e teria quebrado o cron `refresh-recipients`, que
sincroniza o status do recebedor com o gateway a cada volta, justamente na empresa recém
silenciada (o Virapark tem recebedor). Só o `UPDATE` que troca a `company_id` para uma empresa
silenciosa é entrada disfarçada, e esse continua barrado. O que já existe também não é apagado:
desmontar recebedor e perfis é decisão de gente, não de migration.

## Virapark ligado em 04/08/2026

Primeira unidade real em modo externo, virada por `developer@fera.ag` (o carimbo em
`checkout_mode_changed_by` registra isso).

- `wl_public_domain = virapark.movepark.co` (o backend segue em `virapark-app.movepark.co`)
- URL de saída: `https://virapark.movepark.co/virapark/vaga-coberta?utm_source=movepark&utm_medium=organic&utm_campaign=afiliado-movepark`, verificada no navegador: o caminho e os UTM chegam inteiros, sem redirect que coma a marcação
- `hub_relationship = silent`, com as guardas conferidas contra o estado real: recebedor novo, usuário novo, onboarding novo e mudança de `onboarding_status` barrados; a reconciliação do recebedor que já existia continua passando
- Os três perfis ligados à empresa são internos (`@fera.ag`), então a premissa do silêncio se sustenta

⚠️ **A página pública ainda não honra isso.** Nenhuma superfície do consumidor lê `checkout_mode`
hoje: quem faz isso é E0.15. Até lá, o Virapark continua vendendo pelo checkout do Hub e o dado
diz "externo" sem que a tela mude. Não é regressão (antes da E0.14 a coluna nem existia), mas é a
razão de E0.15 ser a próxima da fila. Reverter é um `update` de uma linha.


## Mais cinco unidades em 10/08/2026

Abbapark, Nationpark, Plenty Park, Garageinn e Aeropark. Com o Virapark, seis unidades
externas e doze vagas.

| Empresa | Unidade | Tenant WL | Categoria | Tipos mapeados | Piso |
|---|---|---|---|---|---|
| Abbapark | Aeroporto Afonso Pena | `abbapark` | `aeroporto-afonso-pena` | coberta, descoberta, premium → `vaga-max` | 3 diárias |
| Nationpark | Aeroporto Afonso Pena | `nationpark` | `aeroporto-afonso-pena` | coberta, descoberta, premium → `vaga-max` | 3 diárias |
| Plenty Park | Aeroporto de Congonhas | `plenty` | `aeroporto-congonhas` | coberta | 3 diárias |
| Garageinn | Aeroporto de Viracopos | `garageinn` | `aeroporto-viracopos` | descoberta → `vaga-avulsa` | nenhum |
| Aeropark (ex-Bandeirapark) | Aeroporto de Guarulhos | `aeropark` | `aeroporto-guarulhos` | coberta, descoberta, valet | 2 diárias |
| Virapark | Virapark | `virapark` | `virapark` | coberta | nenhum |

Ao contrário do Virapark, estas cinco ficaram em `hub_relationship = onboarded`: são parceiros
com quem já existe relação, e silenciar não teria propósito.

### O que não é óbvio

**O Aeropark estava no Hub com o nome errado, como "Bandeirapark".** `bandeirapark_h7k9m4n2` é o
nome do SCHEMA legado dele, e entrou no lugar da marca quando a empresa foi semeada. A tabela de
metadados de [`docs/simulacao-precos.md`](../simulacao-precos.md) já registrava `aeropark` como o
slug correto do Hub, e a [`knowledge-base-rag.md`](./knowledge-base-rag.md) já listava a
divergência como dado sujo a corrigir. Empresa e slug renomeados em 10/08/2026.

O erro custou uma unidade duplicada: sem cruzar o domínio `aeropark-app.movepark.co` com o que já
existia, foi criada uma unidade nova sob a company inativa `aeroparking`, que era o mesmo
estacionamento físico. A duplicata foi apagada (nunca teve reserva) e a company `aeroparking`
voltou a não ter configuração de white-label. **Antes de criar unidade para um tenant novo,
procure o `wl_domain` dele no repo e no banco.**

Existe também um tenant `airpark`, que é outro negócio (Lisboa e Faro) com unidades próprias no
Hub. Trocar um pelo outro mandaria o cliente para o país errado.

**O Garageinn vende um spot só, `vaga-avulsa`.** O `external_id` e a descrição dele dizem
`vaga-coberta`, mas a política de reserva do próprio parceiro avisa que a vaga coberta fica
"mediante disponibilidade no local". O De/Para ficou apontando o tipo que já existia no Hub
(Vaga Descoberta), que não promete cobertura. Vale confirmar com o parceiro antes de trocar:
prometer "Coberta" o que ele não garante é exatamente o que a ADR-009 barra.

**Cupom só existe onde a reserva fecha.** Os dois únicos cupons do banco eram `PROMO10`
(Abbapark) e `30OFF` (Virapark). Com as duas empresas em modo externo, nenhum dos dois tem mais
onde ser aplicado. Ficaram como estão, e o roteiro E2E passou a usar o `FERA10`, da Agência Fera.

### A tabela emprestada: o preço de uma unidade nossa mudou sozinho

O valet do **Aerovalet** em Guarulhos não tinha tabela própria. Ele usava `strategy = 'surcharge'`
com `surcharge_source_id` apontando para o valet do **Aeropark** e multiplicador 1.0, artefato do
import legado (mesmo valet de GRU, mesma lista de preço). Quando o Aeropark virou externo, o
espelho reescreveu a tabela dele com a do parceiro, e o Aerovalet foi junto:

| Estadia | Antes | Depois do espelho |
|---|---|---|
| 1 diária | R$ 149,00 | sem preço (o parceiro exige 2) |
| 6 diárias | R$ 594,00 | R$ 475,20 |
| 18 diárias | R$ 792,00 | R$ 1.782,00 |
| 35 diárias | R$ 924,00 | R$ 3.465,00 |

O Aerovalet é unidade `hub`: a reserva fecha no checkout da Movepark, pelo preço que a tela
mostra. Uma unidade que a gente vende foi reprecificada em silêncio pela tabela de outro parceiro,
e teria que honrar o que aparecesse.

Corrigido em duas frentes: o valet do Aerovalet ganhou tabela própria com os mesmos valores
legados, e `wl_mirror_apply_pricing` passou a **recusar** espelhar uma vaga que serve de fonte de
`surcharge` para outra unidade (migration `20260929000000`). Recusar é o certo: quem empresta
tabela precisa de decisão humana antes, não de um job noturno reescrevendo por baixo.

**Antes de virar uma unidade para externo, procure quem empresta a tabela dela**, com
`select ... from pricing_rule where surcharge_source_id is not null`. Hoje sobram dois vínculos,
os dois internos a uma mesma empresa já externa (Abbapark premium e Nationpark premium apontando
para a coberta da própria unidade), e os dois inertes, porque essas regras deixaram de ser
`surcharge` ao serem espelhadas.

## Aerovalet em 12/08/2026: três unidades num white-label só

Congonhas, Tietê e Guarulhos viraram juntas. São **nove unidades externas e dezessete vagas**.

| Empresa | Unidade | Tenant WL | Categoria | Tipos mapeados | Piso |
|---|---|---|---|---|---|
| Aerovalet | Aeroporto de Congonhas | `aerovalet` | `aeroporto-congonhas` | coberta → `vaga-coberta-cgh` | nenhum |
| Aerovalet | Terminal Rodoviário Tietê | `aerovalet` | `terminal-rodoviario-tiete` | coberta → `vaga-coberta-tiete` | nenhum |
| Aerovalet | Aeroporto de Guarulhos | `aerovalet` | `aeroporto-guarulhos` | coberta → `vaga-coberta-gru`, descoberta → `vaga-descoberta-gru`, valet → `valet-gru` | nenhum |

`hub_relationship = onboarded`, como as cinco de 10/08. As três unidades não tinham reserva viva
(21 registros, todos `expired`), então a virada não pegou ninguém no meio do caminho.

### A categoria do white-label é a unidade

É o primeiro parceiro com mais de uma unidade externa, e as três dividem o mesmo white-label:
`aerovalet.movepark.co` na frente, `aerovalet-app.movepark.co` no backend. O que separa uma
unidade da outra lá dentro é a **categoria**.

Isso coube no modelo sem tocar em nada, e não por sorte: o domínio é da empresa
(`company.wl_public_domain`) e o par categoria/produto é da vaga
(`location_parking_type.wl_category_slug`/`wl_product_slug`), então `external_checkout_url` compõe
as três URLs certas com as colunas que já existiam. É o caso que esta spec previu lá em cima, ao
explicar por que `checkout_mode` mora em `location` e não em `company`.

Para quem for mapear o próximo: **não assuma uma categoria por parceiro**. Derivar a categoria do
slug da empresa (`/aerovalet/...`, como é no Virapark) daria 404 em duas das três unidades.

### Piso de estadia: nenhum

As cinco vagas foram cotadas na mão em 1, 2, 3, 4, 5, 6, 7, 10, 14, 15, 20 e 30 diárias antes da
virada, que é a regra que ficou dos cinco parceiros de 10/08. O Aerovalet respondeu preço em
todas. Nem a valet tem piso, apesar de o catálogo declarar 24 horas para ela: mais uma confirmação
de que o `minimum_stay` de `/api/v3/categories` não serve como fonte.

### O que o Hub estava mostrando errado

O espelho passou nas cinco vagas com `mirror_status = ok` e nenhuma divergência. Comparando com a
tabela que o Hub praticava até ontem:

| Unidade / vaga | Estadia | Hub antes | Parceiro | Variação |
|---|---|---|---|---|
| Congonhas coberta | 1 diária | R$ 31,90 | R$ 43,90 | +37,6% |
| Congonhas coberta | 15 diárias | R$ 373,50 | R$ 448,50 | +20,1% |
| Congonhas coberta | 35 diárias | R$ 871,50 | R$ 1.400,00 | +60,6% |
| Tietê coberta | 1 diária | R$ 24,99 | R$ 27,90 | +11,6% |
| GRU coberta | 1 e 14 diárias | igual | igual | 0% |
| GRU coberta | 15 diárias | R$ 298,50 | R$ 328,50 | +10,1% |
| GRU descoberta | 35 diárias | R$ 486,50 | R$ 521,50 | +7,2% |
| GRU valet | qualquer | R$ 149,00 (1d) | R$ 119,20 (1d) | -20% em toda a curva |

O valet é o caso mais claro do princípio "o Hub exibe, nunca decide": o Hub cobrava exatamente a
tabela de **balcão** do parceiro, e o parceiro vende no site dele por 80% dela. A tabela legada
que essa vaga recebeu em 10/08, quando parou de emprestar a do Aeropark, era a lista de balcão o
tempo todo. Ninguém teria descoberto isso sem a amostragem.

### A faixa de 31 diárias em diante, que o espelho extrapola

Duas vagas ficaram com uma faixa aberta que o amostrador **não mede**, porque ele vai até 30
diárias: Congonhas com R$ 40,00 por dia (acima dos R$ 29,90 da faixa de 15 a 30) e o valet com
R$ 21,12 por dia sobre o pacote fechado de R$ 633,60.

Uma diária que sobe depois do trigésimo dia parece erro de extrapolação, e por isso foi conferida
contra o parceiro em 31, 32, 35, 45 e 60 diárias, nas cinco vagas. **Os dezessete casos batem ao
centavo**, inclusive os R$ 2.400,00 de 60 diárias em Congonhas. O parceiro decompõe a estadia em
mês mais dias (`offer.code` vira `d5_m1`) e cobra o mês pela tabela mensal dele, que é mais cara
que a faixa de 15 a 30 dias. A extrapolação do espelho acertou a regra.

Fica registrado como ponto de atenção, não como pendência: o `divergent: 0` do espelho cobre só o
que ele amostra, então **estadia acima de 30 diárias é sempre conferência manual** quando uma
unidade nova entra.

### Os 17 casos golden que saíram do `test:int`

`test/pricing/cases.ts` usa a tabela viva da unidade como entrada, e a Aerovalet era a última
unidade `hub` com `uniform_by_duration` e `fixed_bracket` ali. Os 17 casos saíram pelo mesmo
motivo dos 13 de 10/08: com a tabela espelhada, o valor golden deixa de descrever aquela linha e
vira vermelho quando o parceiro mexe no preço dele. As duas estratégias seguem cobertas em
`supabase/tests/pricing.test.sql`, contra o seed congelado.

## BePark em 01/09/2026: a primeira unidade parceira em Confins

São **dez unidades externas e dezoito vagas**. É a primeira unidade que nasceu direto no modelo
externo, em vez de virar depois: a empresa, a unidade, o De/Para e a virada saíram no mesmo
cadastro.

| Empresa | Unidade | Tenant WL | Categoria | Tipo mapeado | Piso |
|---|---|---|---|---|---|
| BePark | Aeroporto de Confins | `bepark` | `aeroporto-confins` | coberta → `vaga-coberta` | nenhum |

`hub_relationship = onboarded`. `wl_sync_enabled = false`, como nas outras oito: o parceiro está
com o limitador de vagas desligado no white-label (`has_spot_data: false` no `/availability`),
então não há número de ocupação para reconciliar.

### Confins tinha 8 lotes mapeados e nenhum parceiro

Até hoje o destino `aeroporto-de-confins` só existia como vitrine de `prospect_location`
(ADR-010): AeroPark Confins, IPO Park, Auto Park Brasil, Estacionamento Pátio, Space Park, Park
Confins, Central Park e Multipark, nenhum com contrato. A BePark é a primeira ficha que fatura
ali, e por isso é a única do destino com preço, Go2Park e link de saída.

Isso tem consequência de busca, não só de catálogo. O acervo legado do WordPress tinha página
própria para a BePark (`/estacionamentos/aeroporto-confins/be-park-estacionamento-aeroporto-confins/`,
post 1195), e o baseline do Search Console de 24/08 registra **21 cliques e 9.141 impressões**
para a consulta "bepark", na posição média 8,3. Essa URL hoje responde 301 para a página do
destino, onde a BePark não aparecia. O cadastro fecha esse buraco.

### A tabela do parceiro tem lacuna, e o espelho a reproduz sem alisar

O parceiro publica três regras (diária de R$ 45,00, pacote de 5 a 7 dias por R$ 200,00, pacote de
12 a 30 dias por R$ 400,00) e deixa 2 a 4, 8 a 11 e 31 em diante sem regra própria. O que ele
cobra nessas faixas é o último pacote atingido mais R$ 45,00 por dia, e é a única leitura que
mantém a curva monotônica: R$ 45/dia direto faria 11 diárias (R$ 495,00) custar mais que 12
(R$ 400,00).

O amostrador achou isso sozinho, em 41 chamadas, e escreveu:

| from_day | to_day | unit_price | total_price |
|---|---|---|---|
| 1 | 4 | 45,00 | |
| 5 | 7 | | 200,00 |
| 8 | 8 | | 245,00 |
| 9 | 9 | | 290,00 |
| 10 | 10 | 33,50 | |
| 11 | 11 | | 380,00 |
| 12 | 30 | | 400,00 |
| 31 | 31 | | 445,00 |
| 1 | aberta | 45,00 (balcão) | |

O dia 10 é o detalhe que explica o desenho das duas passadas de agrupamento: R$ 335,00 dividido
por 10 dá R$ 33,50 exatos, então ele fecha em centavo e vira faixa de diária; os vizinhos 8, 9 e
11 não fecham e viram preço fechado de um dia. Não é inconsistência, é o agrupamento preferindo
diária sempre que ela reproduz o total ao centavo.

**Conferido nas duas pontas:** as 19 durações de 1 a 31 diárias batem ao centavo contra o
parceiro, preço e balcão, e a segunda passada do espelho voltou `changed: 0, divergent: 0`.

### O que a cauda custa

Acima de 31 diárias o motor devolve `NULL` e a busca descarta, porque a faixa 12 a 30 é preço
fechado e cauda fechada não se abre (a regra está em [espelhamento-preco-wl.md](./espelhamento-preco-wl.md)).
Só que aqui a cauda **é** conhecida e linear: cotei o parceiro em 31, 35, 45 e 60 diárias e os
quatro casos são R$ 400,00 mais R$ 45,00 por dia (R$ 445,00, R$ 625,00, R$ 1.075,00 e
R$ 1.750,00). Ou seja, a BePark vende estadia longa e o Hub deixa de mostrar.

Fica registrado como perda conhecida e pequena (estadia acima de um mês em estacionamento de
aeroporto é rara), não como pendência: abrir a cauda mexe no amostrador, que serve dezoito vagas,
e isso é escopo próprio.

### A divergência que apareceu antes de publicar, e não era de preço

A primeira passada do espelho voltou `divergent: 1` com o Hub devolvendo `null` em todas as cinco
durações verificadas. Não era erro de tabela: a unidade ainda estava com `is_listed = false`, e
`simulate_price` filtra `is_listed` desde a correção de 18/08 que fechou o vazamento das RPCs
definer. Com a unidade fora da vitrine, o motor do Hub não tem o que responder, e a verificação
diferencial lê isso como divergência.

**Quem for cadastrar a próxima: espelhe depois de publicar, ou espere a divergência.** Para
conferir a tabela antes de publicar, chame `_apply_pricing` direto sobre as faixas gravadas, que
é o mesmo motor sem o filtro de visibilidade. Foi assim que as 19 durações foram validadas com a
unidade ainda invisível.
