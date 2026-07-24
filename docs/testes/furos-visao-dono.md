# Furos e insights da visão do dono de estacionamento

Achados da varredura da jornada do dono (parceiro) no painel `/operator`, feita em
24/07/2026 com o dono real `peu+operador@fera.ag` (owner da company **Abbapark**,
unidade Aeroporto Afonso Pena). O roteiro automatizado que cobre essa jornada é
`e2e/owner/O01-dono-jornada.spec.ts` (project `e2e-owner-tx`).

O foco é a experiência do dono, além do passou/falhou: o que está fácil, o que falta,
onde tem furo. Cada furo aponta o arquivo que comprova.

## Resumo

| # | Furo | Gravidade | Onde |
|---|---|---|---|
| F1 | O dono não vê as próprias reservas canceladas | Alta | `src/features/bookings/api.ts:31` + cancelamento seta `deleted_at` |
| F2 | Reservas de teste de segurança poluem a lista real do dono | Média | dados em produção (3 bookings "Test Pentest", valor R$ 0,00) |
| F3 | "Preço base · R$ 0,00" aparece em todo card de preço | Baixa | `src/routes/operator/pricing.tsx:59` |

Lacunas de administração (o que a vitrine/detalhe mostram e o dono não gerencia):
ver a seção "Lacunas de administração".

## F1 · O dono não consegue ver as reservas canceladas (Alta)

**Sintoma.** Em `/operator/bookings`, com o filtro Status em "Cancelada", a tela mostra
"Nenhuma reserva encontrada". O Abbapark tem 18 reservas canceladas no banco. Com o
filtro em "Todos", também não aparecem: só saem as concluídas.

**Causa.** Cancelar uma reserva faz soft-delete: o registro recebe `status = 'cancelled'`
**e** `deleted_at = now()` ao mesmo tempo. Isso acontece em três lugares:

- `supabase/migrations/20260624000000_public_api.sql:669` (RPC de cancelamento)
- `supabase/migrations/20260614000000_capacity_real.sql:352` (expiração/cancelamento)
- `supabase/migrations/20260630000000_payment_refund.sql:47` (estorno)

E a lista do painel filtra `deleted_at is null` (`src/features/bookings/api.ts:31`). Como
toda reserva cancelada tem `deleted_at` preenchido, o filtro "Cancelada" nunca retorna
nada. Ele é natimorto.

**Impacto.** O dono perde a visão de cancelamentos, que é operação e é dinheiro
(entender por que cancelam, conferir estorno, medir taxa de cancelamento). O funil de
Relatórios conta canceladas pelo status, mas a lista de reservas não deixa abrir uma
sequer.

**Direção de correção (a decidir).** "Cancelada" é um status terminal legítimo, não uma
exclusão. O caminho limpo é parar de setar `deleted_at` no cancelamento e liberar
capacidade pelo status. Cuidado: as consultas de capacidade hoje contam ocupação
filtrando `deleted_at is null`; tirar o soft-delete exige que elas passem a excluir
canceladas pelo status. É decisão de modelagem, não troca de uma linha só. Alternativa
paliativa: a lista do dono mostrar canceladas mesmo com `deleted_at` setado.

**Cobertura.** `O-02` em `e2e/owner/O01-dono-jornada.spec.ts` documenta o furo com
`test.fail`: hoje passa como falha esperada; quando o furo for fechado, o teste fica
vermelho pedindo para remover a marcação.

## F2 · Dados de teste de segurança na lista real do dono (Média)

Com o filtro em "Todos", as três reservas que aparecem são "Test Pentest", "Test Pentest 2"
e uma sem cliente, todas com **Valor R$ 0,00** e status Concluída. São artefatos de teste
de segurança que vazaram para produção e agora moram na visão de reservas de um parceiro
real. O código está certo; o problema é higiene de dados: convém limpar (cancelar ou
arquivar) para o dono não ver reserva de R$ 0,00 no painel dele.

## F3 · "Preço base · R$ 0,00" em todo card de preço (Baixa)

Na tela de Preços, cada card mostra "Preço base · R$ 0,00" (`src/routes/operator/pricing.tsx:59`),
porque `company_parking_type.base_price` está em 0 (placeholder). O próprio editor diz que
o preço base "não entra no cálculo" e serve de referência. Mostrar R$ 0,00 com destaque
confunde: parece que a vaga é de graça. Ou some quando é 0, ou vira o valor de referência
de verdade. É a pendência já conhecida de "seed de capacidade/base_price" (ver
`docs/specs/README.md`).

