# Minutas jurídicas (rascunho, 27/09/2026)

Três minutas para revisão jurídica, escritas a partir da revisão de consistência produto-contrato feita em 27/09/2026. **Nada aqui está publicado.** Os Termos e a Política vigentes continuam sendo a v2 no banco (`legal_document`, 18/08/2026); o contrato vigente continua sendo a v1 em `src/features/payouts/contract.ts`. Publicar exige: advogado revisar, Kallef fechar as [DECISÃO], e depois o Manager (`/manager/legal`) para Termos e Política e um PR para o contrato.

Regras de texto: pt-BR, sem travessão, "Movepark" grafado assim, cláusulas numeradas, linguagem clara (CDC art. 54, §3º). Marcações: **[DECISÃO]** precisa de escolha do Kallef; **[ADVOGADO]** precisa de validação jurídica.

## `2026-09-27-termos-de-uso-v3.md`

O que muda em relação à v2:

- Cancelamento deixa de ser "48 horas" e passa a ser por Tarifa (24h Básica e Flex, 1 minuto Superflex), com a faixa "depois do prazo, antes do check-in" e o no-show escritos.
- Direito de arrependimento (CDC art. 49) compatibilizado com serviço de data certa.
- Três modalidades de página (reserva na Movepark, white-label, lote mapeado) e o que a Movepark responde em cada uma (ADR-009).
- Preço, PIX de 30 minutos, parcelamento em 12x com 2,99% a.m. acima de 3x e CET, CPF obrigatório.
- Tabela de Tarifas com preços e benefícios reais; proteção de voo com as 24h por conta da Movepark e o excedente cobrado pelo estacionamento na saída.
- Cupom, carteira (90 dias, sem conversão em dinheiro) e indicação (R$ 25 após a primeira reserva concluída).
- Garantia de vaga limitada a realocação com diferença ou reembolso integral, sem "crédito extra".
- Responsabilidade pelo veículo no estacionamento (Súmula 130 STJ) e o que a Movepark assume.
- Atendimento com canais e horário (seg a sex, 9h às 18h, WhatsApp (11) 99475-2952, contato@movepark.co).
- Maiores de 18. Foro do domicílio do consumidor no lugar de São Paulo com renúncia.
- Avaliações, dados publicados para máquina, versão e histórico.

Decisões e validações: 5.3 CET na UI; 6.3 alteração de reserva paga; 7.2 e 7.4 redação frente ao CDC; 7.5 prazo único de reembolso; 9.1 uso de cupom em cancelamento; 9.2 e 9.4 débito e reversão da carteira ainda não existem; 10.2 retirar o "crédito pelo transtorno" da copy; 11.2 prazo de primeira resposta; 12.2 solidariedade da plataforma; sede da empresa.

## `2026-09-27-politica-de-privacidade-v3.md`

O que muda em relação à v2:

- Lista de dados por momento de coleta, incluindo CPF/CNPJ, data de nascimento, veículos, endereços, cartões salvos, número do voo, conversas e dados de parceiro.
- Operadores reais: Supabase, Cloudflare, Pagar.me, Meta/WhatsApp, Amazon SES, Google (login, Places, Gemini), Microsoft Clarity, Google Tag Manager, ViaCEP e BrasilAPI, com transferência internacional.
- Papéis LGPD entre Movepark e estacionamento.
- Retenção com anonimização imediata na exclusão da conta, reserva sem PII por 5 anos, logs 6 meses.
- Cookies com dois caminhos (legítimo interesse com opt-out, ou consentimento com banner), deixado como decisão.
- Menores, segurança, direitos com prazo de resposta.

Decisões e validações: DPO nomeado e caixa privacidade@movepark.co; base legal e mecanismo dos cookies (8.1 e 8.2); confirmar que o GTM não carrega tag de anúncio; prazos de retenção de conversas e do Clarity; mecanismo de transferência internacional e região do Supabase; decisão automatizada antifraude; enquadramento dos controladores.

## `2026-09-27-contrato-do-parceiro-v2.md`

O que muda em relação à v1 (que tinha 7 cláusulas genéricas e nenhum número):

- Objeto e modalidades (reserva na Movepark e white-label).
- Comissão de 20% padrão, variável por origem, congelada na reserva; Tarifa e juros fora da base.
- Liberação em 30 dias, repasse automático dia 10 sem taxa (mínimo R$ 50), saque manual com R$ 3,67 da Pagar.me, extrato.
- Estorno por conta do Parceiro com débito do saldo ou dívida abatida nas vendas seguintes; chargeback pela regra de comissão.
- Obrigações: honrar reserva e capacidade, tolerância de 60 minutos, proteção de voo com excedente cobrado na saída pela tabela do Parceiro, garantia de vaga, responsabilidade pelo veículo (Súmula 130 STJ), conformidade.
- Dados do cliente (LGPD, papéis, proibição de uso para marketing), marca e conteúdo, white-label, suspensão, vigência e rescisão com 30 dias, limitação de responsabilidade, foro de São Paulo.
- Aceite eletrônico com versão, hash, IP e usuário, e gate de exibição sem aceite.

Decisões e validações: 2.3 quem muda a modalidade; 3.2 prazo de aviso de mudança de comissão; 3.4 remuneração do white-label e janela de atribuição; 4.1 marco do prazo de liberação; 5.1 quem paga reembolso por liberalidade; 5.4 encargos da dívida; 7.5 multa por reserva não honrada; 7.7 seguro obrigatório ou não; 10.1 prazo de uso da marca após o fim; 11.1 anexo do white-label; 15.1 modalidade de alteração; 16.1 implementar hash, IP, usuário e PDF no aceite; 16.3 gate no `is_listed` e transição das 10 empresas sem aceite; 14.1 limitação de responsabilidade; sede da empresa.

## O que o produto precisa fazer junto com a publicação

- Termos: exibir taxa mensal e CET no parcelamento; unificar o prazo de reembolso em `/cancelamento` e no diálogo de cancelamento; tirar o "crédito pelo transtorno" de `src/features/guarantee/copy.ts`; corrigir as FAQs globais (troca de veículo só Flex+, PIX 30 min, WhatsApp só Flex+, tolerância de entrada).
- Privacidade: criar e monitorar privacidade@movepark.co; implementar opt-out ou banner conforme a decisão; confirmar o container GTM.
- Contrato: gravar hash, IP e usuário no aceite; gerar PDF; gate de exibição; colher o aceite das 10 empresas.
