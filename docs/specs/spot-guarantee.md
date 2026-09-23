# Garantia de vaga (PRD-14) — Spec

> **Status: ✅ Implementado (MVP)** — front-end/cópia, sem backend. ClickUp `86aj0zp4q`.
> **Ao mudar a regra/cópia, atualize esta spec no mesmo PR.**

## O que é

Promessa de **plataforma**: **"Vaga garantida — ou realocamos e cobrimos a diferença"**. É a maior
alavanca de confiança → conversão do produto. A promessa é honesta porque a **disponibilidade é
controlada em tempo real** (ver [capacity-rules.md](./capacity-rules.md)): a Movepark não vende mais
vagas do que cabem.

## Regra operacional

Se na chegada faltar vaga, o cliente aciona a garantia e a Movepark resolve por um de dois caminhos:
1. **Realocação** em um parceiro próximo, **cobrindo a diferença** de preço; ou
2. **Reembolso integral (100%) + crédito** pelo transtorno.

Acionamento: pelo **WhatsApp da unidade** (ou suporte central Movepark) com o **código da reserva**.

## Implementação (front-end, sem migration)

Feature `src/features/guarantee/`:
- `copy.ts` — `GUARANTEE_PROMISE`, `GUARANTEE_POLICY` (parágrafos), `MOVEPARK_SUPPORT`
  (`{ whatsapp, email }` — WhatsApp central a preencher quando o negócio definir; hoje vazio → cai no
  e-mail `contato@movepark.co`), `guaranteeClaimMessage({ code, unitName })`.
- `whatsapp.ts` — `toWhatsappDigits` (normaliza; número local BR ganha `55`), `whatsappHref`, e
  `guaranteeChannel({ unitPhone, code, unitName })` → escolhe **unidade** (wa.me do `location.phone`) ou
  **suporte** (WhatsApp central ou `mailto`). Puro/testável.
- `GuaranteeBadge.tsx` (pill "✅ Vaga garantida"), `GuaranteeSection.tsx` (bloco "Sobre a garantia").

Onde aparece:
- **Listing** ([listing.tsx](../../src/routes/listing.tsx)): seção "Sobre a garantia" + selo no
  [ReservationCard](../../src/features/listing/ReservationCard.tsx), **gateado pela disponibilidade** —
  o selo some quando `check_availability` indica `sold_out` ("não prometer o que não tem").
- **Checkout** ([SummaryCard](../../src/features/checkout/SummaryCard.tsx)): selo de reforço no resumo.
- **Reserva** ([bookings-detail.tsx](../../src/routes/bookings-detail.tsx)): no bloco "Precisa de
  ajuda?", CTA **"Acionar garantia"** (`guaranteeChannel`) para reservas `confirmed`/`checked_in`.

## Testes
Vitest `whatsapp.test.ts` (normalização/seleção de canal + claim message) e `components.test.tsx`
(badge + seção). Sem pgTAP/edge.

## Como ficou em 23/09/2026

- **O acionamento é registrado.** O botão "Acionar garantia" na reserva do cliente chama
  `claim_spot_guarantee(code)` (confirmada ou em uso, de 2h antes do check-in em diante, um
  acionamento aberto por reserva) e só então abre o WhatsApp da **Movepark** (`@/lib/suporte`),
  não mais o do estacionamento que falhou. A reserva mostra "Acionada em ..., a Movepark está
  cuidando".
- **A Movepark fecha.** Manager › Reservas ganha o card "Garantia de vaga acionada" (só com
  acionamento aberto), com o desfecho (realocado, devolvido, sem procedência), o valor coberto e
  a nota. Tabela `guarantee_claim`, RPC `admin_resolve_guarantee_claim`.
- **O que "cobrimos a diferença" significa na prática:** processo manual da Movepark com registro.
  Realocação e pagamento da diferença acontecem por fora (PIX ao cliente, ou pagamento direto ao
  parceiro vizinho), e o valor entra no acionamento para a conta fechar.
- Os componentes `GuaranteeBadge`/`GuaranteeSection` citados abaixo não existem mais; a promessa
  vive em `ListingTrustBar`, na coluna "Garantia Movepark" da ficha e na reserva do cliente.

## Fora de escopo (fases futuras)
- Acionamento **automático** (realocação/reembolso programáticos) — depende de suporte/gateway.
- Garantia **opt-in por unidade** (flag/política por parceiro) — viraria migration.
- Selo no **card de busca** (PRD-13 traz badges comparativos).
- Reembolso real depende do **gateway** (hoje mockado). Conecta com PRD-15 (passe de chegada).
