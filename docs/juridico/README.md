# Minutas jurídicas (rascunho, 27/09/2026)

Três minutas escritas a partir da revisão de consistência produto-contrato de 27/09/2026. **Publicadas em 27/09/2026** por decisão do Kallef (o produto ainda não foi lançado ao público): Termos v3 e Privacidade v3 no banco (`legal_document`, versão 3, pela RPC `publish_legal_document`) e contrato v2 em `partner_contract_version`. A conversão de Markdown para o HTML do banco (tabelas viram listas, porque o sanitizador só aceita h2, h3, p, ul, ol, li, strong, em, a, br) foi feita por script; o texto é o das minutas sem as marcações. Os Termos e a Política vigentes continuam sendo a v2 no banco (`legal_document`, 18/08/2026); o contrato vigente continua sendo a v1 em `src/features/payouts/contract.ts`.

As 22 decisões de produto foram confirmadas pelo Kallef em 27/09/2026 (`2026-09-27-decisoes-sugeridas.md`) e já estão incorporadas no texto, sem marcação. O que resta é: (1) a validação jurídica dos pontos marcados **[ADVOGADO]**; (2) as tarefas de produto listadas no fim, que precisam estar no ar antes da publicação, porque os textos já descrevem esse comportamento. Publicar: o Manager (`/manager/legal`) para Termos e Política; PR para o contrato.

Regras de texto: pt-BR, sem travessão, "Movepark" grafado assim, cláusulas numeradas, linguagem clara (CDC art. 54, §3º).

## `2026-09-27-termos-de-uso-v3.md`

O que muda em relação à v2:

- Cancelamento deixa de ser "48 horas" e passa a ser por Tarifa (24h Básica e Flex, 1 minuto Superflex), com a faixa "depois do prazo, antes do check-in" e o no-show escritos.
- Direito de arrependimento (CDC art. 49) compatibilizado com serviço de data certa.
- Três modalidades de página (reserva na Movepark, white-label, lote mapeado) e o que a Movepark responde em cada uma (ADR-009).
- Preço, PIX de 30 minutos, parcelamento em 12x com 2,99% a.m. acima de 3x, com taxa, acréscimo e CET na tela, CPF obrigatório.
- Alteração de data em reserva paga recalcula e cobra ou devolve a diferença.
- Tabela de Tarifas com preços e benefícios reais; proteção de voo com as 24h por conta da Movepark e o excedente cobrado pelo estacionamento na saída.
- Cupom (uso não devolvido em cancelamento), carteira (sem conversão em dinheiro; abate no checkout "será liberado"; enquanto não estiver disponível, os créditos não expiram; depois, 90 dias) e indicação (R$ 25 após a primeira reserva concluída).
- Garantia de vaga limitada a realocação com diferença ou reembolso integral, sem crédito extra.
- Reembolso: PIX em até 1 dia útil; cartão enviado ao emissor em até 2 dias úteis e visível em até duas faturas.
- Responsabilidade pelo veículo no estacionamento (Súmula 130 STJ) e o que a Movepark assume.
- Atendimento com canais, horário (seg a sex, 9h às 18h, WhatsApp (11) 99475-2952, contato@movepark.co) e primeira resposta em até 1 dia útil.
- Maiores de 18. Foro do domicílio do consumidor no lugar de São Paulo com renúncia.
- Avaliações, dados publicados para máquina, versão e histórico.

[ADVOGADO] que restou: 1.1 endereço da sede; 3.2 menor emancipado e conta de pessoa jurídica; 7.2 redação frente ao CDC art. 51, IV, e art. 39, V; 7.4 compatibilização do arrependimento com o prazo da Tarifa; 12.2 solidariedade da plataforma na cadeia de fornecimento (CDC art. 7º, parágrafo único, e art. 25, §1º).

## `2026-09-27-politica-de-privacidade-v3.md`

O que muda em relação à v2:

- Lista de dados por momento de coleta, incluindo CPF/CNPJ, data de nascimento, veículos, endereços, cartões salvos, número do voo, conversas e dados de parceiro.
- Operadores reais: Supabase, Cloudflare, Pagar.me, Meta/WhatsApp, Amazon SES, Google (login, Places, Gemini), Microsoft Clarity, Google Tag Manager, ViaCEP e BrasilAPI, com transferência internacional.
- Encarregado de Dados da Movepark (função, sem nome de pessoa) em privacidade@movepark.co.
- Papéis LGPD entre Movepark e estacionamento.
- Retenção com anonimização imediata na exclusão da conta, reserva sem PII por 5 anos, logs 6 meses, conversas 2 anos, Clarity 30 dias.
- Cookies de medição por legítimo interesse com opt-out no rodapé ("Não medir minha navegação"), sem banner; sem cookies de publicidade.
- Menores, segurança, direitos com prazo de resposta.

