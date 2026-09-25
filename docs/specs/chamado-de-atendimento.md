# Chamado de atendimento na reserva

> Decidido em 25/09/2026 com o Kallef. Substitui, por ora, o "suporte prioritário" da Superflex:
> sem demanda fora do horário comercial, um SLA de 15 minutos não se sustenta. O atendimento
> humano passa a ter horário declarado e um caminho único de entrada.

## O que é

Na tela da reserva do cliente (`/bookings/<código>`), a seção **Falar com a Movepark** tem o
botão **Abrir chamado**. O cliente escolhe o motivo (reclamação, dúvida ou outro assunto), conta o
que houve, e:

1. O Hub grava o chamado (`support_ticket`, código `CH-XXXXXX`).
2. O beast-bots abre (ou reaproveita) a conversa do cliente no WhatsApp da Movepark **já marcada
   como chamado**: o agente fica mudo até uma pessoa devolver. A fala do cliente e a confirmação
   entram na conversa, para a caixa de Conversas não mostrar um chamado vazio.
3. O cliente recebe o template `movepark_chamado_aberto` no WhatsApp (nome, reserva, código, e o
   horário: de segunda a sexta, das 9h às 18h).
4. A equipe recebe e-mail em `app_setting.support_inbox` (contato@movepark.co), com motivo,
   mensagem, reserva, telefone, e-mail e os botões para a reserva no Manager e para Conversas.
   O `replyTo` é o cliente.

Sem telefone na conta nem na reserva, o cliente recebe a confirmação por e-mail e a equipe
responde por e-mail. O chamado existe do mesmo jeito.

## Onde a equipe vê

- **Conversas** (`/manager/conversas`): a conversa sobe para o topo com o selo **Chamado
  CH-XXXXXX** enquanto o cliente espera resposta. Responder é o de sempre. **Devolver ao agente**
  tira o selo e libera o robô de novo.
- **Reserva no Manager** (`/manager/bookings/<código>`): card **Chamados do cliente** com motivo,
  mensagem, estado e o botão **Encerrar chamado** (hub_admin). Encerrar não devolve a conversa ao
  agente: quem decide quando o robô volta é quem está atendendo, em Conversas.
- O estacionamento **não** vê chamados: eles são da Movepark.

## A regra das 24 horas da Meta

A equipe só consegue mandar texto livre no WhatsApp se o cliente escreveu nas últimas 24 horas.
O template abre a conversa do lado da Movepark, mas não abre essa janela; ela abre quando o
cliente responde. Se ele não responder, a resposta da equipe em texto livre pode ser recusada pela
Meta. Escolha do Kallef em 25/09/2026, conhecendo esse custo; a alternativa (o cliente mandar a
primeira mensagem por um link `wa.me`) fica registrada como caminho de volta se isso doer.

## Horário de atendimento

`HORARIO_SUPORTE` em `src/lib/suporte.ts` ("de segunda a sexta, das 9h às 18h") é a fonte no
front; o template da Meta e o e-mail de confirmação repetem o mesmo texto. Fora do horário o
chamado fica registrado e entra na fila.

## Suporte prioritário fora do catálogo

`fare.benefits.priority_support` passou a `false` em todas as tarifas (migration
`20261125100000`). A linha some do comparativo e das tooltips. Reserva vendida antes com o
benefício congelado em `booking.fare_benefits` continua com o selo e a prioridade em Conversas:
o que se vendeu se honra. O código da prioridade (`booking_priority_for_phones`,
`priority_support_sla_minutes`) fica, desligado pelo catálogo, para voltar quando houver demanda.

## Banco

`supabase/migrations/20261125100000_chamado_de_atendimento.sql`: tabela `support_ticket`
(RLS: cliente lê os seus, hub_admin tudo; inserção pela Edge), `support_ticket_code()`,
`admin_close_support_ticket(uuid)`, `open_support_ticket_count()`, `app_setting.support_inbox`.
pgTAP `support_ticket.test.sql` (12).

## Código

- Edge `open-support-ticket` (JWT do cliente; `logic.ts` valida e monta a confirmação).
- beast-bots: ação `abrir-chamado` do `/inbox` (`platform/channels/inbox-route.ts`), campo
  `chamado` na lista (`inbox-sql.ts`); `devolver` limpa o chamado.
- Front: `src/features/support/` (diálogo, card do Manager, hooks, lógica), seção na
  `src/routes/bookings-detail.tsx`, selo e ordem em `src/features/inbox/`.
- E-mails: `tplSupportTicketTeam` e `tplSupportTicketCustomer` em `_shared/email.ts`.
- Segredo `WHATSAPP_SUPPORT_TICKET_TEMPLATE = movepark_chamado_aberto` (WABA 449333654922434).
