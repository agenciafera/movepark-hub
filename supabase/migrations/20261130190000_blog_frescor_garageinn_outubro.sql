-- Rotina de frescor de 22/10/2026: os posts de Viracopos na tabela nova da Garageinn.
--
-- A Garageinn virou a tarifa única online de R$ 45,90 para R$ 56,90 por dia (2 a 30 diárias) em
-- 20/10/2026; a diária avulsa segue R$ 59,99, só no balcão. As FAQs foram trocadas em
-- 20261130180000. Aqui vão os posts (docs/specs/rotina-mensal-frescor.md).
--
-- Regra desta rodada, combinada no pedido: troca o que fala do preço como atual (tabela, frase no
-- presente, inclusive as carimbadas "em setembro/outubro de 2026, a diária é") e regrava a data;
-- frase no passado ("cobrava", "custava", "saía", "ia de") fica com a data dela. O R$ 45,90 do post
-- de convênio que é "balcão típico de lote privado em Guarulhos" não é a Garageinn e fica.
--
-- Cifras da Garageinn pelo simulate_price de 20/10/2026: 1 diária R$ 59,99; de 2 em diante
-- R$ 56,90 por dia (R$ 113,80 em 2, R$ 170,70 em 3, R$ 398,30 em 7, R$ 853,50 em 15, R$ 1.707,00
-- em 30); balcão R$ 59,99 por dia. Diferença e percentual calculados sobre essa saída: contra o
-- balcão 5,15% (R$ 21,63 na semana); contra o Virapark R$ 224,00 na semana e R$ 960,00 no mês;
-- contra o edifício garagem (R$ 83,00) R$ 182,70 na semana e 31,4% na diária.
--
-- O que mudou de sentido, além do número:
--   - garageinn-viracopos dizia "degrau único, na sétima diária". O degrau sempre foi na segunda;
--     a tabela ganhou a linha de 2 diárias para mostrar isso.
--   - Reservar antes deixou de render muito na Garageinn (23,5% para 5,2% contra o balcão). O post
--     de melhores dizia "o Garageinn baixa bastante" e passou a dizer que baixa pouco.
--   - No mês, escolher a Garageinn em vez do Virapark passou de "quase duas vezes" para "mais que
--     o dobro".
--
-- Cada corpo é trocado por replace() da linha inteira. Idempotente: na segunda passada o trecho
-- antigo não existe e o replace não faz nada. A trava do fim aborta se algum trecho novo não
-- estiver no corpo de um post que existe (o texto mudou desde a leitura de 22/10).

-- como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024: 16 trecho(s)
update public.blog_post
set body_md = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(body_md,
    $t$e cobra **R$ 59,99** na diária avulsa, **R$ 321,30** por 7 diárias e **R$ 1.377,00** por 30 na vaga avulsa, em setembro de 2026.$t$,
    $t$e cobra **R$ 59,99** na diária avulsa, **R$ 398,30** por 7 diárias e **R$ 1.707,00** por 30 na vaga avulsa, em outubro de 2026.$t$),
    $t$| 2 diárias | R$ 119,98 | R$ 91,80 | R$ 28,18 | 23,5% |$t$,
    $t$| 2 diárias | R$ 119,98 | R$ 113,80 | R$ 6,18 | 5,2% |$t$),
    $t$| 7 diárias | R$ 419,93 | R$ 321,30 | R$ 98,63 | 23,5% |$t$,
    $t$| 7 diárias | R$ 419,93 | R$ 398,30 | R$ 21,63 | 5,2% |$t$),
    $t$| 15 diárias | R$ 899,85 | R$ 688,50 | R$ 211,35 | 23,5% |$t$,
    $t$| 15 diárias | R$ 899,85 | R$ 853,50 | R$ 46,35 | 5,2% |$t$),
    $t$| 30 diárias | R$ 1.799,70 | R$ 1.377,00 | R$ 422,70 | 23,5% |$t$,
    $t$| 30 diárias | R$ 1.799,70 | R$ 1.707,00 | R$ 92,70 | 5,2% |$t$),
    $t$A diferença entre os dois passa de R$ 600,00 numa estadia de um mês.$t$,
    $t$A diferença entre os dois passa de R$ 900,00 numa estadia de um mês.$t$),
    $t$| 2 diárias | R$ 57,80 | R$ 91,80 | R$ 34,00 |$t$,
    $t$| 2 diárias | R$ 57,80 | R$ 113,80 | R$ 56,00 |$t$),
    $t$| 3 diárias | R$ 86,70 | R$ 137,70 | R$ 51,00 |$t$,
    $t$| 3 diárias | R$ 86,70 | R$ 170,70 | R$ 84,00 |$t$),
    $t$| 7 diárias | R$ 174,30 | R$ 321,30 | R$ 147,00 |$t$,
    $t$| 7 diárias | R$ 174,30 | R$ 398,30 | R$ 224,00 |$t$),
    $t$| 15 diárias | R$ 373,50 | R$ 688,50 | R$ 315,00 |$t$,
    $t$| 15 diárias | R$ 373,50 | R$ 853,50 | R$ 480,00 |$t$),
    $t$| 30 diárias | R$ 747,00 | R$ 1.377,00 | R$ 630,00 |$t$,
    $t$| 30 diárias | R$ 747,00 | R$ 1.707,00 | R$ 960,00 |$t$),
    $t$Os valores são do motor de reservas em setembro de 2026. Repare, por exemplo, nos R$ 630,00 de diferença em 30 diárias. Eles chegam perto do total de um mês inteiro no pátio mais barato, que é R$ 747,00. Em outras palavras, quem fica um mês fora e escolhe pela distância paga quase duas vezes.$t$,
    $t$Os valores são do motor de reservas: Virapark em setembro de 2026, Garageinn em 20 de outubro de 2026. Repare, por exemplo, nos R$ 960,00 de diferença em 30 diárias. Eles passam do total de um mês inteiro no pátio mais barato, que é R$ 747,00. Em outras palavras, quem fica um mês fora e escolhe pela distância paga mais que o dobro.$t$),
    $t$- Garageinn: R$ 45,90 por dia, da segunda diária em diante.$t$,
    $t$- Garageinn: R$ 56,90 por dia, da segunda diária em diante.$t$),
    $t$A diferença é de 2,7 quilômetros, e ela devolve R$ 147,00 na semana.$t$,
    $t$A diferença é de 2,7 quilômetros, e ela devolve R$ 224,00 na semana.$t$),
    $t$No Garageinn são R$ 45,90, da segunda diária em diante.$t$,
    $t$No Garageinn são R$ 56,90, da segunda diária em diante.$t$),
    $t$Essa distância separa R$ 174,30 de R$ 321,30 na semana de setembro de 2026.$t$,
    $t$Essa distância separa R$ 174,30 no Virapark (setembro de 2026) de R$ 398,30 no Garageinn (outubro de 2026), na semana.$t$)
