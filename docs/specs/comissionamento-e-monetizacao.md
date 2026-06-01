# Comissionamento, Fiscal e Monetização — Movepark Hub

> Decisão estratégica travada em conversa de planejamento (jun/2026).
> Define COMO a Movepark ganha dinheiro, COMO o preço é formado e COMO a nota é emitida.
> Insumo direto para os épicos E0.1 (gateway/split), E0.2 (fiscal) e o épico de monetização.

## 1. Modelo de comissionamento (pricing)

**Modelo escolhido: take-rate sobre preço online abaixo do balcão.** (Modelo Booking/OTA.)
Não é markup.

- Existe um **preço de balcão** (drive-up, sem reserva) — referência alta.
- A Movepark vende ao **preço online**, deliberadamente **abaixo do balcão** (ex.: −10%).
- A comissão da Movepark é um **take-rate (%)** retido desse preço online, via split na origem.
- O estacionamento recebe `preço_online − comissão`.

### Exemplo (balcão = R$ 10, online = −10%, comissão = 15%)

| | Balcão | Online (hub) |
|---|---|---|
| Cliente paga | R$ 10,00 | **R$ 9,00** |
| Comissão Movepark (15%) | — | R$ 1,35 |
| Estacionamento recebe | R$ 10,00 | R$ 7,65 |

### Por que este modelo (e não markup)
- O cliente paga **menos que o balcão** → maior conversão e justificativa para puxar
  tráfego/mídia ao domínio Movepark (o cliente *ganha* comprando no hub).
- Markup faria o hub ser o canal **mais caro** que o atendimento direto — rejeitado.
- O estacionamento aceita a comissão porque o preço online é uma **decisão de canal**
  (igual hotel ↔ Booking) e o hub traz **volume incremental** sobre vaga que ficaria vazia.

### Regras transversais
- **`take_rate` é configurável por parceiro/unidade** — é a alavanca real de margem.
- O "−X% do balcão" é número de **marketing**; a margem real é o take-rate.
- **Empurrar PIX** no checkout: taxa de gateway ~1% vs. ~3,3–5% no cartão protege a margem
  espremida entre o desconto e a taxa.
- Conecta com a regra do "preço de balcão" e a Tábua de Marés da skill `propor-preco-movepark`.

## 2. Modelo fiscal (intermediação, sem bitributação)

No take-rate, o fluxo de nota é **nota única ao cliente**:

- **Estacionamento** emite NFS-e do serviço de estacionamento ao **cliente final**, pelo
  valor cheio que o cliente pagou (R$ 9,00). É a única nota que o consumidor recebe.
- **Movepark** emite NFS-e da **comissão (R$ 1,35) para o estacionamento** (B2B), não para o cliente.
- O **split** separa R$ 7,65 / R$ 1,35 na origem; o GMV nunca entra como receita da Movepark.
- Resultado: cada parte tributa só a sua fatia. **Sem bitributação.**

> Padrão "marketplace" documentado pela Iugu (subconta emite a nota do serviço;
> conta-mãe emite a nota da comissão). LC 214/2025: o marketplace responde por IBS/CBS
> se o seller não emitir — logo, **garantir/registrar a emissão do seller é requisito de produto**.

⚠️ **Pendente de tributarista:** enquadramento da empresa (CNAE intermediação 74.90-1-04,
Simples vs. Lucro Presumido), e confirmação do desenho acima antes de codar o E0.2.

## 3. Estratégia de monetização (faseada)

Princípio: **conquistar o direito de cobrar provando valor primeiro.** No cold start,
fricção do lado da oferta é o inimigo — não empilhar "mensalidade" sobre o pedido grande
que já se faz ao parceiro (ceder o cliente, honrar a tarifa).

### Fase A — agora (cold start): comissão-only, grátis para o parceiro
- Listar é grátis. Integração (webhooks, API) é grátis — é **isca de lock-in**, não receita.
- **Nunca cobrar por webhook / por reserva / por chamada de API.** Posiciona a Movepark como
  centro de custo e cria relação adversarial. Quanto mais integrado o parceiro, mais preso.
- Barreira de entrada / filtro de parceiro sério **sem cobrar**: paridade (não vender mais
  barato no próprio canal), compromisso de inventário, KYC e contrato.

### Fase B — depois de provar GMV: tier "Pro" opcional (mensalidade)
- Freemium de marketplace. Base grátis (comissão only) vs. **Pro (mensalidade)** que desbloqueia:
  comissão menor, destaque na busca, analytics, co-op de mídia, dashboard multi-unidade.
- Self-selecting: o parceiro escolhe pagar porque o tier **se paga** (ROI positivo).
- Converte comissão (lumpy) em **MRR previsível** e aumenta o stickiness.

### Fase C — receita do lado da demanda (não depende do bolso do parceiro)
- Taxa de conveniência, upsell de serviços (valet, lava-jato), seguro, e
  assinatura do consumidor ("Movepark Prime"). Muitas vezes mais fácil cobrar do cliente
  final que do dono do estacionamento.

> Mesma lógica do motor de fidelidade: dar benefício agora é **investimento em liquidez**,
> não perda. Com liquidez vem poder de preço.

## Impacto no backlog
- **E0.1** — split deve suportar `take_rate` configurável por parceiro/unidade (% sobre o preço online).
- **E0.2** — fiscal = nota única ao cliente (seller) + NFS-e de comissão B2B (Movepark→parceiro);
  registrar/garantir emissão do seller.
- **Novo épico (Fase 3) — Monetização Pro + receita de demanda** (tiers, mensalidade opcional, ancillaries).
