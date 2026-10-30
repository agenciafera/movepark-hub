# Integrações (Cloudpark primeiro)

> **Status:** **plano aprovado em 30/10/2026, nada implementado.** Fase 0 feita no mesmo dia: as 7
> reservas do Hub que ainda iam entrar na Nationpark e na Abbapark foram criadas na Cloudpark à mão
> (§ 6, Fase 0).
> **Pergunta:** dá para tirar a integração com a Cloudpark do n8n, trazer para dentro do Hub, e
> deixar cada estacionamento ligar ou não a integração com as próprias credenciais, numa tela
> "Integrações" com catálogo?
> **Base:** leitura do workflow no banco do n8n, das execuções e dos pedidos do legado em produção,
> do Swagger oficial da Cloudpark (v5.22.2) e do Hub (código e banco vivo).
> **Relacionadas:** `wps-integration.md` (contrato genérico de pátio), `shared-availability.md`,
> `reservas-wl-no-hub.md`, `voucher-qrcode.md`, `booking-modifications.md`, `rastro-do-gateway.md`,
> ADR-004 (camada de abstração), ADR-005 (escopos), ADR-007 (catálogo no código).

## 1. Resposta curta

1. **Dá, e o Hub já tem quase todas as peças.** Fila de envio com nova tentativa (`wps_delivery`,
   `wl_delivery`), cofre de segredo (Vault), escopos por papel e gerador único de voucher. Falta o
   conceito de "conexão" por unidade, o adaptador da Cloudpark e a tela.
2. **Hoje a reserva feita no Hub não chega na Cloudpark.** Nationpark e Abbapark vendem pelo Hub
   desde 01/10/2026, mas só o site (legado) aciona o n8n. Foram 43 reservas do Hub sem cadastro na
   cancela até 30/10.
3. **A API da Cloudpark só cria reserva.** Não tem cancelar nem alterar. Cancelamento e troca de
   data ou placa viram tarefa para o parceiro bloquear à mão, até a Cloudpark oferecer outro
   caminho (§ 7, G1).
4. **Para desligar o n8n de vez, o Hub também atende as vendas do site.** O Kallef autorizou, em
   30/10/2026, trocar uma URL na configuração dos dois tenants do white-label. É a única mudança no
   legado, e não é código.

## 2. O que existe hoje (medido em 30/10/2026)

### 2.1 O workflow do n8n

Workflow `LxpJ6Uh4oKvDCvR5` "Cloudpark - Nationpark (production)", ativo, última edição em
21/08/2025. Atende **Nationpark e Abbapark**, que têm o mesmo dono e a mesma instância da Cloudpark
(`1269.cloudpark.com.br`). Existe também o `TyRQSt1olKFq7WOm` (homologação, `1032.cloudpark.com.br`).

```
legado (pedido pago)
  └─ POST n8n.movepark.co/webhook/cloudpark-qrcode-integration   (n8n_webhook_url do tenant)
       1. tira o campo `event`
       2. entrada - 1h, saída + 1h (America/Sao_Paulo), guarda as originais
       3. POST https://1269.cloudpark.com.br/api/v1/integration/reserveparking   (Authorization: Token ...)
       4. responde ao legado
       5. PATCH {callback_url} com order_id + qrcode   → legado grava external_qrcode,
                                                          gera o voucher e manda o e-mail
       6. POST {api_url}/backend/order/extra-data      → grava cloudpark_response no pedido
```

O corpo enviado é o pedido inteiro do legado (`Webhook::send`). Os campos que importam para a
Cloudpark: `initial_date`, `final_date`, `license_plate` (sem separador, maiúscula), `email`,
`name`, `last_name`, `total_price_value`. Vão também `whitelabel` ("Nation Park" ou "Abba Park"),
`category` ("Aeroporto Afonso Pena"), `product` ("Vaga Coberta", "Vaga Descoberta" ou "Vaga MAX"),
documento, telefone e veículo. A Cloudpark devolve `{"message": "<código>"}`, com 29 caracteres, que
vira o conteúdo cru do QR do voucher (`Voucher.php` gera o QR a partir de `external_qrcode`).

