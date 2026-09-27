# Contrato de parceria Movepark e estacionamento (minuta v2)

> **RASCUNHO PARA REVISÃO JURÍDICA.** Não publicado. Substitui a v1 de `src/features/payouts/contract.ts` (texto de 7 cláusulas, aceite "simulado" via `operator_accept_contract`, aceito por 1 das 11 empresas). Números vindos do produto em 27/09/2026: `company.take_rate_bps` 2000, `payout_release_days` 30, `payout_auto_day` 10, `payout_auto_min_cents` 5000, `payout_withdrawal_fee_cents` 367, `location.tolerance_minutes` 60, regras de comissão por origem, estorno híbrido e chargeback. As decisões de produto foram confirmadas pelo Kallef em 27/09/2026 (`2026-09-27-decisoes-sugeridas.md`) e já estão incorporadas; [ADVOGADO] marca validação jurídica.

**CONTRATO DE INTERMEDIAÇÃO DE RESERVAS DE ESTACIONAMENTO**

**Movepark:** Movepark Tecnologia Ltda., CNPJ 68.183.164/0001-35, [ADVOGADO: sede], neste ato "Movepark".

**Parceiro:** [razão social], CNPJ [número], [endereço], representado por [nome, CPF] conforme cadastro de recebimento, neste ato "Parceiro".

Contrato de adesão, aceito eletronicamente na forma da cláusula 16.

## 1. Objeto

1.1. A Movepark divulga as unidades do Parceiro na plataforma movepark.co e nos canais dela, recebe reservas e pagamentos de clientes, emite o voucher e repassa ao Parceiro o valor devido, nas condições deste contrato.

1.2. Este contrato não cria exclusividade, sociedade, franquia nem vínculo trabalhista. O Parceiro continua vendendo pelos canais dele.

1.3. A relação de guarda do veículo é entre o Parceiro e o cliente. A Movepark intermedeia a reserva e o pagamento.

## 2. Modalidades de unidade

2.1. **Unidade com reserva na Movepark:** o cliente paga no checkout da Movepark, e valem as cláusulas 3 a 9.

2.2. **Unidade white-label:** a página da unidade na Movepark leva o cliente ao site ou WhatsApp do Parceiro, onde ele paga. A Movepark é vitrine. Não há repasse, e a remuneração da Movepark é a definida na cláusula 3.4. O Parceiro responde sozinho por pagamento, voucher, cancelamento e atendimento dessas reservas e informa ao cliente as regras dele antes da compra.

2.3. A modalidade é definida por unidade no cadastro. Só a Movepark altera a modalidade, a pedido do Parceiro, depois de conferir que a unidade tem contrato aceito, recebedor ativo e tabela de preços válida para passar a receber reservas na Movepark.

## 3. Comissão

3.1. Sobre cada reserva paga na Movepark, a Movepark retém comissão de 20% (vinte por cento) do valor base da reserva (diária mais serviços extras do Parceiro, sem a Tarifa da Movepark e sem juros de parcelamento), salvo percentual diferente registrado no cadastro do Parceiro.

3.2. **Comissão por origem.** A comissão pode ser diferente conforme a origem da reserva (por exemplo, cliente vindo de campanha da Movepark, do site do Parceiro ou de canal de terceiro), conforme regras de origem cadastradas pela Movepark e visíveis ao Parceiro no painel, na reserva. A regra aplicada fica congelada na reserva e não muda depois. Alteração de regra vale só para reservas novas, é comunicada ao Parceiro com 15 dias de antecedência, e a reserva feita antes da mudança mantém a regra que estava congelada nela.

3.3. A Tarifa (Básica, Flex, Superflex), os juros de parcelamento e o cashback são da Movepark e não entram na base do Parceiro. O Parceiro recebe sempre sobre o preço base, sem depender da forma de pagamento escolhida pelo cliente.

3.4. **Unidade white-label:** sem remuneração nesta fase, salvo regra de origem cadastrada pela Movepark e visível ao Parceiro no painel. Quando houver regra, a reserva é atribuída à Movepark se o cliente chegou ao canal do Parceiro por link da Movepark nos 7 dias anteriores à compra. As demais condições do white-label estão no Anexo A.

3.5. A taxa do meio de pagamento (Pagar.me) é paga pela Movepark, salvo regra de origem que diga o contrário, visível na reserva.

## 4. Liberação, repasse e saque

4.1. O valor do Parceiro em cada reserva fica disponível 30 (trinta) dias contados da confirmação do pagamento pelo cliente, independentemente da data de entrada ou saída do veículo. A Movepark pode reduzir esse prazo por Parceiro.

