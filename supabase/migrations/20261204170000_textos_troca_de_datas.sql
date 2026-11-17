-- Textos da troca de datas de reserva paga (17/11/2026): o que o site, a FAQ e a base do operador
-- dizem passa a bater com a regra nova (docs/specs/booking-modifications.md §8).
--
--   - FAQ global nova "Como funciona a alteração de datas da reserva?" (pt, en, es). Ganha página
--     própria em /faq/<slug> e entra na base da Mia dos clientes pelo gatilho da FAQ.
--   - FAQ "Como cancelo uma reserva?": mandava cancelar e refazer para mudar a data, ignorando que a
--     Flex e a Superflex alteram sozinhas. "Voltei antes do previsto" ganha o link.
--   - Base do operador: "Alterar datas: como funciona" dizia "preço de hoje" e "o cupom deixa de
--     valer"; "Voltar antes" falava do preço de hoje; "De onde sai o estorno" e "Quando o
--     estacionamento recebe" ganham a diferença de datas.
--   - Blog "guia-completo-aeroporto-salvador": prometia estender "a qualquer momento" e cobrar "só o
--     tempo real", o contrário da FAQ das diárias não usadas.
--
-- Cada troca é do campo inteiro, com trava de md5: se o texto mudou desde a conferência, a migration
-- para em vez de sobrescrever. Sem as linhas (banco local do db reset), não faz nada.

do $mig$
declare
  v_cat uuid;
  v_faq uuid;
  v_n int;