### 2.2 O que funciona e o que não

| Ponto | Medida |
|---|---|
| Vendas do site com QR da Cloudpark | 100% em outubro (307 Nationpark, 365 Abbapark) |
| Execuções do n8n | 164 em 7 dias, nenhuma falha; 4,5 s no típico, 7,6 s no p95 (Cloudpark + voucher + e-mail) |
| Reservas do Hub na Cloudpark | **nenhuma**: 43 de 01/10 a 30/10, sem check-in registrado no Hub |
| Falha da Cloudpark | silenciosa: com o n8n configurado o legado não gera voucher sozinho; de 24 a 26/07, 17 pedidos pagos ficaram sem QR e a maioria sem voucher |
| Cancelamento | não chega na Cloudpark: 11 pedidos cancelados desde maio seguem com QR válido lá |
| Segurança | a URL do n8n não confere assinatura (quem souber a URL emite QR válido e escolhe para onde ele volta); o token da Cloudpark está escrito no nó, fora do cofre de credenciais |

### 2.3 Outras integrações que vivem no n8n

Ficam para depois (§ 6, Fase 5), mas o modelo desta spec tem que servir a elas: `WPS Integration -
Virapark Production` (Garageinn), `Xpark Aeropark/Aerovalet - Integração de vendas`, `Integração com
Valentina - Aeropark/Aerovalet` (valet GRU) e `Aerovalet - Central Data Integration`. As quatro são
disparadas por webhook do legado, do mesmo jeito que a Cloudpark.

## 3. A API da Cloudpark

Fonte: Swagger oficial, `https://sandbox.cloudpark.com.br/api/v1/integration/storevalidation`
(arquivo `/static/swagger.yaml`, versão 5.22.2). Foi o link que o Edson mandou em 28/07/2023.

- **Endereço por pátio.** Cada estacionamento tem a sua instância: link de nuvem
  (`https://<número>.cloudpark.com.br`) ou endereço na rede local (`http://192.168.x.x`). Do Hub só
  serve o link de nuvem.
- **Autenticação:** cabeçalho `authorization: Token <token>`, um token por instância, fornecido pelo
  suporte da Cloudpark quando o módulo de integração é habilitado.
- **`POST /api/v1/integration/reserveparking`:** cria a reserva e o cliente no painel da Cloudpark e
  devolve o código do cartão do cliente, que vira o QR de entrada e saída. Aceita `plan_id`
  opcional (o n8n não manda). Resposta 400 traz o motivo em `message`; 401 é token inválido.
- **`GET /api/v1/integration/customerplan`:** lista os planos da instância. Serve para **testar a
  conexão** (valida endereço e token sem criar nada) e para oferecer o plano num seletor.
- **Não existe** rota para cancelar, alterar ou consultar reserva. O `POST /customer` atualiza
  cliente e pode bloquear, mas pede o `id` do cliente, que o `reserveparking` não devolve.
- **"Autorização de Acesso":** a Cloudpark pode consultar uma URL nossa a cada tentativa de entrada,
  com o número do cartão, e liberar ou barrar conforme a resposta. Resolveria cancelamento,
  alteração e não comparecimento, e daria ao Hub o check-in real. Depende de configuração do lado
  da Cloudpark (§ 7, G1).
- **Sandbox:** `https://sandbox.cloudpark.com.br`, token público na própria documentação. O
  `reserveparking` do sandbox devolve sempre o mesmo código de exemplo (testado em 30/10/2026, 0,6 s).

## 4. Decisões (Kallef, 30/10/2026)