4.2. **Repasse automático mensal, sem taxa.** Todo dia 10 a Movepark transfere para a conta bancária cadastrada tudo o que estiver liberado, desde que o valor seja de pelo menos R$ 50,00. Abaixo disso, acumula para o mês seguinte. Se o dia 10 cair em fim de semana ou feriado, a transferência é liquidada no dia útil seguinte. A taxa bancária desse repasse (R$ 3,67 por transferência, cobrada pela Pagar.me) é da Movepark, devolvida ao Parceiro no repasse da venda seguinte.

4.3. **Saque manual.** O Parceiro pode pedir, no painel, a qualquer momento, a transferência do que estiver liberado. Nesse caso a taxa da Pagar.me, hoje R$ 3,67 por saque, é descontada do saldo do Parceiro, e o painel mostra o valor antes da confirmação.

4.4. O extrato por unidade fica no painel do Parceiro (Financeiro), com cada reserva, comissão, taxa, estorno, dívida, saque e repasse.

4.5. Os valores ficam em conta de recebedor mantida na Pagar.me em nome do Parceiro, criada pela Movepark a partir do cadastro de recebimento (dados da empresa, do representante e bancários). A Movepark não é instituição financeira e não remunera saldo parado.

## 5. Cancelamento, estorno e dívida

5.1. O cliente pode cancelar com reembolso integral dentro do prazo da Tarifa (24 horas antes do check-in na Básica e na Flex; até 1 minuto antes na Superflex). A Movepark pode também reembolsar fora do prazo. Quando o reembolso fora do prazo é decisão comercial da Movepark (liberalidade), o valor sai só da parte da Movepark, e o Parceiro mantém o que recebeu. Quando o reembolso decorre de falha do Parceiro (cláusulas 6.2 e 7), o Parceiro devolve a parte dele na forma da cláusula 5.2.

5.2. Em reserva cancelada com reembolso, o Parceiro devolve a parte dele. Se o saldo disponível do Parceiro na Pagar.me cobrir, o valor é debitado dali na hora. Se não cobrir, a Movepark adianta o reembolso ao cliente e o valor vira dívida do Parceiro, abatida automaticamente da parte dele nas vendas seguintes, até zerar. O Parceiro devolve o líquido que recebeu: a taxa de processamento já paga na venda fica por conta da Movepark.

5.3. O Parceiro é avisado por e-mail a cada cancelamento com estorno, com o valor abatido e o saldo da dívida.

5.4. Se o Parceiro deixar a plataforma com dívida em aberto, a Movepark cobra o saldo por boleto ou PIX em 10 dias, com correção pelo IPCA e juros de 1% ao mês a partir do vencimento. [ADVOGADO: validar encargos e forma de cobrança.]

## 6. Chargeback e fraude

6.1. Em chargeback (contestação do cliente junto ao emissor do cartão), o valor perdido é dividido conforme a regra de comissão aplicada à reserva: no padrão, cada parte perde a sua parte (comissão da Movepark e repasse do Parceiro). Regra de origem pode atribuir o chargeback a uma só das partes, visível na reserva.

6.2. Chargeback causado por falha do Parceiro (veículo não recebido, cobrança indevida no balcão) é integralmente do Parceiro. Chargeback causado por fraude no meio de pagamento é tratado pela regra 6.1.

## 7. Obrigações do Parceiro

7.1. **Honrar a reserva confirmada.** Receber o veículo no período, no tipo de vaga e pelo preço da reserva, sem cobrança adicional pelo período reservado.

7.2. **Capacidade e preço.** Manter no painel a capacidade real por tipo de vaga e a tabela de preços vigente. A Movepark controla a disponibilidade a partir da capacidade declarada; vaga vendida pela Movepark dentro da capacidade é obrigação do Parceiro. Quando a Movepark espelha a tabela do sistema do Parceiro, o Parceiro responde pela tabela publicada lá.

7.3. **Tolerância.** Aceitar a tolerância de saída cadastrada na unidade (60 minutos, padrão da plataforma) sem cobrança. Além da tolerância, cobrar do cliente apenas pela tabela publicada, informando-o antes.

7.4. **Proteção de voo (Superflex).** Quando o cliente aciona a proteção, manter o veículo pelo período coberto (até 24 horas além da saída reservada), que a Movepark paga ao Parceiro pela tabela dele, e registrar no painel a hora real de retirada. O tempo além das 24 horas é cobrado pelo Parceiro diretamente do cliente, na retirada, pela tabela publicada, sem comissão da Movepark. Cobrar valor diferente do informado ao cliente é falha do Parceiro.

7.5. **Garantia de vaga.** Se o Parceiro não tiver vaga para reserva confirmada, ele paga a diferença de preço da realocação em outro estacionamento e, não havendo realocação, o reembolso integral ao cliente, que a Movepark adianta e abate na forma da cláusula 5.2. Além disso, o Parceiro paga multa de 50% (cinquenta por cento) do valor da reserva não honrada, lançada como dívida e abatida da parte dele nas vendas seguintes, com aviso por e-mail. [ADVOGADO: validar a multa e o seu valor.]

