# Rascunho como status + usuários testadores

Data: 16/09/2026. Decidido com o Kallef por AskUserQuestion (quatro respostas, todas na
opção recomendada). Substitui o "modo rascunho para hub_admin" de 15/09 e o atalho
"Testar rascunho" do Manager.

## Problema

A unidade em rascunho (Agência Fera) precisa ser testada de ponta a ponta, com busca,
filtros, ficha e pagamento de verdade, por uma conta de CLIENTE. A conta do Manager
(hub_admin) não serve para comprar, e a caixa "Rascunho: não publicar na vitrine"
escondida dentro do bloco Catálogo Movepark confundiu quem opera.

## Decisões

| # | Decisão | Escolha |
|---|---|---|
| 1 | Onde marcar quem é testador | Manager › Usuários, coluna "Testador" por linha |
| 2 | Alcance do testador | Vê TODOS os rascunhos (sem vínculo com empresa) |
| 3 | hub_admin | Vê rascunho automaticamente, sem precisar ser marcado |
| 4 | Atalho "Testar rascunho" e exceção de hub_admin no ReservationCard | Removidos |

## Modelo

- `location.is_draft` continua sendo a coluna que guarda o rascunho (já existe, com o
  gatilho que força `is_listed = false`). NÃO entra valor novo no enum `entity_status`:
  ele é compartilhado com `company` e outras tabelas, e todo corte do catálogo checa
  `status = 'active'`; um valor novo obrigaria a reescrever cada corte. O formulário
  mostra "Rascunho" como opção do select Status e grava `status = 'active'` +
  `is_draft = true`. Selecionar Ativa/Inativa/Suspensa grava `is_draft = false`.
- `public.tester_user (user_id pk -> auth.users, created_by, created_at)`.
- `public.is_tester()`: `is_hub_admin()` OR `auth.uid()` em `tester_user`. Estável,
  security definer, executável por `authenticated`.
- RPC `admin_set_tester(user_id, enabled)`: só hub_admin; insere/remove e grava quem.
- Leitura do flag: `profiles` ganha a vista pela RPC `get_my_session`/sessão? Não. O
  front lê `is_tester` por RPC `is_tester()` na sessão (AuthProvider) e a lista de
  Usuários lê `tester_user` (RLS: hub_admin lê tudo; o próprio lê a própria linha).

## Visibilidade

Todo corte `l.is_listed` passa a ser `(l.is_listed or (l.is_draft and public.is_tester()))`:

1. Policy `catalog_read_location` (leitura pública de `location`).
2. `check_availability`, `get_pricing_data`, `availability_batch`, `simulate_price`
   (hoje `or public.is_hub_admin()`; `is_tester()` engloba hub_admin).
3. Edge `search`: cria o client com o header `Authorization` da requisição, para a RLS
   correr como o usuário; o filtro explícito `if (!r.location.is_listed)` passa a
   aceitar `is_draft` (a RLS já decidiu quem vê) e devolve `is_draft` no resultado.
4. Front `fetchListing`: sai o `.eq("location.is_listed", true)` fixo, entra
   `.or("is_listed.eq.true,is_draft.eq.true", { foreignTable: "location" })`; anônimo
   segue cortado pela RLS. Página do destino (units) idem.
5. Selo "Rascunho" no card da busca e na ficha, só quando `is_draft` vem verdadeiro
   (só chega para quem pode ver).

O que NÃO muda: o build SSG (`fetchAllFichaPaths`) e o worker (`fichaPublicada`)
seguem só com `is_listed`. Rascunho não é pré-renderizado nem indexado. Abrir a URL
direto devolve a casca 404 e o app hidrata por cima; validar na implementação que a
ficha renderiza para o testador. Chegar pela busca (navegação no cliente) sempre funciona.

## Remoções

- Rota e página `/manager/companies/:companyId/locations/:locationId/rascunho`,
  `rascunho.test.tsx`, cenário Windup `manager-unidade-rascunho-jornada.json`.
- Link "Testar rascunho" em `locations.tsx`; badge duplo vira só "Rascunho".
- `fetchListingDraft`/`useListingDraft` em `listing/api.ts`.
- Exceção `effectiveRole !== "hub_admin"` no ReservationCard (volta a só `customer`).
- Checkbox `is-draft` em `LocationSections.tsx`.

## Testes

- pgTAP `tester_user.test.sql`: tabela, `is_tester()` (anon false, cliente false,
  testador true, hub_admin true), RPC (não-admin recusa), policy de `location` (testador
  lê rascunho, cliente comum não), as quatro funções abrem para testador.
- `modo_rascunho.test.sql` migra de hub_admin para tester.
- Vitest: select Status com Rascunho (useLocationForm), coluna Testador em Usuários
  (`users/api.test.tsx` cobre `useSetTester`), selo no card.
- Deno: `search` repassa Authorization.
- Guards do CI: mutation nova com teste no mesmo diretório; rota removida some do mapa.

## Rollout

Migration aplicada por mim no vivo, deploy da Edge `search`, commit na `main`. Depois
o Kallef marca `peu+teste1@fera.ag` como testador em Manager › Usuários e faz a compra
de teste na Agência Fera pelo site.
