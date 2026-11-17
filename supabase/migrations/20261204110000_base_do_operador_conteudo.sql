-- Base do operador: primeira versão do conteúdo da Mia para operadores.
-- Ver docs/specs/assistente-do-operador.md. Escrito a partir das specs (booking-modifications,
-- fares, tarifas-operacao, estorno-hibrido, conta-do-parceiro, antecipacao-do-parceiro), da FAQ
-- global e das regras das Edges. Daqui em diante a base é editada no Manager; esta migration só
-- semeia (on conflict atualiza o texto, para reaplicar sem duplicar).
--
-- Decisão do Kallef em 17/11/2026: cliente da Básica que quer mudar data é orientado a fazer
-- upgrade primeiro; alterar pelo painel sem cobrar é exceção do estacionamento.

insert into public.operator_playbook_article (slug, title, category, sort_order, body_md) values

('tarifas-basica-flex-superflex', 'As três tarifas: Básica, Flex e Superflex', 'Tarifas', 10, $md$
Toda reserva feita pela Movepark tem uma tarifa, escolhida pelo cliente no checkout. Ela define o que o cliente consegue fazer sozinho depois.

| Tarifa | Preço | Cancela com estorno integral | O que inclui |
|---|---|---|---|
| Básica | grátis | até 24 horas antes da entrada | vaga garantida, confirmação por e-mail |
| Flex | R$ 12,90 | até 24 horas antes da entrada | + trocar placa, alterar datas, avisos por WhatsApp |
| Superflex | R$ 24,90 | até 1 minuto antes da entrada | + proteção de voo (atraso ou cancelamento) |

- A regra que vale é a da reserva, gravada na compra. Se o catálogo mudar depois, a reserva não muda.
- O valor da tarifa é da Movepark: não entra no repasse do estacionamento.
- Para saber a tarifa e os prazos de uma reserva específica, consulte a situação da reserva.
$md$),

('cancelamento-prazo-do-cliente', 'Até quando o cliente cancela sozinho', 'Cancelamento', 20, $md$
O cliente cancela em movepark.co, em "Minhas reservas": abre a reserva e toca em "Cancelar reserva".

- Básica e Flex: até 24 horas antes da entrada, com estorno integral.
- Superflex: até 1 minuto antes da entrada, com estorno integral.
- Reserva que ainda não foi paga pode ser cancelada a qualquer hora, sem estorno (não houve cobrança).

Fora do prazo, o botão some para o cliente e o site diz que a janela da tarifa fechou. A reserva continua valendo: a vaga segue garantida para ele.

Mensagem para o cliente, dentro do prazo:
> Você mesmo cancela em movepark.co, em Minhas reservas. Abra a reserva e toque em Cancelar reserva. O valor volta inteiro, na mesma forma de pagamento.
$md$),

('cancelamento-fora-do-prazo', 'Cliente quer cancelar fora do prazo da tarifa', 'Cancelamento', 30, $md$
Fora do prazo da tarifa o cliente não consegue cancelar sozinho. O estacionamento pode cancelar com estorno integral como exceção, enquanto o veículo não entrou.

Como decidir:
- A vaga já está reservada para o cliente pelo período inteiro. Se não houver motivo forte, a resposta padrão é manter a reserva.
- Se o estacionamento quiser conceder a exceção, o estorno sai da parte do estacionamento nessa venda (veja "De onde sai o dinheiro do estorno").
- Para a Superflex o prazo já vai até 1 minuto antes da entrada; fora disso é exceção do mesmo jeito.

Como fazer: a Mia propõe o cancelamento com o valor do estorno e você confirma no cartão. Também dá para cancelar pela tela da reserva no painel.

Depois que o veículo entrou (check-in), ninguém cancela pelo sistema.

Mensagem para o cliente, mantendo a reserva:
> O prazo para cancelar com estorno na sua tarifa terminou em [data]. A sua vaga segue garantida para o período inteiro da reserva.
$md$),