begin
  -- ── FAQ nova ─────────────────────────────────────────────────────────────────
  select id into v_cat from public.faq_category where slug = 'reservas';
  if v_cat is null then
    raise notice 'categoria reservas ausente: textos da troca de datas não aplicados (stack sem conteúdo)';
    return;
  end if;

  if not exists (select 1 from public.faq where slug = 'como-funciona-a-alteracao-de-datas-da-reserva' and deleted_at is null) then
    insert into public.faq (scope, category_id, slug, question, answer, body_md, sort_order)
    values (
      'global', v_cat, 'como-funciona-a-alteracao-de-datas-da-reserva',
      'Como funciona a alteração de datas da reserva?',
      'Na Flex e na Superflex, você altera as datas em "Minhas reservas" até o horário do check-in. A diferença sai da tabela de preço do dia da sua compra, então mudar só o dia, com a mesma quantidade de diárias, não custa nada. Antes de confirmar, você vê o valor: se ficar mais caro, paga a diferença por PIX ou cartão; se ficar mais barato, ela volta pelo mesmo meio de pagamento. A Tarifa não muda e o cupom continua valendo.',
      $md$## Alterar as datas da reserva de estacionamento

Vale para quem reservou direto na Movepark com a Tarifa Flex ou Superflex. Na Básica, faça o upgrade de Tarifa na própria reserva, ou cancele dentro do prazo e reserve de novo.

### Como fazer

1. Abra a reserva em "Minhas reservas" e toque em "Alterar datas".
2. Escolha a nova entrada e a nova saída e toque em "Ver o valor".
3. Confira quanto você paga ou recebe de volta e confirme.

Dá para alterar até o horário do check-in, desde que tenha vaga nas novas datas.

### Como a diferença é calculada

A conta usa a tabela de preço do estacionamento que valia no dia da sua compra. Se a tabela subir depois, a sua reserva não paga a mais por isso.

- **Mesma quantidade de diárias, outro dia:** sem custo.
- **Mais diárias:** você paga a diferença entre as duas durações. Pode ser por PIX ou cartão, e as datas mudam quando o pagamento for aprovado.
- **Menos diárias:** a diferença volta pelo mesmo meio de pagamento. No PIX costuma cair em minutos, no máximo em um dia útil; no cartão aparece em até duas faturas.
- **Tabela com pacote:** alguns estacionamentos cobram um preço fechado a partir de certo número de diárias. Nesse caso, encurtar a estadia pode custar mais, e o valor aparece antes de você confirmar.
- **Reserva feita antes de 17/11/2026:** a diferença entre as durações sai da tabela atual do estacionamento.

A Tarifa (Flex ou Superflex) não muda, e o cupom usado na compra continua valendo: o de percentual é refeito sobre o novo valor e o de valor fixo se mantém. O prazo de cancelamento passa a contar da nova data.

### Depois do check-in

Com o carro já no estacionamento, as datas não mudam por aqui e as diárias que sobrarem não são devolvidas. Veja [voltei antes do previsto](/faq/voltei-antes-do-previsto-recebo-as-diarias-que-nao-usei).

Veja também: [como cancelo uma reserva](/faq/como-cancelo-uma-reserva).$md$,
      coalesce((select max(sort_order) from public.faq where scope = 'global' and category_id = v_cat and deleted_at is null), 0) + 1
    )
    returning id into v_faq;

    insert into public.faq_i18n (faq_id, locale, slug, question, answer)
    values
    (v_faq, 'en', 'how-does-changing-my-booking-dates-work',
     'How does changing my booking dates work?',
     'On Flex and Superflex, you change the dates under "My bookings" up to check-in time. The difference comes from the price table on the day you booked, so moving the same number of days to other dates costs nothing. You see the amount before confirming: if it costs more, you pay the difference by PIX or card; if it costs less, it goes back to the same payment method. The fare stays the same and your coupon still applies.'),
    (v_faq, 'es', 'como-funciona-el-cambio-de-fechas-de-la-reserva',
     '¿Cómo funciona el cambio de fechas de la reserva?',
     'En Flex y Superflex, cambiás las fechas en "Mis reservas" hasta la hora del check-in. La diferencia sale de la tabla de precios del día de tu compra, así que mover la misma cantidad de días a otras fechas no cuesta nada. Antes de confirmar ves el valor: si sale más caro, pagás la diferencia con PIX o tarjeta; si sale más barato, vuelve por el mismo medio de pago. La tarifa no cambia y el cupón sigue valiendo.');
  end if;

  -- ── "Como cancelo uma reserva?" ──────────────────────────────────────────────
  select count(*) into v_n from public.faq where slug = 'como-cancelo-uma-reserva' and deleted_at is null;
  if v_n = 1 then
    update public.faq set body_md = replace(body_md,
        '- Vai só mudar a data? Cancele dentro do prazo e refaça a reserva com as datas novas.',
        '- Vai só mudar a data? Na Flex e na Superflex, altere em "Minhas reservas" sem cancelar: mudar só o dia, com a mesma quantidade de diárias, não custa nada. Veja [como funciona a alteração de datas](/faq/como-funciona-a-alteracao-de-datas-da-reserva). Na Básica, faça o upgrade de Tarifa ou cancele dentro do prazo e reserve de novo.')
     where slug = 'como-cancelo-uma-reserva' and deleted_at is null
       and md5(coalesce(answer, '') || coalesce(body_md, '')) = 'b520f718e228801ea9692924efe57a1a';
    if not found and not exists (
      select 1 from public.faq where slug = 'como-cancelo-uma-reserva' and body_md like '%como-funciona-a-alteracao-de-datas-da-reserva%'
    ) then
      raise exception 'FAQ "como cancelo" mudou desde a conferência; revise antes de reaplicar.';
    end if;
  end if;

  -- ── "Voltei antes do previsto" ───────────────────────────────────────────────
  select count(*) into v_n from public.faq where slug = 'voltei-antes-do-previsto-recebo-as-diarias-que-nao-usei' and deleted_at is null;
  if v_n = 1 then
    update public.faq set body_md = replace(body_md,
        'Veja também: [como cancelo uma reserva](/faq/como-cancelo-uma-reserva) e a [política de cancelamento](/cancelamento).',
        'Veja também: [como funciona a alteração de datas](/faq/como-funciona-a-alteracao-de-datas-da-reserva), [como cancelo uma reserva](/faq/como-cancelo-uma-reserva) e a [política de cancelamento](/cancelamento).')
     where slug = 'voltei-antes-do-previsto-recebo-as-diarias-que-nao-usei' and deleted_at is null
       and md5(coalesce(answer, '') || coalesce(body_md, '')) = '6371b48a8322783b354cf8901a03fdab';
    if not found and not exists (
      select 1 from public.faq where slug = 'voltei-antes-do-previsto-recebo-as-diarias-que-nao-usei' and body_md like '%como-funciona-a-alteracao-de-datas-da-reserva%'
    ) then
      raise exception 'FAQ "voltei antes" mudou desde a conferência; revise antes de reaplicar.';
    end if;
  end if;

  -- ── Base do operador ─────────────────────────────────────────────────────────
  if exists (select 1 from public.operator_playbook_article where slug = 'alterar-datas-como-funciona') then
    update public.operator_playbook_article set body_md = $md$
A diferença sai da tabela de preço que valia no dia da compra (regra de 17/11/2026). Reserva feita antes disso usa a diferença entre as durações pela tabela de hoje. Nos dois casos, mudar só o dia, com a mesma quantidade de diárias, não custa nada.