where slug = 'como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024';

-- estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica: 17 trecho(s)
update public.blog_post
set body_md = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(body_md,
    $t$e cobra **R$ 59,99** na diária avulsa, **R$ 321,30** por 7 diárias e **R$ 1.377,00** por 30 na vaga avulsa, em setembro de 2026.$t$,
    $t$e cobra **R$ 59,99** na diária avulsa, **R$ 398,30** por 7 diárias e **R$ 1.707,00** por 30 na vaga avulsa, em outubro de 2026.$t$),
    $t$| Garageinn (parceiro) | R$ 59,99 avulsa | R$ 321,30 (R$ 45,90/dia) | 1,0 km, van 3 min | ✅ Sim | Motor de reservas, 9/2026 |$t$,
    $t$| Garageinn (parceiro) | R$ 59,99 avulsa | R$ 398,30 (R$ 56,90/dia) | 1,0 km, van 3 min | ✅ Sim | Motor de reservas, 10/2026 |$t$),
    $t$| 2 diárias ou mais | R$ 45,90 | R$ 321,30 na semana |$t$,
    $t$| 2 diárias ou mais | R$ 56,90 | R$ 398,30 na semana |$t$),
    $t$| 30 diárias | R$ 45,90 | R$ 1.377,00 |$t$,
    $t$| 30 diárias | R$ 56,90 | R$ 1.707,00 |$t$),
    $t$Na semana, são R$ 321,30 contra R$ 581,00 do oficial coberto, a 3 minutos do terminal.$t$,
    $t$Na semana, são R$ 398,30 contra R$ 581,00 do oficial coberto, a 3 minutos do terminal.$t$),
    $t$Veja o que cada empresa divulgava em setembro de 2026, numa estadia de 7 diárias.$t$,
    $t$Veja o que cada empresa divulgava em setembro de 2026 (a Garageinn, em 20 de outubro), numa estadia de 7 diárias.$t$),
    $t$| Garageinn | R$ 419,93 | R$ 321,30 | R$ 98,63 |$t$,
    $t$| Garageinn | R$ 419,93 | R$ 398,30 | R$ 21,63 |$t$),
    $t$Já o Garageinn cobra R$ 1.799,70 contra R$ 1.377,00,$t$,
    $t$Já o Garageinn cobra R$ 1.799,70 contra R$ 1.707,00,$t$),
    $t$| 7 dias | R$ 93,17 | R$ 174,30 | R$ 217,00 | R$ 321,30 | R$ 581,00 |$t$,
    $t$| 7 dias | R$ 93,17 | R$ 174,30 | R$ 217,00 | R$ 398,30 | R$ 581,00 |$t$),
    $t$| 15 dias | R$ 152,70 | R$ 373,50 | R$ 465,00 | R$ 688,50 | não publicado |$t$,
    $t$| 15 dias | R$ 152,70 | R$ 373,50 | R$ 465,00 | R$ 853,50 | não publicado |$t$),
    $t$| 30 dias | R$ 239,40 | R$ 747,00 | R$ 930,00 | R$ 1.377,00 | não publicado |$t$,
    $t$| 30 dias | R$ 239,40 | R$ 747,00 | R$ 930,00 | R$ 1.707,00 | não publicado |$t$),
    $t$Já Virapark e Garageinn saem do motor de reservas em setembro de 2026.$t$,
    $t$O Virapark sai do motor de reservas em setembro de 2026, e o Garageinn em 20 de outubro de 2026.$t$),
    $t$O Garageinn cobra R$ 45,90 a 1,0 quilômetro,$t$,
    $t$O Garageinn cobra R$ 56,90 a 1,0 quilômetro,$t$),
    $t$- Ficar a 3 minutos do embarque pagando menos que o oficial: Garageinn, R$ 45,90 por dia a partir de 2 diárias.$t$,
    $t$- Ficar a 3 minutos do embarque pagando menos que o oficial: Garageinn, R$ 56,90 por dia a partir de 2 diárias.$t$),
    $t$Já o Garageinn cobra R$ 59,99 na primeira e R$ 45,90 a partir da segunda.$t$,
    $t$Já o Garageinn, em outubro de 2026, cobra R$ 59,99 na primeira e R$ 56,90 a partir da segunda.$t$),
    $t$R$ 217,00 no bolsão F, R$ 321,30 no Garageinn e R$ 581,00 no edifício garagem.$t$,
    $t$R$ 217,00 no bolsão F, R$ 398,30 no Garageinn (valor de outubro) e R$ 581,00 no edifício garagem.$t$),
    $t$Em setembro de 2026, a diária é R$ 59,99, caindo para R$ 45,90 a partir de 2 diárias.$t$,
    $t$Em outubro de 2026, a diária é R$ 59,99, caindo para R$ 56,90 a partir de 2 diárias.$t$)
