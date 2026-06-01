# Movepark Hub — Backlog Macro (Épicos)

> Documento de planejamento estratégico. Cada épico é uma "atividade macra" pensada
> para ser destrinchada em specs (`docs/specs/`) e implementada via Claude Code.
> Não é spec técnica — é o mapa de para onde vamos e em que ordem.

## Decisões estratégicas (travadas)

| Decisão | Escolha | Implicação |
|---|---|---|
| Modelo fiscal/recebimento | **Intermediação + split de pagamento** | Movepark tributa só a comissão; estacionamento emite a NF do serviço; gateway divide na origem. GMV nunca entra como receita da Movepark. |
| Comissionamento (pricing) | **Take-rate sobre preço online abaixo do balcão** (modelo Booking) | Cliente paga abaixo do balcão; comissão (%) retida no split; estacionamento recebe `online − comissão`. Ver [comissionamento-e-monetizacao.md](./specs/comissionamento-e-monetizacao.md). |
| Nota fiscal | **Nota única ao cliente** (seller) + NFS-e de comissão B2B (Movepark→parceiro) | Sem bitributação; cada parte tributa a sua fatia. |
| Monetização | **Faseada:** comissão-only agora → tier Pro opcional → receita de demanda | Cold start sem mensalidade; integração é isca de lock-in, nunca cobrada. |
| Transição | **Híbrido / faseado** | White label segue rodando; tráfego e parceiros migram aos poucos para o hub. Protege receita atual. |
| Descoberta de unidades | **Lista + filtros (já existentes)** | Mapa fica para v2. Foco em busca de alta intenção por aeroporto. |
| Onboarding de parceiro | **Pré-moderado** | Parceiro cadastra; Movepark aprova antes de publicar. Protege a marca. |

## Tese central

Sair de **vitrine/afiliado** (Movepark impulsiona o negócio do parceiro, é copiável)
para **hub transacional** (reserva, base de clientes, checkout e marca moram na Movepark).
O fosso é a posse da demanda. O maior risco não é técnico nem fiscal — é **liquidez**
(inventário raso). Mitigação: dominar buscas de aeroporto, onde a intenção é alta e a
concorrência local é baixa. Não precisamos de milhares de ofertas; precisamos vencer
"estacionamento GRU / Viracopos / Congonhas".

## Estado atual (baseline)

**Pronto:** schema Supabase (`company → location → parking_type`), motor de preço dinâmico,
máquina de estados da reserva, checkout 4 passos, voucher + QR, painéis manager/operator,
auth + RLS, busca com lista e filtros.

**Faltando (o coração do marketplace):** split de pagamento, emissão fiscal,
extranet de auto-cadastro do parceiro, pagamento real (hoje é `mock-payment`),
atribuição de mídia para o domínio Movepark.

---

## FASE 0 — Fundação Financeiro-Fiscal (desbloqueia tudo)

> Sem isto, não há hub: é o que separa "vitrine" de "marketplace transacional".

### E0.1 — Gateway de pagamento com split
Integrar gateway (Asaas / Iugu / Pagar.me) com split na origem. Criar subcontas
(recebedores) por estacionamento. Suportar **`take_rate` configurável por parceiro/unidade**
(% sobre o preço online, retido no split). Substituir `mock-payment` por PIX + cartão reais
(empurrar PIX no checkout para proteger margem), com webhooks confirmando `booking.status`.
**Depende de:** escolha do gateway (workstream externo). **Destrava:** E0.2, todas as vendas reais.
**Ver:** [comissionamento-e-monetizacao.md](../specs/comissionamento-e-monetizacao.md).

### E0.2 — Camada fiscal (nota única ao cliente + NFS-e de comissão B2B)
Modelo take-rate → **nota única ao cliente**: o estacionamento emite a NFS-e do serviço ao
cliente final (valor cheio); a Movepark emite NFS-e da **comissão para o parceiro (B2B)**.
Mecanismo para garantir/registrar que o parceiro emitiu a nota (exigência da LC 214/2025:
o marketplace responde pelo IBS/CBS se o seller não emitir). Emissão via gateway nativo
(Asaas/Iugu) ou emissor à parte (NFE.io/Focus).
**Depende de:** enquadramento tributário (workstream externo).

### E0.3 — Máquina de estados financeira da reserva
Estender o booking-flow com `payment` real: `expires_at` (PIX 30min), reembolso/`refunded`,
reconciliação do split, antifraude básico. Job de expiração (`pending → no_show`).
**Depende de:** E0.1.

---

## FASE 1 — Extranet do Parceiro (resolve o gargalo de config manual)

> Hoje a configuração do white label é manual. A extranet transforma isso em self-service
> pré-moderado e é o que faz o parceiro "querer estar dentro" do ecossistema.

### E1.1 — Área do parceiro (auth, multi-unidade, papéis)
Login do parceiro, suporte a 1 empresa com N unidades, papéis (dono/operacional).
Reaproveitar RLS existente.