7.6. **Operação.** Check-in e check-out no painel ou por leitura do voucher, no dia; contato da unidade atualizado e respondendo em horário de funcionamento; traslado e comodidades declaradas na ficha correspondendo à realidade.

7.7. **Responsabilidade pelo veículo.** O Parceiro responde perante o cliente por furto, roubo ou dano ao veículo nas dependências dele (CDC e Súmula 130 do STJ), com ou sem seguro contratado. O seguro garagista é facultativo nesta versão; se o Parceiro declarar cobertura na ficha da unidade, responde pela veracidade da declaração. Se a Movepark for acionada pelo cliente por fato do Parceiro, o Parceiro a ressarce integralmente, inclusive custos de defesa.

7.8. **Conformidade.** Manter CNPJ ativo, alvará e licenças do estacionamento, e informar a Movepark em até 5 dias de qualquer alteração societária, bancária ou de endereço.

## 8. Obrigações da Movepark

8.1. Divulgar as unidades, com fotos e dados fornecidos pelo Parceiro, e investir em mídia por conta própria, sem custo ao Parceiro.

8.2. Receber o pagamento, emitir voucher, notificar o cliente e o Parceiro a cada reserva, alteração, cancelamento e extensão.

8.3. Repassar ao Parceiro nos prazos da cláusula 4 e manter o extrato disponível.

8.4. Atender o cliente das reservas feitas na Movepark de segunda a sexta, das 9h às 18h, e encaminhar ao Parceiro o que for da operação dele.

8.5. Manter a plataforma disponível, com manutenção avisada quando programada. Indisponibilidade não gera indenização, mas reservas confirmadas antes dela são honradas.

## 9. Dados pessoais dos clientes (LGPD)

9.1. A Movepark é controladora dos dados do cliente na plataforma. O Parceiro é controlador dos dados que recebe para executar a guarda: nome, placa, modelo, período, código da reserva, número do voo quando a proteção é acionada e telefone de contato quando necessário. [ADVOGADO: confirmar controladores independentes.]

9.2. O Parceiro usa esses dados só para executar a reserva e o atendimento dela. É proibido usar dados de cliente da Movepark para marketing próprio, cadastro em outra base ou contato fora da reserva, e é proibido repassar a terceiros. Descumprimento é falta grave (cláusula 12) e o Parceiro responde pelas sanções e indenizações decorrentes.

9.3. O Parceiro adota medidas de segurança compatíveis, limita o acesso aos funcionários que precisam, comunica à Movepark em até 24 horas qualquer incidente com dados de cliente e elimina os dados quando a finalidade termina, respeitados os prazos legais.

9.4. Os dados do próprio Parceiro (cadastro, KYC, bancário) são tratados pela Movepark conforme a Política de Privacidade, com compartilhamento com a Pagar.me para abertura e manutenção do recebedor.

## 10. Marca, conteúdo e avaliações

10.1. O Parceiro autoriza a Movepark a usar nome, logotipo, fotos e descrições da unidade na plataforma, em materiais de divulgação, em conteúdo do blog e redes sociais da Movepark, durante a vigência e por 90 dias após o encerramento, prazo para retirar do ar páginas, posts e materiais já publicados.

10.2. O Parceiro garante que tem direito sobre as fotos e textos que envia.

10.3. A Movepark publica avaliações de clientes com reserva concluída. O Parceiro pode responder e pedir remoção de avaliação que viole os Termos de Uso, mas não pode exigir remoção de avaliação negativa verdadeira.

10.4. A Movepark pode publicar, para leitura por máquina, preço, distância e disponibilidade das unidades (páginas de preços e JSON), como parte da divulgação.

## 11. White-label e canal próprio

11.1. As condições do site e do agente de WhatsApp com a marca do Parceiro (white-label) estão no Anexo A, que só vincula o Parceiro que o aceitar.

11.2. Reserva feita no canal white-label segue a cláusula 2.2.

## 12. Suspensão

12.1. A Movepark pode suspender a exibição de uma unidade, avisando o Parceiro, quando: reserva confirmada não é honrada; há cobrança ao cliente fora da tabela ou fora deste contrato; a capacidade ou o preço estão desatualizados; o recebedor está irregular na Pagar.me; há reclamação grave de cliente ou indício de fraude; ou há descumprimento da cláusula 9.

12.2. Reservas já confirmadas são honradas durante a suspensão. A exibição volta quando a causa é sanada.

## 13. Vigência e rescisão

13.1. Vigência por prazo indeterminado, a partir do aceite eletrônico.

