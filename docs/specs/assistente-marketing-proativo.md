# Assistente de marketing proativo (filtros, ferramentas e painéis novos)

> **Status:** desenho aprovado pelo Kallef em 27/11/2026, ainda não implementado. Entrega em três
> fases, cada uma vai ao ar sozinha (§ 7).
> **Base:** [assistente-marketing.md](./assistente-marketing.md) (página Assistente de IA, agente
> `movepark-marketing` no beast-bots, ponte na Edge `marketing-assistant`, superfície `/marketing`
> do MCP, proposta que só executa no clique), [marketing-mcp.md](./marketing-mcp.md) (registro
> das tools em `supabase/functions/_shared/marketing/`) e
> [marketing-automation.md](./marketing-automation.md) (motor de segmento e campanha).

## 1. Por quê

O agente virou especialista em 26/11/2026 (manual por objetivo e números medidos), mas recomenda
coisas que a ferramenta não consegue montar nem mostrar:

- O manual manda falar com o cliente **de 1 a 3 dias depois da volta da viagem**, e não existe
  filtro de "dias desde a volta". `days_since_last` conta a partir da compra, não da saída do pátio.
- Toda recomendação diz "Para medir, ...", e não existe ferramenta que meça o resultado de uma
  campanha.
- Ele só age quando o admin escreve. Quem não sabe o que perguntar não chega nas oportunidades
  que a base já mostra.

## 2. Decisões (Kallef, 27/11/2026)

| # | Decisão | Escolha |
|---|---|---|
| D1 | Até onde vai a autonomia | **Proativo na conversa**: a abertura mostra as oportunidades do dia, e quando o admin topa uma jogada o agente encadeia até o cartão de execução. Sem rotina fora do chat. Executar campanha e ligar o envio continuam só no clique |
| D2 | Como os painéis recebem os números | **Cada ferramenta tem o seu painel**, com o número saindo do banco. Não existe ferramenta genérica de gráfico em que o modelo passa os números. A única ferramenta só de tela são os botões de próximo passo, e ela carrega só texto |
| D3 | Lista de filtros | Os 14 do § 3 (15 campos, porque o aeroporto tem dois), medidos na base. Ficaram de fora: trocou de data (9 pessoas), informou o voo (7) e indicação (nenhuma registrada) |
| D4 | Lista de ferramentas | As 5 de leitura e a de tela do § 4 |

## 3. Fase 1: filtros novos de segmento

Medido em 27/11/2026 sobre `marketing_booking_fact` (194 compradores). O número é quantas pessoas
o filtro pega hoje.

| Chave | Rótulo | Tipo | Grupo | Hoje |
|---|---|---|---|---|
| `days_since_return` | Dias desde a volta da viagem | number | Viagem | 16 em até 3 dias, 30 em até 7 |
| `has_upcoming_trip` | Tem viagem marcada | boolean | Viagem | 46 |
| `days_until_next_trip` | Dias até a próxima viagem | number | Viagem | 17 em até 7 dias |
| `next_trip_fare_tier` | Tarifa da próxima viagem | enum (basica, flex, superflex) | Viagem | 6 dos 17 na Básica |
| `parked_now` | Está com o carro no pátio agora | boolean | Viagem | 48 |
| `abandoned_hours_ago` | Horas desde o abandono | number | Comportamento | 5 em até 24 h, 29 em até 7 dias |
| `abandoned_amount` | Valor do carrinho abandonado | money | Valor | ticket médio de R$ 190,83 em 30 dias |
| `destinations` | Aeroportos onde já estacionou | tags (slug do destino) | Preferência | Guarulhos 123, Curitiba 64, Confins 6 |
| `last_destination` | Aeroporto da última viagem | enum (slug do destino) | Preferência | idem |
| `last_fare_tier` | Tarifa da última compra | enum (basica, flex, superflex) | Preferência | |
| `first_channel` | Por onde comprou a primeira vez | enum (site, busca, pagina_destino, mia_whatsapp) | Preferência | site 120, Mia 46, busca 18, destino 10 |
| `first_traffic_source` | De onde veio o tráfego da primeira compra | text (`utm_source`) | Preferência | Pare Seguro 74, ChatGPT 14, Google 5, sem origem 97 |
| `preferred_payment` | Forma de pagamento mais usada | enum (pix, cartao) | Preferência | cartão 104, PIX 91 |
| `used_coupon` | Já usou cupom | boolean | Preferência | 3 |
| `last_rating` | Nota da última avaliação | number (1 a 5) | Preferência | 7 avaliaram, 6 com nota 5 |