('estorno-prazo-pix-cartao', 'Quando o dinheiro do estorno cai para o cliente', 'Estorno', 40, $md$
O estorno volta sempre na mesma forma de pagamento da reserva.

- PIX: costuma aparecer na conta do cliente em minutos, no máximo em um dia útil.
- Cartão de crédito: aparece na fatura em até duas faturas, conforme o banco do cliente. Em compra parcelada, o banco estorna as parcelas.
- Quando o banco recusa o estorno automático, a equipe Movepark faz o estorno em até 2 dias úteis e avisa o cliente.

O cliente recebe e-mail quando a reserva é cancelada, com o valor e o prazo do estorno.

Mensagem para o cliente:
> O estorno de [valor] já foi pedido. No PIX ele costuma cair em minutos, no máximo em um dia útil. No cartão, aparece na fatura em até duas faturas, conforme o seu banco.
$md$),

('estorno-de-onde-sai', 'De onde sai o dinheiro do estorno', 'Estorno', 50, $md$
Quando uma reserva paga é cancelada com estorno, o cliente recebe o valor inteiro. A parte que o estacionamento recebeu por essa venda volta junto:

- se o estacionamento tem saldo disponível na conta de recebimento, ela é debitada desse saldo;
- se não tem, a Movepark devolve ao cliente na hora e o valor vira um abatimento nas próximas vendas do estacionamento. Ele aparece em Financeiro, na Conta, como valor devido à Movepark.

A comissão da Movepark e o valor da tarifa também voltam ao cliente; não são cobrados do estacionamento.

Por isso, cancelar com estorno fora do prazo da tarifa é uma exceção que o estacionamento paga. Vale a pena quando o motivo justifica.
$md$),

('voltar-antes-diarias-nao-usadas', 'Cliente vai voltar antes e quer as diárias de volta', 'Alterar datas', 60, $md$
Depende de a reserva já ter começado.

Antes da data e hora de entrada:
- Flex ou Superflex: o próprio cliente altera as datas em movepark.co, em "Minhas reservas", tocando em "Alterar datas". Se o novo período ficar mais barato, a diferença volta na mesma forma de pagamento.
- Básica: a tarifa não inclui alterar datas. Oriente o cliente a fazer o upgrade para a Flex e depois alterar as datas (veja "Cliente da Básica quer mudar a data"). Alterar pelo painel sem cobrar a Flex é exceção do estacionamento.
- Atenção: a nova data é cotada ao preço de hoje. Se o preço subiu desde a compra, um período menor pode não gerar devolução, e a cotação mostra isso antes.

Depois da data e hora de entrada:
- Não há devolução das diárias não usadas, mesmo que o cliente retire o carro antes, porque a vaga ficou reservada para ele pelo período inteiro. Essa regra está na FAQ do site.
- Exceção só com a equipe Movepark.

Mensagem para o cliente, depois da entrada:
> Como a reserva já começou, as diárias não usadas não são devolvidas: a vaga ficou garantida para você pelo período inteiro.
$md$),

('alterar-datas-como-funciona', 'Alterar datas: como funciona', 'Alterar datas', 70, $md$
Alterar datas recalcula a reserva ao preço de hoje, nunca ao preço da compra.

- Reserva ainda não paga: o total é recalculado e o cliente paga o valor novo.
- Reserva paga, novo total mais barato: as datas mudam na hora e a diferença volta ao cliente na mesma forma de pagamento.
- Reserva paga, novo total mais caro: o cliente recebe um PIX com a diferença. A vaga nas datas novas fica segurada e as datas só mudam quando o PIX for pago. Se o PIX vencer, a reserva continua nas datas antigas.
- Sem diferença: muda na hora.

O que acontece junto:
- o cupom usado na compra deixa de valer;
- a tarifa continua a mesma, e o prazo de cancelamento passa a contar da nova entrada;
- tudo fica no histórico da reserva.

Só dá para alterar antes da data e hora de entrada, com vaga disponível nas novas datas. A Mia cota antes de propor.

Quem pode: o cliente na Flex e na Superflex; o estacionamento em qualquer tarifa, pela Mia.
$md$),

