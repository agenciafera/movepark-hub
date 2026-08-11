# Testes pgTAP (banco)

Testes de regra de negócio no Postgres (motor de preço, RPCs de onboarding, RLS).
Rodam em transação com rollback (não sujam dados).

```bash
supabase start      # sobe o stack local (uma vez)
bun run test:db     # = supabase test db  → roda supabase/tests/*.test.sql
```

O stack local é construído a partir do **baseline** (`supabase/migrations/20260101000000_baseline_from_live.sql`,
dump fiel do banco vivo) + **seed** (`supabase/seed.sql`, só catálogo/pricing, sem dados de cliente).
Por isso o schema e os dados de preço batem com produção.

## Arquivos
- `pricing.test.sql` - motor de preço (`simulate_price`), valores golden de `docs/simulacao-precos.md`,
  cobrindo as 7 estratégias + flips ⚠️ + a regressão do BUG-001. Espelha `test/pricing/cases.ts`.
- `onboarding_rpc.test.sql` - cadeia de RPCs do onboarding (lead → wizard → go-live) + `slugify`/slug único.
- `storage_buckets.test.sql` - OPS-05: visibilidade dos buckets (`assets-public` público; `vouchers`/`partner-uploads` privados) e RLS de `storage.objects` (escopo por prefixo `company_id`, admin vê tudo, anon não escreve/lê privado).
- `rls_inventory.test.sql` - o contorno da RLS, é o único arquivo que enxerga a tabela criada amanhã: toda tabela do schema `public` com RLS ligada, a lista EXATA das sete fail-closed (RLS ligada e zero policies, só `service_role` alcança) e nenhuma policy de escrita com predicado trivial (`using (true)`), que tem aparência de proteção e efeito de nenhuma. Nasce verde de propósito: o valor está em falhar no dia da migration.
- `api_grants_inventory.test.sql` - varre **todas** as `api_*` de uma vez: nenhuma executável por `anon` ou `authenticated`, todas `SECURITY DEFINER`, todas alcançáveis por `service_role`. Diferente do `anon_privileged_rpcs.test.sql`, que lista função por função e não enxerga a função criada amanhã. Fecha o default do Postgres: função nova no schema `public` nasce executável por PUBLIC, e esquecer o `revoke` numa migration é silencioso.
- `definer_grants_inventory.test.sql` - o meio de campo entre os dois acima: a função `SECURITY DEFINER` que **não** começa com `api_` e que ninguém pensou em listar. É a família mais perigosa das três, porque definer roda com os direitos do dono e ignora RLS. Traz a lista EXATA das 21 alcançáveis por `anon` (helper de policy RLS, catálogo da vitrine, cupom do checkout) e a invariante de que nenhuma `cron_*` é. Entrar na lista sem estar nela é `revoke` esquecido; sair dela quebra a vitrine anônima com "permission denied for function".
- `api_read_scope.test.sql` - o recorte por empresa onde o parceiro encosta: as funcoes de listar e buscar. O caso central nao e o estranho sem chave, e a empresa VIZINHA pedindo um id que nao e dela. Cobre tambem a forma da resposta (lista e sempre array, nunca null), que quebra o cliente que itera no caso mais comum: parceiro novo, sem cupom nem servico.
- `api_write_scope.test.sql` - o par do api_read_scope, do lado das escritas. Ler dado alheio e vazamento; escrever e pior: a vizinha desativaria o cupom de outra, apagaria o servico de outra, renomearia a unidade de outra, e nada disso apareceria como erro para quem sofreu. Cada recusa vem com a checagem de que NADA foi tocado, porque uma funcao que atualiza e so depois confere levantaria igual e deixaria o estrago.
- `api_upsert_scope.test.sql` - os upsert, que sao o caso mais delicado das escritas porque o MESMO endpoint cria e edita, separando os dois pelo p_id. Cobre criar, editar a linha existente (e nao criar outra) e a empresa vizinha sendo recusada ao passar um id alheio.
- `api_booking_scope.test.sql` - as escritas de RESERVA, as de maior consequencia do conjunto: mexem numa reserva ja vendida, com um cliente do outro lado. Se a vizinha alcancasse uma reserva alheia, cancelaria a viagem de alguem ou registraria entrada de um carro que nao chegou, sem gerar erro para ninguem. A fixture cria a reserva na propria transacao, com chave de API como ator (booking_actor_check exige profile_id ou created_via_api_key_id).
- `prospect_location.test.sql` - E0.17-a · ADR-010: a FORMA da tabela do lote mapeado, que é o ADR inteiro. Afirma que `checkout_mode`, `is_listed`, `take_rate_bps` e `is_24h` NÃO existem e que nenhuma FK aponta para a tabela, então falha no dia em que alguém "só adiciona uma coluninha" e reabre o estado impossível. Cobre também o slug único contra `location.slug` (Postgres não expressa unique entre tabelas, e slug repetido não dá erro: some a ficha e some a URL que tinha ranking) e a RLS, que precisa esconder rascunho E ficha convertida.
- `api_isolation.test.sql` - as três funções que sustentam o isolamento entre inquilinos (`api_key_assert_company_access`, `api_assert_lpt_company`, `api_assert_scopes`), que eram chamadas por quase toda `api_*` sem nenhuma asserção. Cobre a empresa vizinha pedindo um id que não é dela, o escopo fora do catálogo e o escopo interno (`payouts:write`) tentando entrar numa chave de API. Os erros são asseridos pelo `errcode` (`P0001` de domínio, `42501` de privilégio), não pela mensagem, que é copy.