| # | Decisão | Consequência |
|---|---|---|
| D1 | Criar já na Cloudpark as 7 reservas do Hub que ainda iam entrar | Feito (§ 6, Fase 0) |
| D2 | Trocar a URL do webhook "Pedido pago com sucesso" nos tenants `nationpark_lgf7qrje` e `abbapark_f84hafds` para uma função do Hub | Exceção autorizada à regra de não mexer no white-label, limitada a esse campo. O n8n da Cloudpark é desligado |
| D3 | Configuram a integração: a equipe Movepark (Manager) e o **Dono** do estacionamento (painel do parceiro) | Escopo novo `integrations:write`, só do Dono, como `api-keys:write` e `payouts:write` |
| D4 | Se a Cloudpark não responder, o voucher espera até 15 minutos | Depois disso sai com o código da reserva e a Movepark e o parceiro recebem alerta |

## 5. Desenho

### 5.1 Conceitos

- **Provedor:** um sistema externo que o Hub sabe integrar (Cloudpark é o primeiro). O catálogo
  mora **no código** (nome, logo, descrição, campos de configuração, capacidades e adaptador), no
  mesmo espírito do ADR-007: versionado e revisado em PR, nunca editável no banco.
- **Conexão:** a instalação de um provedor numa **unidade** (`location`). É por unidade porque a
  Cloudpark tem uma instância por pátio. Empresa com uma unidade só, como Nationpark e Abbapark,
  enxerga isso como "a integração da empresa".
- **Entrega:** cada chamada que o Hub precisa fazer ao provedor (criar reserva, por enquanto),
  numa fila com nova tentativa, idempotente, com rastro de cada tentativa.
- **Código de acesso:** o que o provedor devolve e vai no QR do voucher.

### 5.2 Modelo de dados

Tudo novo, nomes no singular, `created_at/updated_at/deleted_at`, RLS ligada.

| Tabela | Para quê | Colunas principais |
|---|---|---|
| `integration_connection` | Uma instalação por unidade e provedor | `company_id`, `location_id`, `provider` (check com as chaves do catálogo), `enabled`, `config jsonb` (só o que não é segredo: `base_url`, `plan_id`, `plan_name`, `entry_margin_min` = 60, `exit_margin_min` = 60, nomes enviados como `whitelabel`/`category`/`product` por tipo de vaga), `secret_id` (Vault), `secret_hint` (4 últimos caracteres), `send_hub_bookings`, `send_site_bookings`, `last_test_at`, `last_test_ok`. Único `(location_id, provider)` entre as não apagadas |
| `integration_delivery` | Fila de envio | `connection_id`, `source` (`hub` ou `site`), `booking_id` (Hub) ou `wl_order_id` (site), exatamente um dos dois por check; `operation` (`reserve`), `idempotency_key` único, `payload jsonb` (sem token), `status` (`pending`, `delivered`, `failed`), `attempts`, `next_attempt_at`, `lease_until`, `external_code`, `last_error`, `hold_until` (D4) |
| `integration_attempt` | Rastro de cada chamada HTTP | `delivery_id`, `http_status`, `duration_ms`, `request jsonb` (sem token), `response jsonb`, `error` |
| `integration_access_code` | Código vigente por reserva | `booking_id` ou `wl_order_id`, `connection_id`, `code`, `status` (`active`, `superseded`, `block_pending`, `blocked`), `blocked_by`, `blocked_at` |

- O código da reserva **não** vira coluna em `booking`: a allowlist de escrita da reserva fica como
  está, e o histórico (código antigo que precisa ser bloqueado) cabe em `integration_access_code`.
- A venda do site não entra em `booking` (mesma regra de `reservas-wl-no-hub.md`); ela aparece na
  fila e no rastro pelo `wl_order_id`, com a empresa.

### 5.3 Segredo

O token vai para o **Supabase Vault** (`vault.create_secret`), e a conexão guarda só o `secret_id`
e os 4 últimos caracteres para a tela mostrar "Token salvo, final 3f9a". Gravar ou trocar o token é
RPC `SECURITY DEFINER` (`integration_set_secret`) com checagem de escopo. **Nenhuma leitura devolve o
token**: só as Edges, com service role, leem de `vault.decrypted_secrets`. O token atual da
Nationpark e da Abbapark sai do nó do n8n direto para o Vault na carga inicial, sem passar pela tela.

### 5.4 Permissões (ADR-005)

