-- Ataque CNF, saída da revisão de 30 dias (Conteúdo 58, ataque-cnf-bepark.md §5.1): a BePark voltou a
-- `checkout_mode = 'external'` em 19/10/2026 e vende só no sistema dela, mas três posts ainda
-- prometiam a venda pelo Hub (ADR-009):
--
--   bepark-confins                              "a reserva fecha na própria Movepark", "três tarifas",
--                                               "a vaga vendida pela Movepark é a coberta", cupom Azul
--   top-3-estacionamentos-do-aeroporto-de-confins  "reserva pela Movepark desde 6 de outubro", tarifas
--   desconto-azul-no-estacionamento-de-confins  cupom "na etapa de cupons" e total "na tela do checkout"
--
-- O texto novo diz o que vale com a unidade externa: o preço por duração está na página da BePark na
-- Movepark, a reserva fecha no sistema da própria BePark, e as regras de cancelamento e troca são as
-- que aparecem na tela antes do pagamento. O desconto Azul segue confirmado para qualquer período
-- (BePark, 09/10/2026); como ele entra na reserva online se confere na tela.
--
-- Cada trecho antigo precisa estar no texto: se faltar algum, a migration aborta em vez de gravar meia
-- troca. Se o post já tem o texto novo (reaplicação), ele é pulado. Sem o acervo (db reset do CI), não
-- há nada a fazer. As traduções en/es do post de "melhor" são da versão de setembro e não falam da
-- venda pela Movepark, então ficam como estão.

do $bepark$
declare
  troca record;
  par text[];
  corpo text;
  i int;
