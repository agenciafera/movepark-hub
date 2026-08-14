-- Desfaz a 20261021093000: o formulário de contato saiu da página.
--
-- Decisão do time em 14/08/2026: formulário de contato caiu em desuso. Quem precisa de
-- ajuda chama no WhatsApp ou no direct, e o formulário pedia que a pessoa escrevesse,
-- mandasse e esperasse sem saber se chegou. A página passou a ser uma lista de canais
-- diretos, e sem tela que use esta tabela ela vira superfície pública sem dono.
--
-- Some tudo junto de propósito. Tabela sem escrita e Edge sem chamador não são
-- inofensivas: envelhecem sem ninguém revisar, e continuam aceitando POST. Ver a
-- atividade 86ak11613.
--
-- Seguro: a Edge `submit-contact-message` nunca chegou a ser publicada (o deploy ficou
-- bloqueado por falta de token), então nada nunca escreveu aqui. Conferido antes de
-- apagar, `select count(*)` devolveu 0.

drop table if exists public.contact_message;

-- A chave só existia para a Edge saber para onde mandar o alerta.
delete from public.app_setting where key = 'support_inbox';
