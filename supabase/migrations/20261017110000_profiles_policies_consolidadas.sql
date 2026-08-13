-- `profiles` tinha quatro policies onde duas bastam, e ficam duas.
--
-- Não era a falha de escalada (essa era grant de coluna, fechada em 20261017103000), mas é a
-- confusão que ajudou a escondê-la: com quatro policies permissivas sobre a mesma tabela, ler
-- "quem pode o quê" exige unir predicados de cabeça, e foi assim que a pergunta "mas a RLS não
-- protege?" passou a ter uma resposta que parecia sim.
--
-- As duas que saem estavam **inteiramente contidas** nas que ficam, então o comportamento efetivo
-- não muda:
--
--   profile_owner_select  USING (id = auth.uid())
--     ⊂ profiles_select   USING (id = auth.uid() OR is_hub_admin())
--
--   profile_owner_update  USING/CHECK (id = auth.uid())
--     ⊂ profiles_update   USING (id = auth.uid() OR is_hub_admin())
--
-- Policy permissiva soma com OR, então a mais larga já respondia por ela.
--
-- Duas coisas ficam explícitas no caminho, e nenhuma muda efeito:
--
--   `TO authenticated`. As duas que ficam valiam para PUBLIC, o que inclui `anon`. Na prática o
--   anônimo já lia zero linha, porque `auth.uid()` é nulo sem sessão e `is_hub_admin()` é falso
--   pelo mesmo motivo. Conferido no vivo antes de mexer: `select` de `profiles` com a anon key
--   devolve `[]`. `service_role` tem BYPASSRLS (também conferido no vivo, devolve linha sem
--   sessão), então as Edges que leem `profiles` com o client de admin seguem intocadas.
--
--   `WITH CHECK` escrito. O `profiles_update` não tinha, e o Postgres reusa o `USING` nesse caso.
--   Escrever deixa de depender de quem lê saber dessa regra.
--
-- **O que continua faltando de propósito:** não existe policy de INSERT nem de DELETE. Perfil
-- nasce pelo trigger de `auth.users` (definer) e some por `anonymize_own_account()` (definer),
-- então `authenticated` não cria nem apaga linha nesta tabela. A ausência é a regra.
--
-- O corte por coluna de 20261017103000 segue valendo por cima disto: a policy diz QUAL LINHA, o
-- grant diz QUAL COLUNA, e é o grant que impede o dono de escrever o próprio `role`.

set search_path = public, pg_temp;

drop policy if exists "profile_owner_select" on public.profiles;
drop policy if exists "profile_owner_update" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;

-- `(select auth.uid())` em vez de `auth.uid()` cru: o Postgres avalia uma vez por consulta em vez
-- de uma vez por linha. É o que a policy de dono já fazia, e a mais larga não.
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_hub_admin());

create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_hub_admin())
  with check (id = (select auth.uid()) or public.is_hub_admin());

comment on policy "profiles_select" on public.profiles is
  'O dono lê a própria linha; hub_admin lê todas (a lista de Usuários do Manager). anon não lê nada.';

comment on policy "profiles_update" on public.profiles is
  'Quem pode escrever em QUAL LINHA. Em QUAIS COLUNAS é grant, não policy: ver 20261017103000, onde role e deleted_at saíram do alcance de authenticated.';
