# Eventos de e-mail do Amazon SES (devolução, reclamação, entrega)

Status: implementado em 19/11/2026. Migration `20261205190000_email_event_ses.sql`, Edge `ses-events`.

## Por quê

O `sendEmail` (`supabase/functions/_shared/email.ts`) só sabe se o SES **aceitou** a mensagem. Entre
16 e 19/11/2026 o resumo diário da Pare Seguro sumiu por dias: o SES aceitava, o Gmail e o Outlook
recusavam ou abriam vazio depois, e o `partner_digest_log` seguia marcando "enviado". O diagnóstico
só saiu porque o parceiro reclamou (incidente em [resumo-diario-parceiro.md](./resumo-diario-parceiro.md)).

A causa foi corrigida no envio. Esta peça trata da **visibilidade**: a próxima falha depois do aceite
tem que aparecer no mesmo dia, sem depender de ninguém reclamar.

## Como funciona

```
sendEmail ──SMTP──▶ SES (configuration set movepark-eventos)
                     │ Bounce, Complaint, Delivery, Reject, DeliveryDelay, RenderingFailure
                     ▼
                   SNS (tópico movepark-ses-eventos, sa-east-1)
                     │ HTTPS
                     ▼
                   Edge ses-events ──▶ email_event ──▶ resumo da equipe (Atenção)
                                                   └─▶ /manager/emails
```

1. **Envio.** Com o segredo de Edge `SES_CONFIGURATION_SET` definido, todo e-mail leva o header
   `X-SES-CONFIGURATION-SET` (a nodemailer grafa `X-Ses-Configuration-Set`; nome de header não
   diferencia maiúscula). Sem o segredo, nenhum header: um nome que não existe no SES faria o envio
   falhar. O mesmo configuration set também fica como **padrão da identidade** no SES, para cobrir
   Edge que ainda não foi publicada com o código novo.
2. **SES → SNS.** O configuration set tem um destino SNS com os seis tipos acima. Send, Open e Click
   ficam de fora (volume sem uso).
3. **SNS → Edge.** A inscrição é HTTPS em `/functions/v1/ses-events`. A Edge é `verify_jwt = false`
   (quem chama é o SNS) e a porta é dupla:
   - `TopicArn` tem que ser igual a `app_setting.ses_events_topic_arn`. Vazio recusa tudo. Sem essa
     allowlist, qualquer conta da AWS criaria um tópico, inscreveria a nossa URL e mandaria mensagem
     com assinatura legítima da AWS.
   - `SigningCertURL` tem que ser `https://sns.<região>.amazonaws.com/...pem` e a assinatura confere
     (versão 1 = SHA1, versão 2 = SHA256), pela string canônica da documentação do SNS.
   `SubscriptionConfirmation` é confirmada abrindo o `SubscribeURL`, que também só pode ser do SNS.
4. **Gravação.** Uma linha por destinatário em `email_event`, idempotente por
   `(sns_message_id, recipient)`: a reentrega do SNS não duplica. Erro de banco devolve 500 e o SNS
   tenta de novo. Mensagem fora da allowlist ou com assinatura errada devolve 403.

## Tabela `email_event`

| Coluna | O que é |
|---|---|
| `event_type` | `bounce`, `complaint`, `delivery`, `reject`, `delivery_delay`, `rendering_failure` (check) |
| `recipient` | o endereço, sempre minúsculo (check), sem o nome de exibição |
| `ses_message_id`, `subject`, `sender` | do bloco `mail` do evento |
| `bounce_type`, `bounce_subtype` | devolução: `Permanent`/`Transient`/`Undetermined`; reclamação: o tipo do feedback; atraso: o tipo do atraso |
| `diagnostic` | resposta do servidor de destino (`diagnosticCode`, `smtpResponse`) ou o motivo da recusa |
| `occurred_at` | hora do evento (a do bloco do tipo, senão a do envio) |
| `raw` | o evento inteiro, só no que é problema; na entrega fica nulo |

RLS: só `hub_admin` lê; ninguém escreve fora da `service_role`. Um cron diário (`email-event-purge`,
6h15 UTC) apaga entrega com mais de 90 dias; problema fica.

## Onde aparece

- **Resumo diário da equipe** ([resumo-diario-equipe.md](./resumo-diario-equipe.md)):
  `team_daily_digest` ganha `alertas.emails_problema`, uma linha por destinatário e tipo (devolução,
  reclamação, recusa) no dia do resumo, com quantas vezes e o último assunto. O template escreve
  "E-mail para x devolveu (2 vezes), último assunto ..." no bloco Atenção. Devolução temporária
  (caixa cheia) é dita como tal.
- **Manager, `/manager/emails`** (menu Conta > E-mails): os últimos 300 eventos, busca por
  destinatário, chave "só problemas" e um quadro dos endereços com problema, dizendo se houve
  entrega depois do último problema ("Voltou a receber") ou não.

## Configuração na AWS (conta da Movepark, sa-east-1)

| Recurso | Valor |
|---|---|
| Configuration set | `movepark-eventos`, com destino SNS para os seis tipos |
| Tópico SNS | `movepark-ses-eventos` (SignatureVersion 2) |
| Inscrição | HTTPS `https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/ses-events`, confirmada pela Edge |
| Identidade | configuration set padrão = `movepark-eventos` |
| `app_setting.ses_events_topic_arn` | o ARN do tópico |
| Segredo de Edge `SES_CONFIGURATION_SET` | `movepark-eventos` |

Ordem que funciona: criar o tópico, gravar o ARN em `app_setting`, publicar a Edge, criar a
inscrição (a Edge confirma sozinha), criar o configuration set com o destino, e só então definir o
segredo e o padrão da identidade.

**Teste:** enviar para `bounce@simulator.amazonses.com` (devolução permanente) e
`complaint@simulator.amazonses.com`. Os dois têm que aparecer em `email_event` em segundos e em
`team_daily_digest(<dia de hoje>)->'alertas'->'emails_problema'`.

## Testes

- `supabase/functions/ses-events/logic.test.ts`: string canônica, assinatura (SHA1 e SHA256,
  adulteração de mensagem e tópico, chave errada), allowlist de URL do SNS, conversão de cada tipo de
  evento, deduplicação de destinatário.
- `supabase/functions/_shared/email.test.ts`: header do configuration set só com o segredo, e a
  linha do alerta no resumo.
- `supabase/tests/email_event.test.sql` (pgTAP, 12): RLS, idempotência, minúsculas, tipo fechado e o
  recorte do alerta (dia de Brasília, sem entrega).
- `src/features/email-events/logic.test.ts` e `src/routes/manager/emails.test.tsx`.

## Fora do escopo

- Marcar o `partner_digest_log` como não entregue. Hoje o alerta diz o destinatário e o assunto, o
  que basta para achar o resumo que não chegou.
- Suprimir envio para endereço com devolução permanente. A lista de supressão da conta do SES já faz
  isso; o Hub só passa a enxergar.
