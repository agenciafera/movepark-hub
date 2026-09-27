# Respostas sugeridas para os 22 pontos [DECISÃO] (27/09/2026)

Cada ponto traz a resposta recomendada, o motivo (medido no produto) e o efeito no texto ou no
código. Marque "confirmo" ou troque; o que for confirmado entra nas minutas e vira tarefa de produto
quando houver código envolvido. Nada aqui muda os documentos vigentes.

## Termos de Uso v3

| # | Cláusula | Resposta sugerida | Por quê | Efeito |
|---|---|---|---|---|
| 1 | 5.3 CET e taxa do parcelamento | **Mostrar taxa de 2,99% a.m., valor total do acréscimo e CET no checkout antes de publicar os Termos.** | O CDC art. 52 exige informar taxa e total; hoje a tela diz só "com juros, total R$ X". Publicar o texto sem a tela seria promessa falsa. | Tarefa de código pequena em `Step4Payment.tsx` (a política já está em `card_installment_policy`); o texto fica como está. |
| 2 | 6.3 Alteração de data em reserva paga | **Trocar "pode exigir cancelar e refazer" por "recalcula o preço e cobra ou devolve a diferença".** | A Edge `change-booking-dates-paid` já faz isso (delta por PIX ou estorno parcial); o texto da minuta ficou atrás do produto. | Só texto. |
| 3 | 7.5 Prazo de reembolso | **Um prazo só: PIX em até 1 dia útil; cartão enviado ao emissor em até 2 dias úteis e visível em até duas faturas.** | É o que o e-mail e, desde 27/09, a página `/cancelamento` e o diálogo dizem. | Só texto (copy já alinhada em `96b355c6`). |
| 4 | 9.1 Cupom com limite de usos em cancelamento | **Manter: cancelar não devolve o uso do cupom.** | É o comportamento do código (`times_used` não decrementa) e evita farm de cupom por reserva e cancelamento. | Só texto. |
| 5 | 9.2 e 9.4 Carteira | **9.2: dizer que o saldo acumula e que o abate no checkout "será liberado", e que enquanto não existir os créditos não expiram. 9.4: retirar da v3 (não há reserva paga com saldo).** | Hoje não existe débito nem reversão; deixar expirar em 90 dias um crédito que não dá para usar é a única parte que engana. | Texto + produto: pausar a expiração (créditos existentes sem `expires_at` até o débito nascer). |
| 6 | 10.2 Crédito pelo transtorno na garantia de vaga | **Confirmar a retirada. Garantia = realocação com a diferença por nossa conta, ou 100% de volta.** | Não existe lançamento na carteira no fechamento do claim; a copy já foi corrigida em `96b355c6`. | Só texto. |
| 7 | 11.2 Prazo máximo de primeira resposta | **1 dia útil.** | Chamado abre por e-mail e WhatsApp com equipe pequena; 1 dia útil é cumprível e é o que o Decreto do SAC pede que se declare. | Só texto. |

## Política de Privacidade v3

| # | Cláusula | Resposta sugerida | Por quê | Efeito |
|---|---|---|---|---|
| 8 | 1.2 Encarregado (DPO) e caixa | **Nomear a função "Encarregado de Dados da Movepark" (sem nome de pessoa) e criar `privacidade@movepark.co` como alias de `contato@movepark.co`.** | A LGPD art. 41 exige identidade e contato públicos; função em vez de nome evita republicar a cada troca de pessoa. | Você cria o alias no provedor de e-mail; texto pronto. |
| 9 | 8.1 e 8.2 Cookies de medição | **Opção (a): legítimo interesse com opt-out ("Não medir minha navegação" no rodapé, que grava a recusa e impede a carga de GTM e Clarity).** Fica marcado [ADVOGADO]. | Não há publicidade nem remarketing, o Clarity mascara campos digitados, e banner de consentimento em site mobile-first derruba conversão. O guia de cookies da ANPD aceita legítimo interesse para medição com opt-out efetivo, mas é ponto de validação jurídica. | Produto: link de opt-out no rodapé e gate de carga do GTM e Clarity (código pequeno). |
| 10 | 8.1 Tag de anúncio no GTM | **Você confirma no Tag Manager (container GTM-KHBBZT9) que não há tag de Google Ads, Meta Pixel ou similar. Se houver, a resposta 9 vira (b) consentimento.** | Não tenho acesso ao Tag Manager para conferir. | Depende da sua conferência. |
| 11 | 6 Retenção de conversas e do Clarity | **Conversas de atendimento e assistente: 2 anos. Clarity: 30 dias (padrão), confirmado no painel.** | Dois anos cobre disputa de consumo (prazo de 5 anos vale para a reserva, não para a conversa); 30 dias é o padrão do Clarity. | Texto + confirmar o prazo no painel do Clarity. |