Definições, para não haver dúvida na hora de escrever o SQL:

- **Volta da viagem** é o `check_out_at` da reserva paga mais recente com saída no passado.
- **Próxima viagem** é a reserva paga com o menor `check_in_at` no futuro.
  `next_trip_fare_tier` é a tarifa dela.
- **No pátio agora** quer dizer que alguma reserva paga tem `check_in_at <= now() < check_out_at`.
- **Abandono** é o checkout `expired` mais recente que não tem compra do mesmo contato criada depois
  dele. Sem um abandono assim, `abandoned_hours_ago` e `abandoned_amount` ficam nulos. O
  `abandoned` que já existe (checkout começado com viagem por vir) não muda.
- **Destino** vem de `location.destination_id`. As opções de `destinations` e `last_destination`
  são os destinos com pelo menos uma unidade, lidos do cadastro: aeroporto novo entra sozinho.
- **`first_channel`** mapeia `booking.origin`: `hub_direct` vira site, `hub_search` vira busca,
  `hub_destino` vira pagina_destino e `whatsapp-bot` vira mia_whatsapp. Outro valor fica nulo.
- **`preferred_payment`** é o `payment.method` mais frequente entre os pagamentos pagos de reserva
  (`kind = 'booking'`). Em caso de empate, vale o mais recente.
- **`used_coupon`** quer dizer que existe `booking_coupon` em alguma compra.
- **`last_rating`** é o `review.rating` mais recente.

Onde entra (regra da Automação: **campo novo entra nos dois lados**):

1. **Migration nova** que reescreve `marketing_contact_metrics` e `marketing_contact_doc` com os
   campos, e `marketing_segment_fields()` com as 15 linhas novas (14 filtros; o aeroporto tem dois campos). A função deixa de ser `immutable`
   e passa a `stable`, porque as opções de destino são lidas do banco. Os grupos novos são "Viagem"
   e "Preferência".
2. **`SEGMENT_FIELDS`** (`src/features/marketing/segmentBuilder.logic.ts`): o grupo ganha
   `"Viagem" | "Preferência"`, e o construtor da tela carrega as opções de destino por query.
3. **Contrato** `segmentFields.contract.test.ts`: hoje ele lê um arquivo de migration fixo. Passa a
   ler a migration mais recente que define `marketing_segment_fields()`, para não ficar comparando
   com a versão velha.

## 4. Fase 2: ferramentas novas e o painel de cada uma

Todas de leitura, no registro `MARKETING_TOOLS` (`_shared/marketing/tools.ts`), escopo
`marketing:read`. Por isso entram sozinhas na superfície `/marketing` (assistente) e na
`/manager`. Todas devolvem **número agregado**, nunca nome, e-mail nem telefone de cliente. Todas
aceitam `location_ids` para recortar por unidade.

