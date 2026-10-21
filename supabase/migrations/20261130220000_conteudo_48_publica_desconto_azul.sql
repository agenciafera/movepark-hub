-- Conteúdo 48 do Ataque CNF: publica o post do desconto Azul em Confins (autorizado pelo usuário em
-- 21/10/2026) e corrige os dois posts que falavam da condição sem a confirmação de 09/10.
--
-- 1. `desconto-azul-no-estacionamento-de-confins` sai do rascunho.
-- 2. `bepark-confins` dizia que o desconto "não é um cupom da Movepark" e mandava confirmar se valia
--    no pagamento antecipado. A BePark confirmou em 09/10 que vale em qualquer período, inclusive na
--    reserva pela Movepark, onde ele é cupom por categoria (ataque-cnf-bepark.md §6). A instrução do
--    balcão ganha o cartão de embarque, que o portal da Azul exige.
-- 3. `convenio-de-estacionamento-no-aeroporto` não nomeava a BePark em Confins, dava a Garageinn como
--    o maior desconto e atribuía ao estacionamento oficial de Confins os "R$ 26,90 antecipado", que
--    são do Estapar no Zul+ (ataque-cnf-bepark.md §2.3.1).
--
-- Cada `replace` só age se o trecho antigo ainda estiver lá, então reaplicar não muda nada.

update public.blog_post
   set is_published = true,
       published_at = now()
 where slug = 'desconto-azul-no-estacionamento-de-confins'
   and is_published = false
   and deleted_at is null;

update public.blog_post
   set body_md = replace(replace(body_md,
     $a$Para usar, você mostra a categoria no app da Azul, com o login ativo, na hora de pagar no balcão.$a$,
     $b$Para usar, você mostra a categoria no app da Azul, com o login ativo, e o cartão de embarque na hora de pagar no balcão.$b$),
     $a$O desconto é aplicado pela BePark no balcão, mediante a categoria no app da Azul, e não é um cupom da Movepark. Antes de reservar, confirme com a BePark se ele soma com a tarifa escolhida e se vale no pagamento antecipado. As regras podem mudar, e quem decide é o estacionamento.$a$,
     $b$Vale. A BePark confirmou à Movepark, em 9 de outubro de 2026, que o desconto Azul vale também na reserva feita pela Movepark, em qualquer período e com os pacotes incluídos. No sistema de reserva da BePark, ele aparece como um cupom por categoria do Azul Fidelidade. A categoria é declarada por você, então leve o app da Azul logado e o cartão de embarque para o balcão. A conta de cada categoria, na diária, na semana e no mês, está no post sobre o [desconto Azul no estacionamento de Confins](/blog/desconto-azul-no-estacionamento-de-confins/).$b$)
 where slug = 'bepark-confins'
   and deleted_at is null;

update public.blog_post
   set body_md = replace(replace(replace(body_md,
     $a$A Azul também mantém parcerias de estacionamento em outras praças, incluindo Confins, divulgadas no mesmo portal. Como a página da companhia recusa leitura automática, aqui fica registrado apenas o que o próprio estacionamento publica, que é verificável. Se você é cliente da companhia, o portal é o lugar certo para conferir a condição vigente.$a$,
     $b$Em Confins, quem publica a condição é a BePark: de 10% a 40% para cliente Azul Fidelidade, conforme a categoria (Azul Fidelidade 10%, Topázio 15%, Safira 25%, Diamante 30% e Diamante Unique 40%), sobre qualquer período, pacote incluído. A condição está no site da BePark, lido em 7 de outubro de 2026, e foi confirmada por ela à Movepark em 9 de outubro. Os percentuais batem com a página de estacionamento do portal da Azul, conferida no mesmo dia. No balcão, leve a categoria aberta no app da Azul e o cartão de embarque. A conta de cada categoria e a comparação com os vizinhos estão no post sobre o [desconto Azul no estacionamento de Confins](/blog/desconto-azul-no-estacionamento-de-confins/).$b$),
     $a$| Confins (CNF) | R$ 60,00 a R$ 105,00 no balcão, R$ 26,90 antecipado | R$ 45,00 avulsa, R$ 13,33 por dia no mês | Parcerias divulgadas no portal da Azul |$a$,
     $b$| Confins (CNF) | R$ 60,00 a R$ 105,00 no balcão | R$ 45,00 avulsa, R$ 13,33 por dia no mês | Azul na BePark, de 10% a 40% por categoria |$b$),
     $a$Entre os verificados, a condição da Azul na Garageinn em Viracopos é a que mais reduz a conta. São R$ 30,00 na primeira diária e R$ 40,00 nas demais. Isso dá R$ 270,00 em sete dias, contra R$ 321,30 da reserva comum na mesma unidade. Ainda assim, um lote vizinho fecha a mesma semana por R$ 174,30.$a$,
     $b$Entre os verificados, o desconto Azul da BePark, em Confins, é o que mais reduz a conta: no Diamante Unique, 40%, a semana cai de R$ 200,00 para R$ 120,00, no motor da Movepark em 21/10/2026. Em Viracopos, a condição da Azul na Garageinn leva a mesma semana de R$ 321,30 para R$ 270,00, e um lote vizinho fecha por R$ 174,30.$b$)
 where slug = 'convenio-de-estacionamento-no-aeroporto'
   and deleted_at is null;