where slug = 'estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica';

-- onde-deixar-o-carro-estacionado-em-viracopos: 5 trecho(s)
update public.blog_post
set body_md = replace(replace(replace(replace(replace(body_md,
    $t$e cobra **R$ 59,99** na diária avulsa, **R$ 321,30** por 7 diárias e **R$ 1.377,00** por 30 na vaga avulsa, em setembro de 2026.$t$,
    $t$e cobra **R$ 59,99** na diária avulsa, **R$ 398,30** por 7 diárias e **R$ 1.707,00** por 30 na vaga avulsa, em outubro de 2026.$t$),
    $t$| 7 diárias | R$ 321,30 | R$ 174,30 | R$ 147,00 |$t$,
    $t$| 7 diárias | R$ 398,30 | R$ 174,30 | R$ 224,00 |$t$),
    $t$| 15 diárias | R$ 688,50 | R$ 373,50 | R$ 315,00 |$t$,
    $t$| 15 diárias | R$ 853,50 | R$ 373,50 | R$ 480,00 |$t$),
    $t$| 30 diárias | R$ 1.377,00 | R$ 747,00 | R$ 630,00 |$t$,
    $t$| 30 diárias | R$ 1.707,00 | R$ 747,00 | R$ 960,00 |$t$),
    $t$O Garageinn fica R$ 259,70 abaixo do edifício garagem numa semana,$t$,
    $t$O Garageinn fica R$ 182,70 abaixo do edifício garagem numa semana,$t$)
where slug = 'onde-deixar-o-carro-estacionado-em-viracopos';

-- quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024: 11 trecho(s)
update public.blog_post
set body_md = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(body_md,
    $t$e cobra **R$ 59,99** na diária avulsa, **R$ 321,30** por 7 diárias e **R$ 1.377,00** por 30 na vaga avulsa, em outubro de 2026.$t$,
    $t$e cobra **R$ 59,99** na diária avulsa, **R$ 398,30** por 7 diárias e **R$ 1.707,00** por 30 na vaga avulsa, em outubro de 2026.$t$),
    $t$A partir da segunda diária, o Garageinn cobra R$ 45,90 por dia na reserva online, conferido no motor de reservas em 1º de outubro de 2026.$t$,
    $t$A partir da segunda diária, o Garageinn cobra R$ 56,90 por dia na reserva online, conferido no motor de reservas em 20 de outubro de 2026.$t$),
    $t$o Garageinn entrega a proximidade do complexo por 44,7% menos que o edifício garagem.$t$,
    $t$o Garageinn entrega a proximidade do complexo por 31,4% menos que o edifício garagem.$t$),
    $t$Além disso, comparado à própria tabela de balcão, o Garageinn baixa bastante. A semana sai por R$ 321,30 na reserva online, contra R$ 419,93 para quem chega sem reservar, uma economia de 23,5%. Em duas diárias são R$ 91,80 em vez de R$ 119,98, e em três, R$ 137,70 em vez de R$ 179,97.$t$,
    $t$Comparado à própria tabela de balcão, o Garageinn baixa pouco. A semana sai por R$ 398,30 na reserva online, contra R$ 419,93 para quem chega sem reservar, uma economia de 5,2%. Em duas diárias são R$ 113,80 em vez de R$ 119,98, e em três, R$ 170,70 em vez de R$ 179,97.$t$),
    $t$Contra o Bandeira Park, a semana custa R$ 228,13 a mais$t$,
    $t$Contra o Bandeira Park, a semana custa R$ 305,13 a mais$t$),
    $t$Os valores dos parceiros são de 1º de outubro de 2026.$t$,
    $t$Os valores dos parceiros saem do motor de reservas: Virapark em 1º de outubro de 2026, Garageinn em 20 de outubro de 2026.$t$),
    $t$| Voo cedo ou chegada apertada | Garageinn | R$ 321,30 a semana |$t$,
    $t$| Voo cedo ou chegada apertada | Garageinn | R$ 398,30 a semana |$t$),
    $t$| Bagagem pesada ou criança pequena | Garageinn | R$ 45,90 por dia a partir de 2 diárias |$t$,
    $t$| Bagagem pesada ou criança pequena | Garageinn | R$ 56,90 por dia a partir de 2 diárias |$t$),
    $t$| Garageinn (parceiro) | 0,98 km | R$ 59,99 | R$ 321,30 | R$ 1.377,00 | Avulsa | Motor da Movepark, 01/10/2026 |$t$,
    $t$| Garageinn (parceiro) | 0,98 km | R$ 59,99 | R$ 398,30 | R$ 1.707,00 | Avulsa | Motor da Movepark, 20/10/2026 |$t$),
    $t$**Balcão contra reserva online.** Nos dois parceiros, chegar sem reservar custa bem mais. No Virapark, a semana vai de R$ 280,00 no balcão para R$ 174,30 na reserva online, uma queda de 37,8%. No Garageinn, de R$ 419,93 para R$ 321,30, ou 23,5%. É a maior economia isolada da praça, e ela não depende de trocar de pátio.$t$,
    $t$**Balcão contra reserva online.** Nos dois parceiros, chegar sem reservar custa mais. No Virapark, a semana vai de R$ 280,00 no balcão para R$ 174,30 na reserva online, uma queda de 37,8%, e você economiza sem trocar de pátio. No Garageinn a queda é menor: de R$ 419,93 para R$ 398,30, ou 5,2%.$t$),
    $t$Em outubro de 2026, a diária é R$ 59,99 e cai para R$ 45,90 a partir da segunda,$t$,
    $t$Em outubro de 2026, a diária é R$ 59,99 e cai para R$ 56,90 a partir da segunda,$t$)
where slug = 'quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024';

-- convenio-de-estacionamento-no-aeroporto: 2 trecho(s)
update public.blog_post
set body_md = replace(replace(body_md,
    $t$Pelo motor de reservas, a mesma Garageinn fecha a semana em R$ 321,30, ou R$ 45,90 por dia. O convênio ganha da reserva online por R$ 51,30, na mesma unidade.$t$,
    $t$Pelo motor de reservas, a mesma Garageinn fecha a semana em R$ 398,30, ou R$ 56,90 por dia, em 20/10/2026. O convênio ganha da reserva online por R$ 128,30, na mesma unidade.$t$),
    $t$a condição da Azul na Garageinn leva a mesma semana de R$ 321,30 para R$ 270,00$t$,
    $t$a condição da Azul na Garageinn leva a mesma semana de R$ 398,30 para R$ 270,00$t$)
where slug = 'convenio-de-estacionamento-no-aeroporto';

-- estacionamento-coberto-em-viracopos: 1 trecho(s)
update public.blog_post
set body_md = replace(body_md,
    $t$| Garageinn, vaga avulsa | R$ 59,99 | R$ 321,30 | R$ 45,90 | Motor de reservas Movepark, 02/09/2026 |$t$,
    $t$| Garageinn, vaga avulsa | R$ 59,99 | R$ 398,30 | R$ 56,90 | Motor de reservas Movepark, 20/10/2026 |$t$)
where slug = 'estacionamento-coberto-em-viracopos';