('basica-quer-mudar-data', 'Cliente da Básica quer mudar a data', 'Alterar datas', 80, $md$
A Básica não inclui alterar datas. Orientação padrão, nesta ordem:

1. Ofereça o upgrade para a Flex. O cliente paga só a diferença (hoje R$ 12,90 saindo da Básica) em movepark.co, em "Minhas reservas", tocando em "Fazer upgrade de Tarifa".
2. Com a Flex, ele mesmo toca em "Alterar datas". Se ficar mais barato, a diferença volta; se ficar mais caro, ele paga a diferença por PIX.

Se o estacionamento quiser fazer como cortesia, sem o cliente pagar a Flex, a Mia propõe a alteração e você confirma. É exceção: tratar como padrão ensina o cliente a não escolher a tarifa que inclui a mudança.

Mensagem para o cliente:
> A sua tarifa (Básica) não inclui alterar datas. Você pode fazer o upgrade para a Flex em movepark.co, em Minhas reservas, pagando só a diferença. Depois disso, a opção Alterar datas aparece na sua reserva. Se o novo período ficar mais barato, a diferença volta para você.
$md$),

('upgrade-de-tarifa', 'Upgrade de tarifa', 'Tarifas', 90, $md$
O cliente pode subir a tarifa da reserva depois da compra.

- Onde: movepark.co, em "Minhas reservas", abre a reserva e toca em "Fazer upgrade de Tarifa".
- Quanto: só a diferença entre a tarifa nova e a atual, por PIX.
- Quando vale: assim que o PIX é aprovado.
- Até quando: antes da data de entrada, com a reserva aguardando pagamento ou confirmada.
- Não existe downgrade.
- O estacionamento não faz o upgrade pelo cliente: o pagamento é dele, na conta dele.
- O valor do upgrade é da Movepark e não entra no repasse.

Use quando o cliente quer algo que a tarifa atual não cobre: alterar datas, trocar placa (Flex) ou proteção de voo (Superflex).
$md$),

('trocar-placa', 'Trocar placa ou veículo', 'Reserva', 100, $md$
- Flex e Superflex: o próprio cliente troca em "Minhas reservas", tocando em "Trocar veículo".
- Qualquer tarifa: o estacionamento troca pelo painel ou pela Mia, informando o motivo. O motivo fica no histórico e explica por que o voucher mudou.
- Só antes de o veículo entrar.
- O voucher é refeito com a placa nova e o cliente recebe o novo.

Placa aceita: formato Mercosul (ABC1D23) ou antigo (ABC1234).
$md$),

('check-in-e-check-out', 'Check-in e check-out', 'Operação', 110, $md$
Check-in (entrada):
- Escaneie o QR code do voucher ou abra a reserva no painel e registre a entrada.
- Só funciona em reserva confirmada (paga). Reserva aguardando pagamento, cancelada ou expirada não entra.
- O cliente não precisa imprimir o voucher: o QR no celular ou o código da reserva (MP-XXXXXX) bastam.

Check-out (saída):
- Abra a reserva e registre a saída.
- Se a reserva tem proteção de voo acionada, a tela pede a hora real de saída e o que foi cobrado no balcão pelo excedente. Faça por ela.

Pela Mia: ela propõe o check-in ou o check-out e você confirma no cartão.
$md$),