## Contrato do Parceiro v2

| # | Cláusula | Resposta sugerida | Por quê | Efeito |
|---|---|---|---|---|
| 12 | 2.3 Quem muda a modalidade | **Só a Movepark, a pedido do Parceiro.** | O trigger `location_checkout_mode_guard` já exige hub_admin e o pré-voo; abrir ao Parceiro criaria unidade hub sem contrato ou recebedor. | Só texto. |
| 13 | 3.2 Aviso de mudança de comissão | **15 dias, e a reserva feita antes da mudança mantém o pacote congelado nela.** | O pacote de comissão já é congelado na reserva (E0.3.12); 15 dias é o mesmo prazo da cláusula 15.1. | Só texto. |
| 14 | 3.4 White-label: remuneração e janela | **"Sem remuneração nesta fase, salvo regra de origem cadastrada e visível no painel"; janela de atribuição de 7 dias mantida.** | Só a Virapark usa; a regra da Fera está desligada desde 23/09; 7 dias é o valor de `commission_attribution_window_days`. | Só texto. |
| 15 | 4.1 Marco do prazo de 30 dias | **Da confirmação do pagamento.** | É como `payout_release_days` conta (`paid_at` + 30); contar da saída do veículo exigiria outro cálculo e atrasaria PIX pago com antecedência. | Só texto. |
| 16 | 5.1 Reembolso fora do prazo por liberalidade | **Só a Movepark arca. Falha do Parceiro (cláusula 6) é do Parceiro.** | Liberalidade é decisão comercial nossa; o razão de dívida só deve carregar o que o Parceiro causou. | Só texto. |
| 17 | 7.5 Multa por reserva não honrada | **50% do valor da reserva, além da diferença de realocação ou do reembolso, lançada como dívida abatida nas vendas seguintes.** Fica [ADVOGADO]. | Precisa doer mais que a comissão de 20% para não valer a pena aceitar reserva sem vaga; o abatimento já existe (`payout_debt_settlement` tipo `adjustment`). | Texto + lançamento manual pelo Manager quando ocorrer. |
| 18 | 7.7 Seguro garagista | **Facultativo nesta fase, com declaração de que o Parceiro responde pelo veículo (Súmula 130 STJ). Obrigatório fica para a próxima versão, quando houver escala.** | Exigir apólice hoje trava a entrada de parceiros pequenos; a responsabilidade legal já existe sem o seguro. | Só texto. |
| 19 | 10.1 Uso da marca após o fim | **90 dias.** | Tempo para tirar do ar páginas, posts e materiais já publicados sem correr. | Só texto. |
| 20 | 11.1 White-label no contrato | **Anexo próprio (Anexo A), assinado só por quem usa.** | Um parceiro usa hoje e as condições (preço, sync, agente de WhatsApp) mudam rápido; anexo evita nova versão do contrato inteiro. | Texto: mover 11.1 para o Anexo A. |
| 21 | 15.1 Aviso de nova versão | **15 dias; cláusulas econômicas (3, 4, 5) só com aceite expresso.** | Igual ao 3.2; aceite tácito em comissão ou taxa não sobrevive a disputa. | Só texto. |
| 22 | 16.1 e 16.3 Aceite e gate | **Implementar versão + hash SHA-256 + data + IP + usuário + PDF no aceite (código). Gate: unidade em modo Hub não lista sem aceite (já vale desde 27/09, pelo pré-voo); unidade externa continua exibida. Transição: 30 dias para as 10 empresas aceitarem a v2 pelo link de acesso ao Recebimento.** | O gate do pré-voo já inclui `contract`; as 10 sem aceite são externas e não passam pelo checkout da Movepark, então bloquear a exibição delas tiraria do ar o que hoje é vitrine. | Código no `operator_accept_contract` e `company` (hash, ip, user, pdf) + campanha de aceite pelo link. |

## O que vira tarefa de produto se você confirmar

1. CET e taxa no checkout (item 1).
2. Pausar a expiração da carteira até existir o débito (item 5).
3. Opt-out de medição no rodapé com gate de GTM e Clarity (item 9).
4. Aceite do contrato com hash, IP, usuário e PDF (item 22).
5. Alias `privacidade@movepark.co` (item 8, é seu) e conferência do GTM e do Clarity (itens 10 e 11, são seus).