-- estacionamento-de-longa-permanencia-em-viracopos: 2 trecho(s)
update public.blog_post
set body_md = replace(replace(body_md,
    $t$| [Garageinn](/estacionamentos/aeroporto-viracopos/garageinn), vaga avulsa | R$ 688,50 | R$ 1.377,00 | Motor de reservas Movepark, 02/09/2026 |$t$,
    $t$| [Garageinn](/estacionamentos/aeroporto-viracopos/garageinn), vaga avulsa | R$ 853,50 | R$ 1.707,00 | Motor de reservas Movepark, 20/10/2026 |$t$),
    $t$| Garageinn, vaga avulsa | R$ 45,90 | Motor de reservas Movepark, 02/09/2026 |$t$,
    $t$| Garageinn, vaga avulsa | R$ 56,90 | Motor de reservas Movepark, 20/10/2026 |$t$)
where slug = 'estacionamento-de-longa-permanencia-em-viracopos';

-- estacionamento-dentro-do-aeroporto-de-viracopos: 2 trecho(s)
update public.blog_post
set body_md = replace(replace(body_md,
    $t$| [Garageinn](/estacionamentos/aeroporto-viracopos/garageinn), vaga avulsa | R$ 321,30 | R$ 45,90 | 979 metros | Motor de reservas Movepark, 02/09/2026 |$t$,
    $t$| [Garageinn](/estacionamentos/aeroporto-viracopos/garageinn), vaga avulsa | R$ 398,30 | R$ 56,90 | 979 metros | Motor de reservas Movepark, 20/10/2026 |$t$),
    $t$sai R$ 259,70 mais barato sem tirar você do complexo do aeroporto.$t$,
    $t$sai R$ 182,70 mais barato sem tirar você do complexo do aeroporto.$t$)
where slug = 'estacionamento-dentro-do-aeroporto-de-viracopos';

-- garageinn-viracopos: 11 trecho(s)
update public.blog_post
set body_md = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(body_md,
    $t$Custa R$ 59,99 na diária avulsa e R$ 45,90 por dia a partir da sétima, segundo o motor de reservas em 8 de setembro de 2026.$t$,
    $t$Custa R$ 59,99 na diária avulsa e R$ 56,90 por dia a partir da segunda, segundo o motor de reservas em 20 de outubro de 2026.$t$),
    $t$## Quanto custa o Garageinn em setembro de 2026?$t$,
    $t$## Quanto custa o Garageinn em outubro de 2026?$t$),
    $t$Os valores saem do motor de reservas da Movepark, consultado em 8 de setembro de 2026.$t$,
    $t$Os valores saem do motor de reservas da Movepark, consultado em 20 de outubro de 2026.$t$),
    $t$| 7 diárias | R$ 45,90 | R$ 321,30 |$t$,
    $t$| 2 diárias | R$ 56,90 | R$ 113,80 |
| 7 diárias | R$ 56,90 | R$ 398,30 |$t$),
    $t$| 15 diárias | R$ 45,90 | R$ 688,50 |$t$,
    $t$| 15 diárias | R$ 56,90 | R$ 853,50 |$t$),
    $t$| 30 diárias | R$ 45,90 | R$ 1.377,00 |$t$,
    $t$| 30 diárias | R$ 56,90 | R$ 1.707,00 |$t$),
    $t$A primeira é que existe um degrau único, na sétima diária. A diária cai de R$ 59,99 para R$ 45,90, uma queda de 23,49%.$t$,
    $t$A primeira é que existe um degrau único, na segunda diária. A diária cai de R$ 59,99 para R$ 56,90, uma queda de 5,15%.$t$),
    $t$A semana aparece com valor de referência de R$ 419,93 e sai por R$ 321,30, ou seja, 23,49% abaixo. O mês tem referência de R$ 1.799,70 e sai por R$ 1.377,00.$t$,
    $t$A semana aparece com valor de referência de R$ 419,93 e sai por R$ 398,30, ou seja, 5,15% abaixo. O mês tem referência de R$ 1.799,70 e sai por R$ 1.707,00.$t$),
    $t$| Garageinn (parceiro) | R$ 59,99 | R$ 321,30 | 1,0 km, van 3 min | Motor de reservas, 8/9/2026 |$t$,
    $t$| Garageinn (parceiro) | R$ 59,99, R$ 56,90 de 2 a 6 dias | R$ 398,30 | 1,0 km, van 3 min | Motor de reservas, 20/10/2026 |$t$),
    $t$Sete diárias somam R$ 321,30, o que dá R$ 45,90 por dia, segundo o motor de reservas em 8 de setembro de 2026. Esse mesmo valor por dia se mantém até a trigésima diária, quando o total chega a R$ 1.377,00.$t$,
    $t$Sete diárias somam R$ 398,30, o que dá R$ 56,90 por dia, segundo o motor de reservas em 20 de outubro de 2026. Esse mesmo valor por dia se mantém até a trigésima diária, quando o total chega a R$ 1.707,00.$t$),
    $t$contra R$ 59,99 e R$ 321,30 do Garageinn, considerando as fontes de agosto e setembro de 2026.$t$,
    $t$contra R$ 59,99 e R$ 398,30 do Garageinn, considerando o bolsão em agosto e o Garageinn em 20 de outubro de 2026.$t$)