## Nota sobre o histórico de migrations
O repo foi **rebaselineado** a partir do banco vivo (o histórico anterior estava divergente - várias
migrations aplicadas direto via MCP/dashboard, nunca commitadas). O banco continua sendo a fonte da
verdade. Se um dia for usar `supabase db push`, o histórico remoto (`supabase_migrations.schema_migrations`,
~39 linhas) precisa de um `supabase migration repair` para refletir só o baseline - passo de metadata,
feito sob demanda.

### O padrão volta, e o CI não vê

O rebaseline não curou a causa: migration aplicada via MCP continua entrando no vivo sem virar
arquivo, e aí o stack local (baseline + migrations) e produção **divergem em silêncio**. Um teste de
grants escrito olhando produção passa lá e falha aqui, ou pior, passa vazio.

Levantamento de 04/08/2026, comparando `supabase db dump --linked` com o repo:

| Divergência | Onde estava certo | Correção |
|---|---|---|
| `referral_reward_amount` executável por `anon` | vivo (fechado) | migration 20260922000000 |
| guarda de silêncio barrando todo UPDATE | vivo (só entrada) | 20260921000000, no corpo de `assert_company_not_silent` |
| 4 RPCs do motor de crescimento executáveis por `anon` (`recompute_membership`, `get_or_create_referral_code`, `get_my_membership`, `get_my_referrals`) | vivo (fechado) | migration 20260923000000 |
| 3 funções-trigger da base de conhecimento executáveis por `anon` | repo (fechado por 20260913000000) | aplicado no vivo em 04/08/2026; conferido: 0 de 24 funções-trigger alcançáveis por `anon` ou `authenticated` |

As cinco migrations da E0.14 que só existiam no vivo **não** viraram arquivo uma a uma: o estado
final delas já está em 20260921000000, conferido função a função. Está anotado no cabeçalho de lá,
com o carimbo de cada uma.

Como refazer a conferência sem subir stack local:

```bash
supabase db dump --linked --schema public -f /tmp/live.sql
supabase db dump --linked --schema supabase_migrations --data-only -f /tmp/hist.sql
```

O segundo traz a coluna `statements`, ou seja, o SQL exato que rodou em cada migration do vivo. É
por ali que se recupera o conteúdo de uma migration que nunca foi commitada.
