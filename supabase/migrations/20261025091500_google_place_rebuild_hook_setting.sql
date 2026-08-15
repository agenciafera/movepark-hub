-- A chave do deploy hook que o refresh do Google usa para rebuildar o site (§5 de
-- docs/specs/avaliacoes-google.md).
--
-- Sem esta linha a defesa principal do limite de cache não tinha como disparar. A Edge
-- `google-place-refresh` lê `app_setting` na chave `google_place_rebuild_hook_url` para
-- chamar o hook quando algum snapshot muda; a chave nunca foi semeada, então a leitura
-- voltava vazia, `rebuilt` saía `false` em toda passada e o HTML publicado envelhecia até
-- alguém dar push na `main`. Como o HTML do SSG também é cópia do conteúdo do Google, ele
-- responde pelo mesmo prazo de 30 dias que o banco.
--
-- Nasce VAZIA de propósito: o caminho "sem hook, não chama" da Edge continua valendo até
-- alguém colar a URL de verdade, e é assim que ela não tenta um POST para string vazia.
-- Preencher é um `update` de hub_admin, sem deploy.
--
-- `is_public = false`, e isto é a parte que não pode ser afrouxada: a policy
-- `app_setting_public_read` libera para `anon` toda chave marcada, e deploy hook é
-- credencial de disparo. Quem tiver a URL rebuilda o site à vontade.

insert into public.app_setting (key, value, is_public)
values ('google_place_rebuild_hook_url', '', false)
on conflict (key) do nothing;
