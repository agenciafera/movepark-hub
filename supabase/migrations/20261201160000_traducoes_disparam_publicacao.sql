-- Tradução de post e de FAQ passa a disparar a publicação do site.
--
-- `blog_post_i18n` e `faq_i18n` saem em página pré-renderizada (/en/blog, /es/blog e as FAQs
-- traduzidas), mas não tinham o trigger `<tabela>_site_rebuild`. Trocar só a tradução ficava
-- no banco e não ia ao ar até o próximo build de código. A rodada de frescor de 19/10/2026
-- achou o buraco (ver docs/specs/rotina-mensal-frescor.md, "O que ficou aberto"), e a de
-- novembro corrige 50 traduções de uma vez.
--
-- Mesmo molde dos demais: trigger de statement, que enfileira um pedido por comando e deixa o
-- pg_cron coalescer (ver docs/specs/deploy-automatico.md).

drop trigger if exists blog_post_i18n_site_rebuild on public.blog_post_i18n;
create trigger blog_post_i18n_site_rebuild
  after insert or delete or update on public.blog_post_i18n
  for each statement execute function public.request_site_rebuild();

drop trigger if exists faq_i18n_site_rebuild on public.faq_i18n;
create trigger faq_i18n_site_rebuild
  after insert or delete or update on public.faq_i18n
  for each statement execute function public.request_site_rebuild();
