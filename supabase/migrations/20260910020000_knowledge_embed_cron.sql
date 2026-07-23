-- E3.3 / base de conhecimento — F2: agenda o worker de embeddings a cada 2 min.
-- pg_net faz o POST async; a chave interna (x-knowledge-embed-key) vem do Vault (sem segredo no repo).
-- A Edge knowledge-embed drena a knowledge_source_queue (claim atomico) e vetoriza a prosa.
-- Ver docs/specs/knowledge-base.md.
--
-- O segredo `knowledge_embed_key` e criado no Vault operacionalmente (fora do repo):
--   select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'), 'knowledge_embed_key');

-- Valida o header da Edge contra o Vault DENTRO do Postgres: o segredo nunca vira env da Edge nem
-- trafega para fora; a RPC devolve so um booleano (nunca o segredo).
create or replace function public.knowledge_embed_key_valid(p_key text)
returns boolean
language sql
security definer
set search_path to 'public, vault'
stable
as $$
  select p_key is not null and p_key <> '' and exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'knowledge_embed_key' and s.decrypted_secret = p_key
  );
$$;

revoke all on function public.knowledge_embed_key_valid(text) from public, anon, authenticated;
grant execute on function public.knowledge_embed_key_valid(text) to service_role;

select cron.schedule(
  'knowledge-embed',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/knowledge-embed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-knowledge-embed-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'knowledge_embed_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