13.2. Qualquer parte pode encerrar sem justificativa com aviso de 30 dias. Reservas confirmadas até o fim do aviso são honradas e repassadas normalmente.

13.3. Encerramento imediato por falta grave: reserva não honrada de forma reiterada, uso indevido de dados de cliente, fraude, ou dívida vencida da cláusula 5.4.

13.4. Ao encerrar, a Movepark repassa o saldo liberado no ciclo seguinte, abatida a dívida, e o Parceiro deixa de usar o white-label.

## 14. Responsabilidade

14.1. Cada parte responde pelos danos que causar à outra por descumprimento deste contrato. A responsabilidade da Movepark perante o Parceiro fica limitada ao total de comissões dos últimos 12 meses da relação, exceto dolo. [ADVOGADO: validar a limitação.]

14.2. Perante o cliente, cada parte responde pelo que assume nos Termos de Uso, sem prejuízo da solidariedade prevista no CDC quando aplicável.

## 15. Disposições gerais

15.1. Comunicações entre as partes valem por e-mail cadastrado e pelo painel. Alterações deste contrato são publicadas em nova versão, com aviso de 15 dias por e-mail e no painel; continuar usando a plataforma após o prazo é aceite da nova versão, salvo alteração nas cláusulas econômicas (3, 4 e 5), que só vale para o Parceiro depois de aceite expresso no painel. [ADVOGADO: validar a modalidade de alteração.]

15.2. Tolerância de uma parte não é renúncia.

15.3. As partes são independentes; nenhuma responde por obrigações trabalhistas, fiscais ou previdenciárias da outra.

## 16. Aceite eletrônico e versão

16.1. O contrato é aceito pelo representante legal cadastrado, no painel do Parceiro, mediante clique após leitura do texto completo. No aceite a Movepark registra e guarda: a versão do contrato, o hash SHA-256 do texto exatamente como exibido, a data e a hora, o endereço IP e o identificador do usuário que aceitou. O PDF do texto aceito, com esses dados de registro no rodapé, fica disponível para download no painel e é enviado por e-mail ao Parceiro.

16.2. Só o titular da conta com papel de Dono pode aceitar.

16.3. Unidade em modalidade de reserva na Movepark (cláusula 2.1) só é exibida com reserva depois do aceite da versão vigente deste contrato; sem aceite, ela não passa na verificação de publicação. Unidade white-label (cláusula 2.2) continua exibida como vitrine.

16.4. **Transição.** Parceiros com aceite da versão anterior, ou sem aceite registrado, têm 30 dias a partir da publicação desta versão para aceitá-la, pelo link de acesso ao Recebimento enviado por e-mail. Depois desse prazo, a cláusula 16.3 se aplica às unidades em modalidade de reserva na Movepark.

## 17. Foro

Fica eleito o foro da Comarca de São Paulo, SP, com renúncia a qualquer outro, para questões entre a Movepark e o Parceiro.

Contrato de parceria, versão 2, vigente a partir de [data]. Versão anterior: v1 (17/08/2026).

## Anexo A: white-label

A.1. **Objeto.** A Movepark fornece ao Parceiro que aceitar este Anexo um site de reservas e, quando contratado, um agente de atendimento no WhatsApp, ambos com a marca do Parceiro (white-label), hospedados e mantidos pela Movepark. A tecnologia é da Movepark, licenciada ao Parceiro durante a vigência deste Anexo, sem exclusividade e sem transferência.

A.2. **Conteúdo, preço e atendimento.** O conteúdo, a tabela de preços, a política de cancelamento e o atendimento do canal white-label são do Parceiro e vinculam só o Parceiro perante o cliente. A Movepark espelha a tabela do sistema do Parceiro no canal e nas páginas da Movepark; o Parceiro responde pela tabela publicada no sistema dele.

A.3. **Remuneração.** Sem remuneração nesta fase. Se as partes cadastrarem regra de origem para o canal, ela fica visível ao Parceiro no painel e vale para reservas feitas depois do cadastro, com a janela de atribuição de 7 dias da cláusula 3.4.

A.4. **Dados.** Os dados de cliente colhidos no canal white-label são do Parceiro, controlador, e a Movepark os trata como operadora para hospedar e operar o canal, na forma da cláusula 9 e da Política de Privacidade do Parceiro, que ele publica no próprio canal. [ADVOGADO: validar o enquadramento da Movepark como operadora no white-label.]

A.5. **Vigência.** Este Anexo vigora enquanto o contrato principal vigorar e pode ser encerrado por qualquer parte com aviso de 30 dias. Ao encerrar, a Movepark desativa o canal e o Parceiro deixa de usar a tecnologia, mantendo o direito de exportar os dados dele.

A.6. **Aceite.** Aceito no painel na mesma forma da cláusula 16, com registro próprio de versão, hash, data, IP e usuário.