| Escopo | Papéis | Atribuível a chave de API |
|---|---|---|
| `integrations:read` | Dono, Gerente, Operação | não |
| `integrations:write` | **só Dono** (D3) | não |

`hub_admin` tem os dois. Leitura das conexões por RPC que nunca devolve `secret_id`. Escrita
(instalar, configurar, ligar, desligar, trocar token, reenviar) só por RPC com
`member_has_scope(company_id, 'integrations:write')`. A UI espelha com `useAuth().hasScope`, nunca
como única barreira.

### 5.5 Motor

```
supabase/functions/_shared/integrations/
  types.ts           interface AccessProvider { key, testConnection(), reserve(), capabilities }
  registry.ts        getProvider(key)  (mesmo papel do getGateway do ADR-004)
  cloudpark.ts       adaptador: monta o corpo, aplica a folga, normaliza a placa, lê o código
  dispatch.ts        ensureAccessCode(bookingId): acha a conexão, enfileira, tenta na hora
supabase/functions/integration-deliver/   cron a cada minuto: reivindica a fila (concessão de 5 min), tenta, agenda a próxima
supabase/functions/integration-test/      "Testar conexão" da tela (GET customerplan com o token do cofre)
supabase/functions/integration-site-inbound/   recebe o webhook do legado (§ 5.7)
```

- O domínio fala só com `AccessProvider`. Trocar ou somar provedor é adaptador novo, sem mexer em
  reserva, voucher ou tela além do catálogo.
- Nova tentativa: 1, 2, 4, 8 e 16 minutos, depois de hora em hora até 24 horas, e então `failed`.
- Erro 400 da Cloudpark (dado recusado) não é repetido em loop: vai para `failed` com o motivo e
  dispara alerta. Erro 401 marca a conexão com "token inválido" na tela.
- **Rede de segurança:** um trigger em `booking` (status passa a `confirmed`) enfileira a entrega,
  do mesmo jeito que `wps_enqueue_booking_event`. A chamada imediata em `ensureAccessCode` é só
  para o código chegar antes do voucher. Nenhum caminho de confirmação fica de fora.

### 5.6 Reserva feita no Hub

```
pagamento confirmado (pagarme-webhook, mcp, api, reconcile-confirmations, ...)
  └─ ensureAccessCode(booking)
       ├─ sem conexão ativa na unidade → segue como hoje
       └─ com conexão → chama a Cloudpark na hora (até 10 s)
            ├─ ok   → grava o código → gera o voucher com o QR da Cloudpark → e-mail de confirmação
            └─ erro → entrega pendente com hold_until = agora + 15 min, e-mail segura
                 integration-deliver tenta de novo
                   ├─ ok dentro dos 15 min → voucher com QR da Cloudpark → e-mail
                   └─ 15 min sem sucesso   → voucher com o QR do Hub → e-mail
                                             + alerta para a Movepark e o Dono da unidade
                                             (e se o código chegar depois: voucher refeito
                                              e reenviado com "seu QR de acesso foi atualizado")
```

- **Voucher.** Com código vigente, o QR do PDF (`_shared/voucher/pdf.ts`), da tela do voucher
  (`Voucher.tsx`) e da confirmação (`Step5Confirmation.tsx`) passa a ser o código cru da Cloudpark,
  como o legado faz, com o texto "Apresente este QR na cancela". O código da reserva (MP-XXXX)
  continua impresso para conferência manual. Sem código, nada muda.
- A tela de confirmação mostra "Gerando seu QR de acesso" enquanto a entrega está pendente.
- Os lembretes (24 horas antes) já leem o voucher vigente, então levam o QR certo.

### 5.7 Vendas do site (legado)

Substitui o n8n com paridade, mais segurança e rastro:

1. A Edge `integration-site-inbound` (`verify_jwt = false`) recebe o mesmo POST que o n8n recebe.
2. Confere a assinatura `Signature` do `spatie/laravel-webhook-server` (HMAC-SHA256 do corpo). O
   segredo é fixo no código do legado, então isso só barra ruído: **o pedido é relido no legado**
   pela rota `GET /api/v3/backend/orders` que o `wl-bookings-sync` já usa, e só segue se existir, se
   estiver pago e se o tenant tiver conexão ativa com `send_site_bookings`.