## Insights da jornada (não são furos)

- **Reserva pendente não conta como receita.** A aba Receita de Relatórios soma só
  `confirmed/checked_in/completed` (`src/features/reports/api.ts`). Uma reserva nova em
  `pending` aparece no funil de Reservas, mas não na Receita até ser paga. É o esperado,
  mas o dono precisa saber ler isso.
- **Mudar o preço propaga na hora.** Confirmado de ponta a ponta no `O-03`: o dono edita
  a diária em Preços, e o valor novo já sai na RPC `simulate_price` (a mesma da busca e do
  detalhe) e entra no snapshot da reserva que o consumidor cria em seguida. Não há defasagem
  de cache no caminho do consumidor (query fria a cada navegação).
- **A tela de Preços é clara.** Estratégia por tipo de vaga, faixas de diária editáveis,
  "Ver tabela" para simular, aviso de curva invertida. O caminho "editar e ver refletir" é
  direto.

## Lacunas de administração (vitrine e detalhe)

Levantamento do que a vitrine (card de busca) e a página de detalhe da unidade mostram ao
consumidor, cruzado com o que o dono consegue administrar hoje no `/operator`.

**A maior parte já é do dono.** Em `/operator/locations/:id/editar` e telas vizinhas ele
edita: foto de capa e galeria, endereço e mapa, amenidades, horário de funcionamento,
transfer (frequência e tempo ao terminal), aviso e passo a passo de "como chegar", política
de reserva da unidade, contato, capacidade, preço base e regras de preço, promoções,
serviços (add-ons) e FAQ da unidade. Ele também responde avaliações em `/operator/reviews`.
Isso cobre a vitrine inteira e quase todo o detalhe. As RPCs de escrita são gateadas por
escopo (`locations:write`, `parking-types:write`, `pricing:write`), em
`supabase/migrations/20260714000000_regate_operator_rpcs.sql`.

**O que o dono NÃO administra hoje (candidatos a abrir):**

| Informação que o cliente vê | Onde aparece | Quem controla hoje | Onde comprova |
|---|---|---|---|
| Nome do tipo de vaga e a **descrição** do tipo | Card e corpo do detalhe | Catálogo global (hub_admin); o dono só seleciona o tipo | `src/routes/listing.tsx:322` (descrição) · `src/features/.../ParkingTypeForm.tsx:186` |
| Nome comercial da empresa (título do card e header) | Card e header do detalhe | Só hub_admin (sem rota nem policy de UPDATE de `company` para operator) | `src/features/search/ResultCard.tsx:212` · `src/routes/listing.tsx:253` |
| Linhas principais da política de cancelamento | Detalhe, bloco de cancelamento | Fixo em código; o dono só acrescenta 1 linha via política de reserva | `src/features/bookings/cancellation.logic.ts` (usado em `listing.tsx:506`) |
| FAQ global (dentro do "Ver todas") | Detalhe, FAQ | Só hub_admin; o dono vê como referência | `src/routes/operator/faq.tsx:55` (`showGlobal` read-only) |
| Distâncias a terminais | Card e detalhe | Derivado de PostGIS sobre `destination_point` (hub_admin) | `src/routes/listing.tsx:356` |
| Garantia Movepark | Detalhe | Copy de plataforma (código) | `src/features/guarantee/copy.ts` |

**Sugestão de prioridade (você decide se precisa):**

1. **Descrição do tipo de vaga.** É o único texto livre do corpo da página que o dono não
   controla, e é onde ele explicaria o diferencial da vaga dele. Hoje vem do catálogo
   global. Forte candidato a virar um override por unidade.
2. **Política de cancelamento por estacionamento.** Se a regra varia por lote, o dono
   precisaria editar as linhas principais, não só acrescentar uma. Hoje é genérica e fixa.
3. **Nome comercial da empresa.** Provavelmente controle intencional da Movepark. Vale só
   confirmar com o time se o dono deveria poder ajustar.

**A verificar (a análise não fechou 100%):**
- Editar `base_price` depois de criado: no card do tipo em `/operator/locations/:id/parking-types`
  o preço base aparece read-only; o dono muda o efetivo pelas regras em `/operator/pricing`,
  mas não achei editor do `base_price` pós-criação. Confirmar se é lacuna ou decisão.
- Alguma RPC de edição de `company` exposta ao dono: não encontrada em
  `20260714000000_regate_operator_rpcs.sql`. Confirmar que o nome da empresa é mesmo só do manager.