[ADVOGADO] que restou: 1.1 endereço da sede; 1.3 controladores independentes ou conjuntos (art. 42); 3 e 8.1 legítimo interesse com opt-out para medição (GTM e Clarity), conforme o guia de cookies da ANPD; 3 decisão automatizada frente ao antifraude do Pagar.me; 4 mecanismo de transferência internacional com cada operador e região do Supabase; 6 prazo de resposta do art. 19, II.

## `2026-09-27-contrato-do-parceiro-v2.md`

O que muda em relação à v1 (que tinha 7 cláusulas genéricas e nenhum número):

- Objeto e modalidades (reserva na Movepark e white-label); só a Movepark muda a modalidade, a pedido do Parceiro.
- Comissão de 20% padrão, variável por origem, congelada na reserva, com 15 dias de aviso para mudança; Tarifa e juros fora da base; white-label sem remuneração nesta fase, salvo regra de origem, com janela de atribuição de 7 dias.
- Liberação em 30 dias da confirmação do pagamento, repasse automático dia 10 sem taxa (mínimo R$ 50), saque manual com R$ 3,67 da Pagar.me, extrato.
- Estorno por conta do Parceiro com débito do saldo ou dívida abatida nas vendas seguintes; reembolso por liberalidade da Movepark sai só da Movepark; chargeback pela regra de comissão.
- Obrigações: honrar reserva e capacidade, tolerância de 60 minutos, proteção de voo com excedente cobrado na saída pela tabela do Parceiro, garantia de vaga com multa de 50% por reserva não honrada, responsabilidade pelo veículo (Súmula 130 STJ) com seguro facultativo, conformidade.
- Dados do cliente (LGPD, papéis, proibição de uso para marketing), marca e conteúdo (90 dias após o fim), suspensão, vigência e rescisão com 30 dias, limitação de responsabilidade, nova versão com 15 dias de aviso e aceite expresso para cláusulas econômicas, foro de São Paulo.
- Aceite eletrônico com versão, hash SHA-256, data, IP, usuário e PDF; gate só em unidade em modo Hub; 30 dias de transição pelo link de acesso ao Recebimento.
- Anexo A: white-label (objeto, conteúdo e preço do Parceiro, remuneração, dados, vigência, aceite próprio).

[ADVOGADO] que restou: cabeçalho, sede; 5.4 encargos e forma de cobrança da dívida em aberto; 7.5 multa de 50% por reserva não honrada; 9.1 controladores independentes; 14.1 limitação de responsabilidade; 15.1 modalidade de alteração por nova versão; A.4 Movepark como operadora no white-label.

## O que o produto precisa fazer antes da publicação

| Tarefa | Onde | Texto que depende dela |
|---|---|---|
| Mostrar taxa mensal (2,99% a.m.), total do acréscimo e CET no seletor de parcelas | `src/features/checkout/Step4Payment.tsx` (a política já está em `app_setting.card_installment_policy`) | Termos 5.3 |
| Pausar a expiração da carteira até existir o débito no checkout (créditos existentes sem `expires_at`) | `wallet_ledger` / `get_my_wallet` | Termos 9.2 |
| Opt-out de medição: link "Não medir minha navegação" no rodapé e nesta Política, gravando a recusa e impedindo a carga de GTM e Clarity | `index.html`, `src/lib/clarity.ts`, rodapé | Privacidade 8.2 |
| Aceite do contrato com versão, hash SHA-256, data, IP, usuário e PDF baixável e enviado por e-mail; gate só em unidade em modo Hub; campanha de 30 dias pelo link de acesso ao Recebimento | `operator_accept_contract`, `company`, `src/features/payouts/contract.ts`, e-mail | Contrato 16.1 a 16.4 |
| Criar o alias privacidade@movepark.co apontando para contato@movepark.co (Kallef, no provedor de e-mail) | provedor de e-mail | Privacidade 1.2, 6 e 12 |
| Conferir no Tag Manager (GTM-KHBBZT9) que não há tag de Google Ads, Meta Pixel ou similar; se houver, a base dos cookies muda para consentimento com banner | Tag Manager (Kallef) | Privacidade 8.1 |
| Confirmar no painel do Clarity que a retenção está em 30 dias | Clarity (Kallef) | Privacidade 5 |

Alinhamentos já feitos no código em 27/09 (`96b355c6`): prazo de reembolso em `/cancelamento` e no diálogo de cancelamento, e a copy da garantia de vaga sem o "crédito pelo transtorno". Ficam ainda as FAQs globais no banco: troca de veículo só Flex e Superflex, PIX 30 minutos, WhatsApp só Flex e Superflex, tolerância de entrada.
