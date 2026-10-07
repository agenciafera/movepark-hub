-- pgTAP: FAQ de destino e global não promete vaga (Conteúdo 44, ADR-009).
--
-- A FAQ de destino aparece em toda página do aeroporto, inclusive nas praças sem parceiro e ao
-- lado de pátio sem reserva online; a global aparece em todas as páginas. "Sua vaga fica
-- garantida" ali é promessa de transação sem capacidade declarada. Promessa da unidade mora na
-- ficha e nas FAQs `location`, lidas de `getLocationCapabilities`.
--
-- Roda sobre o banco montado pelo CI (baseline + migrations + seed): pega a frase vindo do seed,
-- de migration nova ou de script. Em transação com rollback.

begin;
select plan(2);

select is(
  (select count(*)::int
     from public.faq
    where deleted_at is null
      and scope in ('destination', 'global')
      and (coalesce(answer, '') ~* '(vaga|lugar)[^.]{0,20}garantid|fica garantida'
        or coalesce(body_md, '') ~* '(vaga|lugar)[^.]{0,20}garantid|fica garantida')),
  0,
  'nenhuma FAQ de destino ou global promete vaga garantida'
);

select is(
  (select count(*)::int
     from public.faq_i18n i
     join public.faq f on f.id = i.faq_id
    where f.deleted_at is null
      and f.scope in ('destination', 'global')
      and (coalesce(i.answer, '') ~* 'spot is (held|guaranteed)|plaza (queda reservada|garantizada)'
        or coalesce(i.body_md, '') ~* 'spot is (held|guaranteed)|plaza (queda reservada|garantizada)')),
  0,
  'nenhuma tradução de FAQ de destino ou global promete vaga garantida'
);

select * from finish();
rollback;