### E1.2 — Auto-cadastro de unidade com fluxo pré-moderado
Parceiro cadastra unidade (endereço, horário de funcionamento, tipos de vaga, fotos,
capacidade) → estado `rascunho → em análise → publicado`. Painel de aprovação interno Movepark.

### E1.3 — Dados de recebimento (KYC do recebedor)
Cadastro de CNPJ + dados bancários do parceiro, conectado às subcontas do split (E0.1).
Onboarding do recebedor no gateway.

### E1.4 — Gestão de preço e disponibilidade pelo parceiro
Expor o motor de preço existente na extranet. Parceiro ajusta tabela e capacidade por data.
(Conecta com a skill `propor-preco-movepark` / Tábua de Marés.)

### E1.5 — Painel de reservas, extrato e repasses
Parceiro vê reservas, status de check-in, extrato de repasses do split e NFs.

---

## FASE 2 — Demanda e Conversão no Hub (migração de tráfego)

> Migrar a venda do white label para o domínio Movepark, sem quebrar a receita (híbrido).

### E2.1 — Home, busca e resultados como venda direta
Adaptar busca/lista/filtros existentes para checkout direto na Movepark (não redirecionar
para white label). Manter SEO/autoridade do domínio.

### E2.2 — Checkout transacional consolidado
Unificar checkout 4 passos + split + voucher num fluxo de venda direta. Snapshot de preço,
cupom, serviços adicionais.

### E2.3 — Conta do cliente
Minhas reservas, veículos, perfil, histórico — a base de clientes que vira o fosso.

### E2.4 — Atribuição e migração de mídia paga
Redirecionar Google/Meta Ads para o domínio Movepark. Tracking UTM (campos já no schema),
atribuição, e flag de origem (hub vs white label) para medir a transição.

---

## FASE 3 — Diferenciação e Crescimento (v2)

### E3.0 — Monetização Pro + receita de demanda
Tier "Pro" opcional para o parceiro (mensalidade que desbloqueia comissão menor, destaque,
analytics, co-op de mídia, dashboard multi-unidade) — lançado **só depois de provar GMV**.
Receita de demanda: taxa de conveniência, upsell de serviços, seguro, assinatura do consumidor
("Movepark Prime"). **Princípio:** comissão-only no cold start; integração nunca é cobrada.
**Ver:** [comissionamento-e-monetizacao.md](../specs/comissionamento-e-monetizacao.md).

### E3.1 — Motor de fidelidade / cashback (diária grátis)
Regras de recompensa (ex.: diária grátis após N reservas) financiadas pelo budget de mídia
poupado. **Pré-requisito:** unit economics validados. Subsídio precisa de modelo claro.

### E3.2 — GEO/SEO + blog programático para aeroportos
Conteúdo por aeroporto otimizado para citação por IA (TLDR-first, autor/autoridade, recência
trimestral, crawlers de IA liberados). Automação via N8N. Curadoria — evitar conteúdo IA puro.

### E3.3 — Chatbot / WhatsApp do hub (MCP Movepark)
Reescrever o atendimento sobre o hub, usando o MCP Movepark já conectado.

### E3.4 — Mapa e expansão de inventário
Visão de mapa quando a densidade justificar; ampliar além dos aeroportos.

---

## FASE 4 — Plataforma transversal (AI-first)

### E4.1 — Camada de IA / MCP, observabilidade e LGPD
Consolidar MCP da Movepark, logs/observabilidade, antifraude, conformidade LGPD,
e a metodologia AI-first (N8N) como infraestrutura contínua.

---

## Workstreams externos (não-dev — bloqueiam, mas não são código)

| Item | Por que bloqueia | Quando |
|---|---|---|
| **Tributarista** — enquadramento (CNAE intermediação 74.90-1-04, Simples vs. Lucro Presumido) | Define a estrutura da empresa antes do E0.2 | Antes da Fase 0 |
| **Escolha do gateway de split** (Pagar.me / Asaas / Mercado Pago) | Define a integração do E0.1 | Antes da Fase 0 |
| **Contrato de parceria** (comissão, responsabilidades fiscais, SLA) | Base jurídica do split e da moderação | Paralelo à Fase 1 |
| **Capital de giro** | Com split, o imposto sai na origem (some o float) | Planejar antes do go-live |

## Contexto regulatório (a favor)

A Reforma Tributária torna o **split payment obrigatório** (2026 = teste a 1%; vale pra valer
em 2027). O modelo que vamos construir já é o padrão do futuro — estamos adiantados, não
remando contra a maré.

## Sequenciamento recomendado

```
Fase 0 (fundação fiscal/split)  ──┐
                                  ├─→ Fase 1 (extranet parceiro)  ──→ Fase 2 (demanda/migração)  ──→ Fase 3 (v2)  ──→ Fase 4 (transversal, contínua)
Workstreams externos ────────────┘
```

Fase 0 e os workstreams externos correm primeiro e em paralelo. Fase 1 destrava a oferta;
Fase 2 destrava a demanda. Fase 3 e 4 são crescimento e plataforma.