3. Responde 202 na hora e processa em segundo plano, deduplicando pelo id do pedido.
4. Cria a reserva na Cloudpark com o mesmo adaptador (mesmo corpo do n8n, mesma folga).
5. Devolve ao legado: `PATCH https://<wl_domain>/api/v3/webhook/orderconfirmation/callback` com
   `order_id` e `qrcode`, montando o endereço a partir de `company.wl_domain` e **nunca** do
   `callback_url` que veio no corpo. O legado gera o voucher e manda o e-mail, como hoje.
6. Grava `cloudpark_response` no `extra_data` do pedido (paridade com o n8n).
7. Se a Cloudpark falhar por 15 minutos (D4), chama o callback **sem** `qrcode`: o legado gera o
   voucher com o QR dele e manda o e-mail, e a Movepark e o Dono recebem alerta. Hoje esse cliente
   ficaria sem voucher.

**Virada (D2):** trocar o campo "Pedido pago com sucesso" (aba Webhooks, configuração do tenant) da
Nationpark e da Abbapark de `https://n8n.movepark.co/webhook/cloudpark-qrcode-integration` para a
URL da Edge. Volta atrás = repor a URL antiga. O workflow do n8n fica **desativado** por 30 dias e
depois é apagado, junto com o de homologação.

### 5.8 Cancelamento e alteração

Sem API de cancelar ou alterar (§ 3), o desenho é honesto sobre o limite:

- **Cancelou** (Hub ou site): o código vira `block_pending`, o Dono e a equipe da unidade recebem
  e-mail "Bloqueie o cartão <código> na Cloudpark" e a tela da integração lista "Cartões para
  bloquear", com o botão "Já bloqueei".
- **Mudou data ou placa:** nova reserva na Cloudpark (novo código), voucher refeito e reenviado, e
  o código antigo entra em "Cartões para bloquear".
- Se a Cloudpark liberar rota de cancelamento ou a "Autorização de Acesso" (§ 7, G1), esses passos
  manuais viram chamada automática, sem mudar o resto.

### 5.9 Telas

Copy final passa pela skill `revisar-texto` na Fase 2. Os textos abaixo são de trabalho.

- **Painel do parceiro, `/operator/integracoes`** (menu "Integrações", ícone `Plug`, escopo
  `integrations:read`):
  - Lista as conexões da empresa: logo do provedor, unidade, situação ("Ligada", "Desligada",
    "Token inválido", "Com falhas"), último envio.
  - **"Nova integração"** abre o catálogo: cartões com logo, nome e uma linha do que faz. Cloudpark:
    "Manda cada reserva para a cancela e põe o QR de entrada no voucher". Provedor sem adaptador
    ainda aparece como "Em breve" (Fase 5).
  - **Detalhe da conexão:** unidade, endereço da API (`https://<número>.cloudpark.com.br`), token
    (campo que só grava; mostra "Token salvo, final 3f9a"), botão **"Testar conexão"** (devolve
    "Conectado. 12 planos encontrados" ou o erro da Cloudpark), plano (seletor opcional), folga de
    entrada e saída, o que enviar (reservas do Hub, vendas do site) e o botão de ligar.
  - **Envios:** os últimos envios com reserva, situação, código, erro e "Tentar de novo".
  - **Cartões para bloquear** (§ 5.8).
  - Sem `integrations:write`, tudo aparece só para leitura.
- **Manager, `/manager/integracoes`:** a mesma lista para todas as empresas, com filtro por empresa
  e situação, e o mesmo detalhe (mesmos componentes, em `src/features/integrations/`).
- **Detalhe da reserva** (Manager e parceiro): bloco "Cloudpark" com código, situação, tentativas e
  "Reenviar", seguindo `rastro-do-gateway.md` (toda chamada ao provedor aparece na reserva).