('tolerancia-na-saida', 'Tolerância na saída e atraso do cliente', 'Operação', 120, $md$
- A tolerância de saída padrão é de 60 minutos: sair até uma hora depois do horário da reserva não conta como diária nova. O valor de cada unidade está no cadastro dela.
- O sistema não cobra excedente sozinho.
- Se o cliente avisa antes que vai precisar de mais tempo, o caminho é alterar as datas (Flex e Superflex fazem sozinhos; na Básica, upgrade primeiro).
- Voo atrasado ou cancelado na Superflex tem regra própria: veja "Proteção de voo".
$md$),

('protecao-de-voo', 'Proteção de voo (Superflex)', 'Tarifas', 130, $md$
Só na Superflex. Cobre voo atrasado ou cancelado na volta.

- O cliente aciona na própria reserva, informando o número do voo e a nova previsão de saída.
- Até 24 horas a mais ficam por conta da Movepark, que paga ao estacionamento por esse tempo. Uma vez por reserva, acionável até o horário de saída mais a tolerância.
- O que passar de 24 horas é excedente, cobrado no balcão pelo estacionamento, com a diária da unidade congelada no momento do acionamento. Esse valor é todo do estacionamento, sem comissão.
- O estacionamento recebe e-mail e vê o aviso na reserva.
- No check-out, registre pela tela da reserva a hora real de saída e o valor cobrado no balcão (ou "não cobrado", com o motivo).

Não cobre cancelar a reserva antes de sair de casa: para isso vale o prazo de cancelamento da tarifa.
$md$),

('nao-compareceu', 'Cliente não compareceu', 'Operação', 140, $md$
- Reserva confirmada em que o cliente não aparece vira "não compareceu", automaticamente ou marcada pelo estacionamento.
- "Não compareceu" é final: depois disso não dá para cancelar nem estornar pelo sistema.
- Não há devolução automática.
- Se o cliente pedir o dinheiro de volta e o estacionamento quiser conceder, cancele com estorno antes de marcar "não compareceu". Depois, só a equipe Movepark.
$md$),

('reserva-aguardando-pagamento', 'Reserva aguardando pagamento', 'Pagamento', 150, $md$
- A reserva nasce "aguardando pagamento" e a vaga fica segurada por pouco tempo (o PIX vence em cerca de 30 minutos).
- Pagou: vira confirmada e o cliente recebe o voucher por e-mail.
- Não pagou no prazo: a reserva expira sozinha e a vaga volta para a venda. Não há nada a estornar.
- Expirada não faz check-in. O cliente precisa reservar de novo.
$md$),

('formas-de-pagamento', 'Formas de pagamento', 'Pagamento', 160, $md$
- PIX e cartão de crédito (Visa, Mastercard, Elo e Amex).
- O parcelamento disponível é o que aparece no checkout de cada reserva; não prometa número de parcelas.
- Dinheiro, tag de pedágio ou pagamento no balcão não são aceitos nas reservas da Movepark. A exceção é o excedente da proteção de voo, cobrado pelo estacionamento.
$md$),

('cobranca-em-dobro', 'Cliente diz que pagou duas vezes', 'Pagamento', 170, $md$
- Abra a reserva e veja os pagamentos: a Mia lista cada um, com valor, forma e situação.
- Se houver dois pagamentos aprovados para a mesma reserva, a equipe Movepark estorna a cópia. A reserva continua confirmada pelo pagamento que fica.
- O estacionamento não faz esse estorno pelo painel. Fale com a Movepark.

Mensagem para o cliente:
> Vimos o pagamento em dobro. A equipe da Movepark vai estornar a cobrança extra, e a sua reserva continua confirmada.
$md$),

('quando-o-estacionamento-recebe', 'Quando o estacionamento recebe o dinheiro', 'Financeiro', 180, $md$
- PIX: o valor do estacionamento fica disponível na conta de recebimento na hora do pagamento.
- Cartão: libera em 30 dias. Com a antecipação ligada, todas as parcelas liberam em 30 dias; sem ela, cada parcela libera 30 dias depois da anterior.
- Repasse para o banco: automático, uma vez por mês (dia 10, salvo combinado diferente), sem taxa.
- Repasse antes do dia: o Dono pode usar "Repassar agora" na Conta. Esse saque tem taxa.
- O extrato completo, venda a venda, fica em Financeiro, na Conta.
- O valor da tarifa (Flex e Superflex) e do upgrade é da Movepark e não entra no repasse.
$md$),