where slug = 'garageinn-viracopos';

-- preco-estacionamento-aeroporto-viracopos-saiba-tudo-aqui: 2 trecho(s)
update public.blog_post
set body_md = replace(replace(body_md,
    $t$No Garageinn: R$ 59,99, R$ 321,30, R$ 688,50 e R$ 1.377,00 nos mesmos períodos.$t$,
    $t$No Garageinn, em 20 de outubro de 2026: R$ 59,99, R$ 398,30, R$ 853,50 e R$ 1.707,00 nos mesmos períodos.$t$),
    $t$Em agosto de 2026, R$ 373,50 no Virapark, média de R$ 24,90 por dia, e R$ 688,50 no Garageinn, média de R$ 45,90. A diferença de R$ 315,00 no período equivale a mais de metade do total do mais barato.$t$,
    $t$R$ 373,50 no Virapark, média de R$ 24,90 por dia em agosto de 2026, e R$ 853,50 no Garageinn, média de R$ 56,90 em outubro de 2026. A diferença de R$ 480,00 no período passa do total do mais barato.$t$)
where slug = 'preco-estacionamento-aeroporto-viracopos-saiba-tudo-aqui';

-- quanto-custa-deixar-o-carro-no-aeroporto-viracopos-por-7-dias: 1 trecho(s)
update public.blog_post
set body_md = replace(body_md,
    $t$Em agosto de 2026, R$ 174,30 no Virapark, o que dá R$ 24,90 por dia, e R$ 321,30 no Garageinn, o que dá R$ 45,90 por dia.$t$,
    $t$R$ 174,30 no Virapark, o que dá R$ 24,90 por dia, em agosto de 2026, e R$ 398,30 no Garageinn, o que dá R$ 56,90 por dia, em 20 de outubro de 2026.$t$)
where slug = 'quanto-custa-deixar-o-carro-no-aeroporto-viracopos-por-7-dias';

-- Trava: cada trecho novo precisa estar no corpo. Post que não existe (stack de CI) não conta.
do $$
declare
  falta text;