| Tool | Entrada | Saída | Painel |
|---|---|---|---|
| `marketing_get_opportunities` | `location_ids` | lista de jogadas: `chave`, `titulo`, `por_que` (uma frase com o dado), `publico`, `alcance_email`, `ticket_medio`, `definition` (o segmento pronto) e `pedido` (a frase que o botão manda) | cartões com o número grande, a frase e o botão "Montar esse público". Mostra público e ticket médio, **nunca receita esperada** (não prometer resultado) |
| `marketing_get_breakdown` | `dimension` (aeroporto, tarifa, canal, origem_trafego, pagamento, faixa_ticket, dia_semana_entrada), `definition` opcional, `location_ids` | `[{ valor, rotulo, pessoas, percentual }]` e o total | barras horizontais com quantidade e percentual |
| `marketing_get_trend` | `granularity` (dia ou semana), `from`, `to`, `location_ids` | série com `compras`, `abandonos` e `receita` por período | gráfico de linha |
| `marketing_get_calendar` | `days` (padrão 90) | datas com `nome`, `data`, `tipo` (feriado ou ferias), `janela_de` e `janela_ate` (de 7 a 3 dias antes) e `abre_em_dias` | linha do tempo |
| `marketing_measure_campaign` | `campaign_id`, `window_days` (padrão 30) | `matriculados`, `mensagens_enviadas` (`marketing_message` enviada), reservas pagas e receita dos matriculados nos N dias depois da entrada e nos N dias antes, e a variação | barras de antes e depois, com a frase fixa "comparação, não prova: a ferramenta não tem grupo de controle" |

Detalhes:

- **Faixas de ticket** da distribuição: até R$ 100, de R$ 100 a R$ 200, de R$ 200 a R$ 400 e
  acima de R$ 400, sobre o ticket médio da pessoa.
- **Tendência.** Compra é `is_purchase`, contada pelo `created_at`. Abandono é o checkout
  `expired`, pelo `created_at`. Receita é a soma do `total_amount` das compras.
- **Oportunidades.** As jogadas e as suas definições moram no código
  (`_shared/marketing/oportunidades.ts`), e a contagem passa pelo mesmo avaliador do preview de
  segmento. Assim o público do cartão e o público do segmento que o botão monta são a mesma
  conta. As jogadas da primeira versão são:
  - **abandono recente:** `abandoned_hours_ago <= 24`, com o recorte de 7 dias no `por_que`;
  - **segunda compra:** `bookings_count = 1`, `days_since_return` entre 1 e 3 e sem viagem marcada;
  - **troca para Flex antes da viagem:** `days_until_next_trip <= 7` e `next_trip_fare_tier = basica`;
  - **feriado com janela abrindo:** a próxima data do calendário cuja janela abre em até 14 dias,
    com o público de quem já comprou e não tem viagem marcada (`bookings_count >= 1` e
    `has_upcoming_trip = false`). O recorte por aeroporto fica com o admin;
  - **pedido de indicação:** `last_rating = 5`.

  Jogada com público 0 não aparece.
- **Calendário.** As datas são calculadas no código (`_shared/marketing/calendario.ts`): feriados
  nacionais fixos, os móveis pela Páscoa (Carnaval, Sexta-feira Santa, Corpus Christi) e as férias
  escolares de dezembro, janeiro e julho. Não há lista para manter. O teste confere 2026 e 2027
  contra o calendário oficial.
- **Resultado de campanha.** A entrada é o `marketing_enrollment.entered_at` de cada contato. Uma
  reserva paga conta quando é do mesmo contato (`contact_key`) e foi criada na janela. Sem campanha
  executada, a ferramenta diz isso em vez de devolver zeros que parecem resultado.

**Ferramenta de tela `sugerir_proximos_passos`** (no beast-bots, não chama o Hub). Entrada:
`passos`, de 1 a 3 textos, cada um com até 48 caracteres. A tela desenha os textos como botões
embaixo da resposta, e o clique manda o texto como mensagem do admin. Só a última resposta da
conversa deixa clicar.

**Na tela** (`src/features/marketing-assistant/`): os painéis novos aparecem em **destaque**, como
o segmento e a mensagem (`ondeMostrar`). Cada um ganha rótulo nos passos (`ROTULOS`). Os botões de
próximo passo ficam sempre no fim da resposta.

**Documentação (ADR-003):** as tools novas entram em `marketing-mcp.md` e no § 4 de `mcp.md`, e o
`bun run lint:openapi` reprova tool sem documentação.

## 5. Fase 3: proatividade