- Reserva ainda não paga: o total é recalculado e o cliente paga o valor novo.
- Reserva paga, novo período mais barato: as datas mudam na hora e a diferença volta ao cliente na mesma forma de pagamento. Se o banco recusar a devolução, ela vai para a equipe Movepark, que devolve em até 2 dias úteis.
- Reserva paga, novo período mais caro: o cliente paga a diferença por PIX ou cartão em "Minhas reservas", ou o estacionamento gera um PIX pela Mia e manda o copia e cola. A vaga nas datas novas fica segura e as datas só mudam quando o pagamento for aprovado. Se o PIX vencer, a reserva continua nas datas antigas.
- Tabela com pacote (preço fechado a partir de certo número de diárias): encurtar pode custar mais. A cotação mostra isso antes.

O que acontece junto:
- o cupom usado na compra continua valendo (o de percentual é refeito sobre o novo valor);
- a tarifa continua a mesma e não entra na diferença; o prazo de cancelamento passa a contar da nova entrada;
- a diferença é da vaga: quando o cliente paga dias a mais, a parte do estacionamento entra no extrato dele; quando recebe dias de volta, sai do estacionamento a parte dele nessas diárias e da Movepark a comissão;
- tudo fica no histórico da reserva.

Só dá para alterar antes da data e hora de entrada, com vaga disponível nas novas datas. A Mia cota antes de propor.

Quem pode: o cliente na Flex e na Superflex; o estacionamento em qualquer tarifa, pela Mia.
$md$
     where slug = 'alterar-datas-como-funciona' and md5(body_md) = '467461bfbf4a1372e487199e54fef757';
    if not found and not exists (
      select 1 from public.operator_playbook_article where slug = 'alterar-datas-como-funciona' and body_md like '%regra de 17/11/2026%'
    ) then
      raise exception 'Artigo "alterar datas" mudou desde a conferência; revise antes de reaplicar.';
    end if;

    update public.operator_playbook_article set body_md = replace(body_md,
        '- Atenção: a nova data é cotada ao preço de hoje. Se o preço subiu desde a compra, um período menor pode não gerar devolução, e a cotação mostra isso antes.',
        '- Atenção: a diferença sai da tabela da compra. Se a tabela tiver pacote, um período menor pode não gerar devolução ou até custar mais, e a cotação mostra isso antes.')
     where slug = 'voltar-antes-diarias-nao-usadas' and md5(body_md) = 'cc5e739d692f28abe83aabff4b971c96';

    update public.operator_playbook_article set body_md = body_md || $md$
Na troca de datas mais barata, a devolução é só das diárias que saíram: sai do estacionamento a parte dele nessas diárias e da Movepark a comissão delas. A tarifa não volta.
$md$
     where slug = 'estorno-de-onde-sai' and md5(body_md) = 'f4d7659b8434e3216f1b5c4dbd8032af';

    update public.operator_playbook_article set body_md = body_md || $md$- Troca de datas: quando o cliente paga dias a mais, a parte do estacionamento entra no extrato como as outras vendas. Quando recebe dias de volta, sai a parte dele nessas diárias.
$md$
     where slug = 'quando-o-estacionamento-recebe' and md5(body_md) = '9827d1a99f8db70545e5abb9869130c1';
  end if;

  -- ── Blog: guia do aeroporto de Salvador ──────────────────────────────────────
  update public.blog_post set body_md = replace(replace(body_md,
      E'**P: Posso alterar a data de saída?**\nR: Sim, você pode estender sua permanência a qualquer momento.',
      E'**P: Posso alterar a data de saída?**\nR: Depende de onde você reservou. Na Movepark, as Tarifas Flex e Superflex permitem alterar as datas antes do check-in, e você vê a diferença antes de confirmar. Em reserva feita direto com o estacionamento, vale a regra dele.'),
      E'**P: Há cobrança por antecipação de saída?**\nR: Não, você só paga pelo tempo de permanência real.',
      E'**P: Se eu voltar antes, pago menos?**\nR: Com reserva, normalmente não: a vaga fica reservada pelo período inteiro, e na Movepark as diárias que sobram depois do check-in não são devolvidas. Quem estaciona sem reserva e paga na saída paga só o tempo que ficou.')
   where slug = 'guia-completo-aeroporto-salvador' and md5(body_md) = '126c7ef826406bbbc17be331da818c9c';
end $mig$;