begin
  select string_agg(distinct v.slug, ', ')
    into falta
  from (values
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$e cobra **R$ 59,99** na diária avulsa, **R$ 398,30** por 7 diárias e **R$ 1.707,00** por 30 na vaga avulsa, em outubro de 2026.$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$| 2 diárias | R$ 119,98 | R$ 113,80 | R$ 6,18 | 5,2% |$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$| 7 diárias | R$ 419,93 | R$ 398,30 | R$ 21,63 | 5,2% |$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$| 15 diárias | R$ 899,85 | R$ 853,50 | R$ 46,35 | 5,2% |$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$| 30 diárias | R$ 1.799,70 | R$ 1.707,00 | R$ 92,70 | 5,2% |$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$A diferença entre os dois passa de R$ 900,00 numa estadia de um mês.$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$| 2 diárias | R$ 57,80 | R$ 113,80 | R$ 56,00 |$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$| 3 diárias | R$ 86,70 | R$ 170,70 | R$ 84,00 |$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$| 7 diárias | R$ 174,30 | R$ 398,30 | R$ 224,00 |$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$| 15 diárias | R$ 373,50 | R$ 853,50 | R$ 480,00 |$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$| 30 diárias | R$ 747,00 | R$ 1.707,00 | R$ 960,00 |$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$Os valores são do motor de reservas: Virapark em setembro de 2026, Garageinn em 20 de outubro de 2026. Repare, por exemplo, nos R$ 960,00 de diferença em 30 diárias. Eles passam do total de um mês inteiro no pátio mais barato, que é R$ 747,00. Em outras palavras, quem fica um mês fora e escolhe pela distância paga mais que o dobro.$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$- Garageinn: R$ 56,90 por dia, da segunda diária em diante.$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$A diferença é de 2,7 quilômetros, e ela devolve R$ 224,00 na semana.$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$No Garageinn são R$ 56,90, da segunda diária em diante.$t$),
    ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024', $t$Essa distância separa R$ 174,30 no Virapark (setembro de 2026) de R$ 398,30 no Garageinn (outubro de 2026), na semana.$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$e cobra **R$ 59,99** na diária avulsa, **R$ 398,30** por 7 diárias e **R$ 1.707,00** por 30 na vaga avulsa, em outubro de 2026.$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$| Garageinn (parceiro) | R$ 59,99 avulsa | R$ 398,30 (R$ 56,90/dia) | 1,0 km, van 3 min | ✅ Sim | Motor de reservas, 10/2026 |$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$| 2 diárias ou mais | R$ 56,90 | R$ 398,30 na semana |$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$| 30 diárias | R$ 56,90 | R$ 1.707,00 |$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$Na semana, são R$ 398,30 contra R$ 581,00 do oficial coberto, a 3 minutos do terminal.$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$Veja o que cada empresa divulgava em setembro de 2026 (a Garageinn, em 20 de outubro), numa estadia de 7 diárias.$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$| Garageinn | R$ 419,93 | R$ 398,30 | R$ 21,63 |$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$Já o Garageinn cobra R$ 1.799,70 contra R$ 1.707,00,$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$| 7 dias | R$ 93,17 | R$ 174,30 | R$ 217,00 | R$ 398,30 | R$ 581,00 |$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$| 15 dias | R$ 152,70 | R$ 373,50 | R$ 465,00 | R$ 853,50 | não publicado |$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$| 30 dias | R$ 239,40 | R$ 747,00 | R$ 930,00 | R$ 1.707,00 | não publicado |$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$O Virapark sai do motor de reservas em setembro de 2026, e o Garageinn em 20 de outubro de 2026.$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$O Garageinn cobra R$ 56,90 a 1,0 quilômetro,$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$- Ficar a 3 minutos do embarque pagando menos que o oficial: Garageinn, R$ 56,90 por dia a partir de 2 diárias.$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$Já o Garageinn, em outubro de 2026, cobra R$ 59,99 na primeira e R$ 56,90 a partir da segunda.$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$R$ 217,00 no bolsão F, R$ 398,30 no Garageinn (valor de outubro) e R$ 581,00 no edifício garagem.$t$),
    ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica', $t$Em outubro de 2026, a diária é R$ 59,99, caindo para R$ 56,90 a partir de 2 diárias.$t$),
    ('onde-deixar-o-carro-estacionado-em-viracopos', $t$e cobra **R$ 59,99** na diária avulsa, **R$ 398,30** por 7 diárias e **R$ 1.707,00** por 30 na vaga avulsa, em outubro de 2026.$t$),
    ('onde-deixar-o-carro-estacionado-em-viracopos', $t$| 7 diárias | R$ 398,30 | R$ 174,30 | R$ 224,00 |$t$),
    ('onde-deixar-o-carro-estacionado-em-viracopos', $t$| 15 diárias | R$ 853,50 | R$ 373,50 | R$ 480,00 |$t$),
    ('onde-deixar-o-carro-estacionado-em-viracopos', $t$| 30 diárias | R$ 1.707,00 | R$ 747,00 | R$ 960,00 |$t$),
    ('onde-deixar-o-carro-estacionado-em-viracopos', $t$O Garageinn fica R$ 182,70 abaixo do edifício garagem numa semana,$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$e cobra **R$ 59,99** na diária avulsa, **R$ 398,30** por 7 diárias e **R$ 1.707,00** por 30 na vaga avulsa, em outubro de 2026.$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$A partir da segunda diária, o Garageinn cobra R$ 56,90 por dia na reserva online, conferido no motor de reservas em 20 de outubro de 2026.$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$o Garageinn entrega a proximidade do complexo por 31,4% menos que o edifício garagem.$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$Comparado à própria tabela de balcão, o Garageinn baixa pouco. A semana sai por R$ 398,30 na reserva online, contra R$ 419,93 para quem chega sem reservar, uma economia de 5,2%. Em duas diárias são R$ 113,80 em vez de R$ 119,98, e em três, R$ 170,70 em vez de R$ 179,97.$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$Contra o Bandeira Park, a semana custa R$ 305,13 a mais$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$Os valores dos parceiros saem do motor de reservas: Virapark em 1º de outubro de 2026, Garageinn em 20 de outubro de 2026.$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$| Voo cedo ou chegada apertada | Garageinn | R$ 398,30 a semana |$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$| Bagagem pesada ou criança pequena | Garageinn | R$ 56,90 por dia a partir de 2 diárias |$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$| Garageinn (parceiro) | 0,98 km | R$ 59,99 | R$ 398,30 | R$ 1.707,00 | Avulsa | Motor da Movepark, 20/10/2026 |$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$**Balcão contra reserva online.** Nos dois parceiros, chegar sem reservar custa mais. No Virapark, a semana vai de R$ 280,00 no balcão para R$ 174,30 na reserva online, uma queda de 37,8%, e você economiza sem trocar de pátio. No Garageinn a queda é menor: de R$ 419,93 para R$ 398,30, ou 5,2%.$t$),
    ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024', $t$Em outubro de 2026, a diária é R$ 59,99 e cai para R$ 56,90 a partir da segunda,$t$),
    ('convenio-de-estacionamento-no-aeroporto', $t$Pelo motor de reservas, a mesma Garageinn fecha a semana em R$ 398,30, ou R$ 56,90 por dia, em 20/10/2026. O convênio ganha da reserva online por R$ 128,30, na mesma unidade.$t$),
    ('convenio-de-estacionamento-no-aeroporto', $t$a condição da Azul na Garageinn leva a mesma semana de R$ 398,30 para R$ 270,00$t$),
    ('estacionamento-coberto-em-viracopos', $t$| Garageinn, vaga avulsa | R$ 59,99 | R$ 398,30 | R$ 56,90 | Motor de reservas Movepark, 20/10/2026 |$t$),
    ('estacionamento-de-longa-permanencia-em-viracopos', $t$| [Garageinn](/estacionamentos/aeroporto-viracopos/garageinn), vaga avulsa | R$ 853,50 | R$ 1.707,00 | Motor de reservas Movepark, 20/10/2026 |$t$),
    ('estacionamento-de-longa-permanencia-em-viracopos', $t$| Garageinn, vaga avulsa | R$ 56,90 | Motor de reservas Movepark, 20/10/2026 |$t$),
    ('estacionamento-dentro-do-aeroporto-de-viracopos', $t$| [Garageinn](/estacionamentos/aeroporto-viracopos/garageinn), vaga avulsa | R$ 398,30 | R$ 56,90 | 979 metros | Motor de reservas Movepark, 20/10/2026 |$t$),
    ('estacionamento-dentro-do-aeroporto-de-viracopos', $t$sai R$ 182,70 mais barato sem tirar você do complexo do aeroporto.$t$),
    ('garageinn-viracopos', $t$Custa R$ 59,99 na diária avulsa e R$ 56,90 por dia a partir da segunda, segundo o motor de reservas em 20 de outubro de 2026.$t$),
    ('garageinn-viracopos', $t$## Quanto custa o Garageinn em outubro de 2026?$t$),
    ('garageinn-viracopos', $t$Os valores saem do motor de reservas da Movepark, consultado em 20 de outubro de 2026.$t$),
    ('garageinn-viracopos', $t$| 2 diárias | R$ 56,90 | R$ 113,80 |
| 7 diárias | R$ 56,90 | R$ 398,30 |$t$),
    ('garageinn-viracopos', $t$| 15 diárias | R$ 56,90 | R$ 853,50 |$t$),
    ('garageinn-viracopos', $t$| 30 diárias | R$ 56,90 | R$ 1.707,00 |$t$),
    ('garageinn-viracopos', $t$A primeira é que existe um degrau único, na segunda diária. A diária cai de R$ 59,99 para R$ 56,90, uma queda de 5,15%.$t$),
    ('garageinn-viracopos', $t$A semana aparece com valor de referência de R$ 419,93 e sai por R$ 398,30, ou seja, 5,15% abaixo. O mês tem referência de R$ 1.799,70 e sai por R$ 1.707,00.$t$),
    ('garageinn-viracopos', $t$| Garageinn (parceiro) | R$ 59,99, R$ 56,90 de 2 a 6 dias | R$ 398,30 | 1,0 km, van 3 min | Motor de reservas, 20/10/2026 |$t$),
    ('garageinn-viracopos', $t$Sete diárias somam R$ 398,30, o que dá R$ 56,90 por dia, segundo o motor de reservas em 20 de outubro de 2026. Esse mesmo valor por dia se mantém até a trigésima diária, quando o total chega a R$ 1.707,00.$t$),
    ('garageinn-viracopos', $t$contra R$ 59,99 e R$ 398,30 do Garageinn, considerando o bolsão em agosto e o Garageinn em 20 de outubro de 2026.$t$),
    ('preco-estacionamento-aeroporto-viracopos-saiba-tudo-aqui', $t$No Garageinn, em 20 de outubro de 2026: R$ 59,99, R$ 398,30, R$ 853,50 e R$ 1.707,00 nos mesmos períodos.$t$),
    ('preco-estacionamento-aeroporto-viracopos-saiba-tudo-aqui', $t$R$ 373,50 no Virapark, média de R$ 24,90 por dia em agosto de 2026, e R$ 853,50 no Garageinn, média de R$ 56,90 em outubro de 2026. A diferença de R$ 480,00 no período passa do total do mais barato.$t$),
    ('quanto-custa-deixar-o-carro-no-aeroporto-viracopos-por-7-dias', $t$R$ 174,30 no Virapark, o que dá R$ 24,90 por dia, em agosto de 2026, e R$ 398,30 no Garageinn, o que dá R$ 56,90 por dia, em 20 de outubro de 2026.$t$)
  ) as v(slug, trecho)
  join public.blog_post p on p.slug = v.slug
  where position(v.trecho in p.body_md) = 0;

  if falta is not null then
    raise exception 'Post de Viracopos sem o trecho novo da Garageinn: %', falta;
  end if;
end $$;