- **Logo:** `https://cloudpark.com.br/wp-content/uploads/2024/09/Logo-CloudPark.svg`, versionada em
  `public/integrations/cloudpark.svg`.

### 5.10 Saúde e alertas

- RPC `integration_health()`: por conexão, entregas pendentes há mais de 5 minutos, falhas em 24
  horas, último sucesso e token inválido. Cartão no Manager, ao lado da saúde do white-label.
- Alerta por e-mail (inbox de operação em `app_setting` e Dono da unidade) quando uma entrega passa
  dos 15 minutos sem sucesso, quando falha de vez e quando o teste dá token inválido.

## 6. Plano de ação

Cada fase fecha com typecheck, lint, testes verdes, `/security-review` e advisors do Supabase (o
diff toca migration, RLS, `SECURITY DEFINER` e Edge), commit e push na `main`.

**Fase 0 · Reservas por chegar (feita em 30/10/2026).** As 7 reservas do Hub com entrada a partir de
31/10 (Nationpark: MP-A67A17, MP-C48C63, MP-BD9A16; Abbapark: MP-AB7BBA, MP-855347, MP-52FF3D,
MP-573C3E) foram criadas direto no `reserveparking` de produção, com o mesmo corpo e a mesma folga
do n8n. As 7 responderam 200 com código. O cliente não recebeu voucher novo; a lista com placa e
código ficou com o Kallef para repassar ao Edson. Os códigos entram em `integration_access_code` na carga inicial da Fase 1,
para essas reservas não serem criadas de novo.

**Fase 1 · Motor e voucher (sem tela).** Tamanho: grande.
- Migration: as 4 tabelas, RLS, escopos `integrations:read/write` no catálogo e em
  `company_role_scope`, RPCs (`integration_set_secret`, `integration_upsert_connection`,
  `integration_connections`, `integration_delivery_claim`, `integration_health`), trigger de
  enfileiramento, cron do `integration-deliver`.
- `_shared/integrations` (tipos, registro, adaptador Cloudpark, `ensureAccessCode`), Edges
  `integration-deliver` e `integration-test`.
- `ensureAccessCode` antes de `generateAndStoreVoucher` em todos os caminhos de confirmação; e-mail
  de confirmação respeita `hold_until` (D4); QR do voucher com o código da Cloudpark.
- Carga inicial: conexões da Nationpark e da Abbapark (token do n8n para o Vault), com
  `send_hub_bookings` ligado e `send_site_bookings` desligado; importação dos 7 códigos da Fase 0.
- Testes: `deno test` do adaptador (corpo, folga, fuso, placa, 400, 401, tempo esgotado) e do
  despacho (sem conexão, conexão desligada, idempotência, hold); pgTAP de RLS, escopo só do Dono,
  token nunca legível, trigger; Vitest do QR do voucher com e sem código.
- **Pronto quando:** uma reserva de teste do Hub na Nationpark gera código na Cloudpark e o voucher
  sai com o QR dela, e uma falha simulada segura o e-mail e solta com alerta aos 15 minutos.

**Fase 2 · Tela Integrações.** Tamanho: médio.
- `src/features/integrations/` (api.ts com hooks do TanStack Query, catálogo, lista, detalhe,
  envios, cartões para bloquear), rotas `/operator/integracoes` e `/manager/integracoes` com
  `RequireScope`, itens de menu, bloco na reserva, logo em `public/integrations/`.
- Copy pela skill `revisar-texto`; visual pelo `DESIGN.md`.
- Testes: Testing Library + MSW para o formulário (token só grava, testar conexão com sucesso e com
  erro), gating por escopo (Dono edita, Gerente e Operação só leem, Financeiro não vê).
- **Pronto quando:** o Dono da Mercy (usuário de teste) instala a Cloudpark apontando para o
  sandbox, testa a conexão e vê os planos; a Nationpark aparece ligada no Manager com os envios.

**Fase 3 · Vendas do site e desligamento do n8n.** Tamanho: médio.
- Edge `integration-site-inbound` (§ 5.7) com testes de assinatura, releitura do pedido, tenant sem
  conexão, duplicado e falha aos 15 minutos.