begin
  for troca in
    select * from (values
      ('bepark-confins', $n$A tabela da página da BePark na Movepark é a da vaga coberta$n$, array[
        $a$O preço da BePark Confins sai do motor de reservas da Movepark, o mesmo que fecha a compra, e vale para a vaga coberta.$a$,
        $b$O preço da BePark Confins sai do motor de reservas da Movepark, que espelha a tabela do sistema da própria BePark, onde a reserva fecha, e vale para a vaga coberta.$b$,

        $a$Na reserva pela Movepark, a vaga vendida é a coberta, que protege do sol forte e da chuva de verão de Minas Gerais.$a$,
        $b$A vaga coberta protege do sol forte e da chuva de verão de Minas Gerais, e o tipo de vaga se confirma com a BePark na hora de reservar.$b$,

        $a$### O desconto Azul vale na reserva pela Movepark?$a$,
        $b$### O desconto Azul vale na reserva online?$b$,

        $a$Vale. A BePark confirmou à Movepark, em 9 de outubro de 2026, que o desconto Azul vale também na reserva feita pela Movepark, em qualquer período e com os pacotes incluídos. No sistema de reserva da BePark, ele aparece como um cupom por categoria do Azul Fidelidade. A categoria é declarada por você, então leve o app da Azul logado e o cartão de embarque para o balcão.$a$,
        $b$A BePark confirmou à Movepark, em 9 de outubro de 2026, que o desconto Azul vale em qualquer período, com os pacotes incluídos. A reserva online fecha no sistema da própria BePark: antes de pagar, confira na tela se o desconto da sua categoria entrou e, se não entrou, fale com a BePark. No balcão, leve o app da Azul logado e o cartão de embarque.$b$,

        $a$Desde 6 de outubro de 2026, a reserva da BePark Confins fecha na própria Movepark, com o preço do motor de reservas. Você escolhe as datas na [página da BePark em Confins](/estacionamentos/aeroporto-confins/bepark), vê o total da estadia e paga na hora. O site da própria BePark também tem botão de reserva.$a$,
        $b$Você escolhe as datas na [página da BePark em Confins](/estacionamentos/aeroporto-confins/bepark), vê o total da estadia e segue pelo botão de reserva para o sistema da própria BePark, onde a reserva fecha e o pagamento acontece. O site da BePark leva ao mesmo sistema.$b$,

        $a$### Quais tarifas a reserva pela Movepark oferece?$a$,
        $b$### Quais são as regras de cancelamento e troca?$b$,

        $a$Na reserva pela Movepark, a BePark Confins tem três tarifas, com regras próprias de cancelamento, de troca de data e de placa e de voo atrasado. As condições de cada uma estão na [ficha da BePark](/estacionamentos/aeroporto-confins/bepark), e é lá que elas valem.$a$,
        $b$Cancelamento, troca de data e de placa e voo atrasado seguem as regras do sistema de reserva da BePark, que aparecem na tela antes do pagamento, e é lá que elas valem.$b$,

        $a$- **Quem quer vaga coberta e reserva com preço do motor.** A vaga coberta vendida pela Movepark protege o carro, e o valor da reserva é o mesmo da página.$a$,
        $b$- **Quem quer ver o total antes de sair de casa.** A página da BePark na Movepark mostra o preço por duração, com a mesma tabela do sistema onde a reserva fecha.$b$,

        $a$Na reserva pela Movepark, a vaga vendida é a coberta, a R$ 45,00 a diária. Para saber o preço da descoberta, que não é vendida pela Movepark, consulte a própria BePark.$a$,
        $b$A tabela da página da BePark na Movepark é a da vaga coberta, a R$ 45,00 a diária. Para saber o preço da descoberta, consulte a própria BePark.$b$
      ]),
      ('top-3-estacionamentos-do-aeroporto-de-confins', $n$Quais são as regras de cancelamento da BePark?$n$, array[
        $a$A vaga vendida pela Movepark é coberta, num pátio fechado com portaria controlada, e a unidade funciona 24 horas, com tolerância de 60 minutos declarada na ficha. Desde 6 de outubro de 2026, a reserva fecha na própria Movepark, com o preço do motor de reservas, o mesmo da [página da BePark em Confins](/estacionamentos/aeroporto-confins/bepark).$a$,
        $b$O pátio é fechado, com vagas cobertas e portaria controlada, e a unidade funciona 24 horas, com tolerância de 60 minutos declarada na ficha. O preço por duração está na [página da BePark em Confins](/estacionamentos/aeroporto-confins/bepark), de onde a reserva segue para o sistema da própria BePark.$b$,

        $a$### O que a reserva pela Movepark muda na BePark?$a$,
        $b$### Quais são as regras de cancelamento da BePark?$b$,

        $a$Na reserva feita pela Movepark, a BePark tem três tarifas, e cada uma traz regras próprias de cancelamento, de troca de data e de placa e de voo atrasado. As condições de cada tarifa estão na [ficha da BePark](/estacionamentos/aeroporto-confins/bepark), e é lá que elas valem.$a$,
        $b$Cancelamento, troca de data e de placa e voo atrasado seguem as regras do sistema de reserva da BePark, que aparecem na tela antes do pagamento, e é lá que elas valem. A reserva começa na [página da BePark em Confins](/estacionamentos/aeroporto-confins/bepark).$b$,

        $a$- **Pela Movepark:** só a BePark, com o preço do motor de reservas, desde 6 de outubro de 2026.$a$,
        $b$- **Pela página na Movepark:** só a BePark, com o preço por duração na página e a reserva fechando no sistema da própria BePark.$b$,

        $a$a BePark vende pela Movepark só a vaga coberta, num pátio de mais de 350 vagas$a$,
        $b$a BePark declara mais de 350 vagas, cobertas e descobertas$b$,

        $a$a BePark, com reserva pela Movepark desde 6 de outubro.$a$,
        $b$a BePark, com preço e reserva a partir da página dela na Movepark.$b$
      ]),
      ('desconto-azul-no-estacionamento-de-confins', $n$confira se o desconto da sua categoria entrou e anote o total$n$, array[
        $a$Vale. A BePark confirmou à Movepark, em 9 de outubro de 2026, que o desconto Azul vale também na reserva feita pela Movepark, em qualquer período. No sistema de reserva da BePark, o desconto aparece como um cupom por categoria do Azul Fidelidade, que você escolhe na etapa de cupons.$a$,
        $b$A BePark confirmou à Movepark, em 9 de outubro de 2026, que o desconto Azul vale em qualquer período, com os pacotes incluídos. A reserva online começa na página da BePark na Movepark e fecha no sistema da própria BePark. Antes de pagar, confira na tela se o desconto da sua categoria entrou e, se não entrou, fale com a BePark.$b$,

        $a$- **A categoria é declarada por você.** O sistema de reserva não consulta o Azul Fidelidade. Leve o app logado e o cartão de embarque mesmo assim, porque o balcão é quem recebe o carro.$a$,
        $b$- **Leve a comprovação.** Mesmo com a reserva paga, leve a categoria aberta no app da Azul e o cartão de embarque, porque o balcão é quem recebe o carro.$b$,

        $a$Se você usou o cupom na reserva, não conte com outro abatimento no balcão.$a$,
        $b$Se ele já entrou na reserva, não conte com outro abatimento no balcão.$b$,

        $a$O total com o cupom sai na tela do checkout, e é esse o número que vale.$a$,
        $b$O total com o desconto sai na tela de pagamento da BePark, e é esse o número que vale.$b$,

        $a$ou sem o cupom na reserva online, você paga o preço cheio.$a$,
        $b$ou sem o desconto aplicado na reserva online, você paga o preço cheio.$b$,

        $a$- Se for reservar online, escolha o cupom da sua categoria e anote o total do checkout.$a$,
        $b$- Se for reservar online, confira se o desconto da sua categoria entrou e anote o total antes de pagar.$b$,

        $a$Vale. A BePark confirmou em 9 de outubro de 2026 que o desconto vale na reserva feita pela Movepark, em qualquer período. No sistema de reserva da BePark, ele aparece como cupom por categoria. A categoria é declarada por você, então leve o app da Azul logado e o cartão de embarque para o balcão.$a$,
        $b$A BePark confirmou em 9 de outubro de 2026 que o desconto vale em qualquer período, com os pacotes incluídos. A reserva online fecha no sistema da própria BePark: confira na tela se o desconto da sua categoria entrou antes de pagar e leve o app da Azul logado e o cartão de embarque para o balcão.$b$,

        $a$Não. Na reserva online, a categoria do Azul Fidelidade é uma declaração sua, e o sistema de reserva não consulta o programa da Azul. O estacionamento é quem recebe o carro e pode pedir a comprovação$a$,
        $b$Não. A Movepark não consulta o programa da Azul. Quem confere a categoria é a BePark, que recebe o carro e pode pedir a comprovação$b$
      ])
    ) as t(slug, marca_nova, pares)
  loop
    select body_md into corpo from public.blog_post where slug = troca.slug and deleted_at is null;

    if corpo is null then
      raise notice 'bepark: % não existe neste banco, nada a revisar', troca.slug;
      continue;
    end if;

    if strpos(corpo, troca.marca_nova) > 0 then
      raise notice 'bepark: % já tem o texto novo, pulado', troca.slug;
      continue;
    end if;

    par := troca.pares;
    for i in 1 .. array_length(par, 1) by 2 loop
      if strpos(corpo, par[i]) = 0 then
        raise exception 'bepark: trecho antigo não encontrado em %: %', troca.slug, left(par[i], 80);
      end if;
      corpo := replace(corpo, par[i], par[i + 1]);
    end loop;

    update public.blog_post set body_md = corpo where slug = troca.slug and deleted_at is null;
    raise notice 'bepark: % revisado (% trechos)', troca.slug, array_length(par, 1) / 2;
  end loop;
end
$bepark$;
