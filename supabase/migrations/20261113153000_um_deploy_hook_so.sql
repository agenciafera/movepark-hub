-- Um Deploy Hook só, guardado num lugar só.
--
-- A chave `google_place_rebuild_hook_url` (migration 20261025091500) existia para a Edge
-- `google-place-refresh` chamar o Deploy Hook do Workers Builds por conta própria, quando um
-- snapshot do Google mudava. Só que a publicação automática do site, criada depois
-- (20261030140000), já resolve isso para o site inteiro: trigger enfileira em
-- `site_rebuild_request`, o cron decide com debounce e dispara o hook, guardado no Vault como
-- `cloudflare_deploy_hook_url`.
--
-- Manter as duas significava a mesma URL secreta em dois lugares, duas rotações e duas formas de
-- ficar meio configurado. Foi o que aconteceu: a spec de avaliações descrevia o hook como
-- pendência própria sem notar que a fila cobria o mesmo caso, e o refresh devolvia
-- `rebuilt: false` em toda passada.
--
-- Agora a Edge enfileira como qualquer outra mudança de conteúdo, e esta chave não tem mais leitor.

delete from public.app_setting where key = 'google_place_rebuild_hook_url';