- Ensaio no homolog (`TyRQSt1olKFq7WOm` usa `1032.cloudpark.com.br`) antes da virada.
- Virada (D2): `send_site_bookings` ligado e troca da URL nos dois tenants, um de cada vez,
  Abbapark primeiro. Acompanhar os primeiros pedidos de cada um na tela de envios e no legado
  (`external_qrcode` preenchido).
- Desativar os dois workflows do n8n; apagar depois de 30 dias sem volta atrás.
- **Pronto quando:** 48 horas de vendas do site com QR em 100% dos pedidos pagos, todos visíveis
  na tela de envios, e o n8n da Cloudpark desativado.

**Fase 4 · Cancelamento e alteração.** Tamanho: pequeno, mais o gate G1.
- "Cartões para bloquear" (§ 5.8), e-mail ao Dono, nova reserva em troca de data ou placa
  (`booking-modifications.md`, `change-booking-vehicle`), reenvio do voucher.
- Se G1 trouxer rota de cancelamento ou "Autorização de Acesso", vira chamada automática.

**Fase 5 · Demais integrações do n8n.** Uma spec curta por provedor (WPS Garageinn, Xpark,
Valentina, Central Data Aerovalet), cada uma virando adaptador e cartão no catálogo. O contrato
genérico de pátio (`wps-integration.md`) entra no catálogo como "Webhook do pátio", e o
`company.wps_webhook_*` migra para uma conexão.

**ADR-011 (a incorporar ao `CLAUDE.md` na Fase 1):** integração com sistema de terceiro vive no Hub,
atrás de `AccessProvider` e do catálogo no código, configurada por conexão (unidade), com segredo no
Vault, fila com rastro visível na reserva e escopo próprio. Nada novo nasce no n8n.

## 7. Gates e dúvidas abertas

| # | Assunto | Quem destrava | Bloqueia |
|---|---|---|---|
| G1 | Pedir à Cloudpark uma rota de cancelamento e alteração, ou ligar a "Autorização de Acesso" na instância 1269 | Kallef ou Pedro, com o Edson e o Renato, da Cloudpark (contato da reunião de 2023) | Só a automação da Fase 4; a versão manual não espera |
| G2 | Confirmar com o Edson que a portaria passou a ver as 7 reservas da Fase 0 e como as 28 reservas do Hub já encerradas entraram | Kallef | Nada; serve para saber se a Fase 1 precisa de aviso extra à portaria |
| G3 | A Cloudpark lê `whitelabel`, `category` e `product`, que a documentação não cita? | Teste no homolog na Fase 3 | Nada; enviamos igual ao n8n até saber |

## 8. Riscos

- **Cancela depende do Hub no ar.** Não: a reserva fica gravada na Cloudpark, e a cancela não
  consulta o Hub (só passaria a consultar com a "Autorização de Acesso").
- **Duas fontes criando reserva na mesma instância durante a virada.** Mitigado pela virada por
  tenant e pela deduplicação por pedido; o n8n só é desativado depois da troca de URL.
- **Token compartilhado por duas empresas.** Nationpark e Abbapark usam a mesma instância e o mesmo
  token. Cada conexão guarda o seu segredo no Vault; trocar o token exige atualizar as duas, e a
  tela avisa quando a mesma URL aparece em mais de uma conexão.
- **Rota de retorno do legado sem autenticação.** O `PATCH .../orderconfirmation/callback` aceita
  qualquer um. O Hub usa a rota como o n8n usa e não a corrige (regra de não mexer no
  white-label); o risco segue registrado em `reservas-wl-no-hub.md`.

## 9. Fora de escopo

- Rede local da Cloudpark (`http://192.168.x.x`): o Hub só alcança o link de nuvem.
- `storevalidation`, `agreementvalidation`, pré-pago, RPS e ERP da Cloudpark: não têm relação com
  reserva.
- Notificações por WhatsApp e automações de marketing que também vivem no n8n: não são integração
  com parceiro e seguem fora desta spec.