('papeis-e-permissoes', 'O que cada pessoa da equipe pode fazer', 'Painel', 190, $md$
Cada pessoa tem um papel no estacionamento:

- Dono: tudo, inclusive usuários, chaves, saque e recebimento.
- Gerente: operação, preços, cupons e financeiro (leitura e ajustes), sem gerir usuários nem sacar.
- Operação: reservas (ver, cancelar, alterar, check-in e check-out), ocupação e leitura das avaliações. Sem preços nem financeiro.
- Financeiro: financeiro e reservas só para leitura.

A Mia segue o papel de quem está usando: se o papel não permite uma ação, ela não propõe. Para mudar o papel de alguém, fale com o Dono.
$md$),

('reserva-white-label', 'Reserva feita no site do próprio estacionamento', 'Reserva', 200, $md$
Reservas feitas no site ou no WhatsApp do próprio estacionamento (white-label) aparecem em Reservas com etiqueta própria, mas seguem as regras que o estacionamento informou na reserva, não as tarifas da Movepark.

A Mia não consulta essas reservas. Para elas, siga o procedimento do sistema do estacionamento.
$md$),

('voucher', 'Voucher da reserva', 'Reserva', 210, $md$
- O cliente recebe o voucher por e-mail quando o pagamento é aprovado. Ele também fica em movepark.co, em "Minhas reservas".
- Não precisa imprimir: o QR code no celular ou o código da reserva (MP-XXXXXX) bastam na entrada.
- Trocou a placa: o voucher é refeito com a placa nova.
$md$),

('falar-com-a-movepark', 'Quando chamar a equipe Movepark', 'Painel', 220, $md$
Chame a equipe Movepark quando:
- o cliente pagou em dobro;
- o estorno não aparece depois do prazo;
- o cliente pede devolução depois que a reserva começou e o estacionamento quer conceder;
- a reserva não aparece no painel;
- a Mia não sabe responder.

Atendimento da Movepark: segunda a sexta, das 9h às 18h, pelo e-mail contato@movepark.co.
$md$),

('como-usar-a-mia', 'Como a Mia para operadores funciona', 'Painel', 230, $md$
- A Mia lê as reservas da sua empresa, a base de conhecimento e as regras da tarifa de cada reserva.
- Ela responde com o que fazer, uma mensagem pronta para o cliente e, quando cabe, uma proposta de ação.
- Toda ação (cancelar, alterar datas, trocar placa, check-in, check-out) aparece num cartão com o efeito em reais. Nada acontece até você tocar em Confirmar. A proposta vale 10 minutos.
- A Mia só propõe o que o seu papel permite.
- As conversas ficam registradas e a equipe Movepark pode ler, para melhorar a base. Perguntas que a Mia não souber viram pendência para a equipe responder.
$md$),

('cliente-quer-mudar-de-unidade', 'Cliente quer trocar de unidade ou de tipo de vaga', 'Reserva', 240, $md$
Trocar de unidade ou de tipo de vaga (coberta para descoberta, por exemplo) não é uma alteração da reserva: o sistema altera só datas e veículo.

O caminho é cancelar e reservar de novo:
- dentro do prazo da tarifa, o próprio cliente cancela com estorno integral e faz uma reserva nova;
- fora do prazo, cancelar com estorno é exceção do estacionamento (veja "Cliente quer cancelar fora do prazo da tarifa").
$md$)

on conflict (slug) do update
  set title = excluded.title,
      category = excluded.category,
      sort_order = excluded.sort_order,
      body_md = excluded.body_md,
      is_published = true,
      deleted_at = null;