1. **Abertura.** A conversa vazia mostra as Oportunidades de hoje no lugar das três sugestões
   fixas. A tela chama a Edge `marketing-assistant` com a ação nova `{ acao: "oportunidades",
   location_ids? }`, que roda `marketing_get_opportunities` com o admin como ator, **sem passar pelo
   modelo**: abre na hora e não gasta IA. O botão de cada cartão começa a conversa com o `pedido` da
   jogada. Se a consulta falhar, voltam as sugestões fixas.
2. **Encadeamento.** Quando o admin topa uma jogada, o agente faz a sequência sem pedir licença a
   cada passo:
   - mede o público (`marketing_preview_segment`);
   - salva o segmento;
   - monta a campanha em rascunho;
   - mostra a mensagem (`marketing_render_message`);
   - chama `marketing_run_campaign`, que cria a proposta.

   Ele para no cartão. Nunca ativa campanha nem cupom sem o admin pedir.
3. **Ferramenta certa por pergunta** (na persona):

   | Pergunta | Ferramenta |
   |---|---|
   | Por onde começo? | oportunidades |
   | Como está tal aeroporto? | tendência e distribuição |
   | Quando mando? | calendário |
   | Deu certo? | resultado da campanha |

   A frase "Para medir," cita o resultado de verdade quando a campanha já rodou.
4. **Fecho.** Toda resposta termina chamando `sugerir_proximos_passos`.

A persona (`tenants/movepark-marketing/persona.ts`) ganha essas regras. O bloco de números medidos
continua, com a data.

## 6. Testes

| Camada | O que prova |
|---|---|
| pgTAP (rodado no banco de produção pelo `scripts/pgtap-vivo.mjs`) | cada filtro novo contra reservas de teste: voltou há 2 dias, viagem marcada na Básica, carro no pátio, abandono há 5 horas sem compra depois, abandono seguido de compra (não conta), destino, canal, pagamento com empate, cupom e nota |
| Deno | as 5 ferramentas: formato da saída, recorte por unidade, **nenhum dado pessoal na saída**; a jogada com público 0 some; o calendário de 2026 e 2027; resultado sem campanha executada; a ação `oportunidades` da Edge só para `hub_admin` |
| Vitest | cada painel com dado de exemplo; os botões (só a última resposta clica, e o clique envia o texto); a abertura com oportunidades e a volta para as sugestões fixas quando a consulta falha; o contrato de campos |
| beast-bots | a ferramenta de tela (de 1 a 3 passos, até 48 caracteres); evals com o modelo de verdade e o MCP falso, que ganha as ferramentas novas (abaixo) |

Os evals do agente cobram estes comportamentos:

- "Por onde começo?" usa as oportunidades e não lista leads.
- Topar a segunda compra encadeia até a proposta sem dizer que disparou.
- "Quando mando a do Natal?" usa o calendário.
- "A campanha deu certo?" usa o resultado e não inventa número.
- Toda resposta fecha com os próximos passos.

## 7. Entrega

| Fase | O que vai ao ar | Onde |
|---|---|---|
| 1 | os 14 filtros no banco, no catálogo e no construtor de segmento da tela, mais os testes. Já servem para quem monta segmento na mão | Hub (main) |
| 2 | as 5 ferramentas, os painéis, a ação `oportunidades` da Edge e a documentação | Hub (main) |
| 3 | a abertura com oportunidades, os botões, a persona e os evals | Hub (main) + beast-bots (PR; **mesclar é publicar**, então só com o ok do Kallef) |

Em nenhuma fase uma campanha é executada, e a chave geral do envio segue desligada.

## 8. Fora desta spec

- Rotina do agente fora do chat (resumo diário, rascunhos sozinho): descartada na D1.
- Ferramenta genérica de gráfico: descartada na D2.
- Abertura e clique de e-mail: o envio não registra nenhum dos dois hoje
  (`marketing_message` só tem `sent_at`). A medição é por reserva paga.
- Grupo de controle na campanha.
