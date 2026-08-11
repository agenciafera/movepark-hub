-- Escopos da API do blog (ADR-003 + ADR-005).
--
-- `blog:read` é escopo comum de chave: o conteúdo do blog é público (está no
-- site, no sitemap e no llms.txt), então qualquer integrador pode ler. Entra no
-- OpenAPI e no card do MCP.
--
-- `blog:write` é ESCOPO DE PLATAFORMA. O blog é conteúdo da Movepark, não dado
-- de parceiro: nenhum estacionamento publica post. O trigger
-- `company_role_scope_no_platform` recusa colocá-lo em qualquer papel de
-- empresa, então dono, gerente e operador nunca ganham isso por engano, nem
-- mesmo o Dono, que tem "todos" os escopos de empresa.
--
-- `assignable_to_api_key = true` porque a escrita precisa ser chamável por
-- máquina, com uma chave da própria Movepark. É o mesmo arranjo do
-- `checkout:link`: atribuível a uma chave E de plataforma, que são flags
-- ortogonais. As rotas que ele abre são internas e NÃO aparecem no OpenAPI nem
-- em card de MCP, por decisão de produto: ação de Manager não se documenta em
-- superfície pública. O contrato delas mora em docs/specs/blog.md.

insert into public.api_scope (scope, module, description, assignable_to_api_key, is_platform_scope)
values
  (
    'blog:read',
    'blog',
    'Ler posts publicados do blog, com categoria, tag, autor e destino.',
    true,
    false
  ),
  (
    'blog:write',
    'blog',
    'Criar, editar, publicar e excluir post do blog. Exclusivo da equipe Movepark.',
    true,
    true
  )
on conflict (scope) do update
  set module = excluded.module,
      description = excluded.description,
      assignable_to_api_key = excluded.assignable_to_api_key,
      is_platform_scope = excluded.is_platform_scope;
