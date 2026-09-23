# Link de acesso ao Recebimento

> Épico: venda pelo Hub, piloto BePark (plano `docs/superpowers/plans/2026-09-23-venda-pelo-hub-e-beneficios.md`, bloco C).
> Decidido em 23/09/2026 com o Kallef: sem prazo em dias; o link morre quando a empresa termina.

## O problema

Para vender pelo Hub, a empresa precisa de recebedor no gateway (KYC) e de contrato aceito, e as
duas coisas moram em `/operator/recebimento`, que exige login como membro da empresa. Um parceiro
mapeado pela Movepark não tem usuário nenhum: ninguém dele consegue entrar para preencher. O
convite por e-mail (`invite-company-member`) resolve o vínculo, mas o magic link vale 10 minutos
(`mailer_otp_exp`), e o time queria um link para mandar no WhatsApp, reabrir quando o dono
travar no meio, e copiar de dentro do Manager.

## O que é

Um link por empresa, `https://movepark.co/acesso/<segredo>`, gerado pelo Manager na tela
**Financeiro › Recebedores** (botão "Link de acesso", nas empresas sem KYC). Quem abre entra
**logado como Dono** da empresa e cai em `/operator/recebimento`.

- **Sem prazo em dias.** Vale até a empresa terminar o Recebimento (conta de repasse enviada
  **e** contrato aceito: `company_access_link_done`) ou até o Manager revogar. Reutilizável de
  propósito: o dono pode voltar no mesmo link.
- **Um link vivo por empresa.** Gerar outro revoga o anterior.
- **A URL pode ser copiada de novo** a qualquer hora no diálogo: o segredo fica em
  `company_access_link.token_secret`, legível só por hub_admin (RLS) e pelo service_role. O hash
  (sha256) e o prefixo indexável, no molde do `checkout_handoff`, continuam sendo o que o resgate
  compara. Decidido em 23/09/2026: guardar só o hash obrigava a gerar outro link a cada cópia.
- **Cada abertura fica registrada** (`use_count`, `last_used_at`), e o diálogo mostra.
- **É credencial.** Quem tem o link entra como Dono. Por isso não vai em página indexável
  (`/acesso` está em `ROTAS_PRIVADAS` do worker e em `PRIVADOS` do sitemap) e o Manager revoga
  com um clique.

## Como funciona

1. **Gerar** (`create-company-access-link`, JWT de hub_admin): cria o usuário do dono com o e-mail
   informado (`generateLink` invite, ou magiclink se já existe; nenhum e-mail sai), promove o
   perfil a `company_operator` sem rebaixar hub_admin, faz upsert em `profile_company` como
   `owner`, revoga links vivos da empresa, grava `company_access_link` e devolve `{ id, url, email }`.
   Recusa com 409 se a empresa já terminou.
2. **Abrir** (`/acesso/:token`, página pública): chama `redeem-company-access-link` com o segredo.
3. **Resgatar** (`redeem-company-access-link`, anon): RPC `company_access_link_redeem(prefixo, hash)`
   valida, conta o uso e devolve quem entra. A Edge gera um magic link para esse e-mail e o troca
   por sessão na hora (`verifyOtp` com `token_hash`), sem sessão em repouso, e responde
   `{ access_token, refresh_token, next }`. O front faz `setSession` e navega para o `next`.
   Recusa com 410 e `reason: "invalid" | "done"`; a página explica e oferece o login por e-mail.
4. **Revogar** (`company_access_link_revoke`, hub_admin) ou deixar morrer sozinho.

## Banco

`supabase/migrations/20261123170000_link_de_acesso_ao_recebimento.sql`: tabela
`company_access_link` (RLS: hub_admin lê; escrita só pelas Edges com service_role) e
`20261123180000_link_de_acesso_guarda_url.sql` (coluna `token_secret`),
`company_access_link_done(uuid)`, `company_access_link_redeem(text, text)` (service_role) e
`company_access_link_revoke(uuid)` (hub_admin). pgTAP `company_access_link.test.sql` (14).

## Front

- `src/routes/acesso.tsx` (resgate), `src/features/payouts/AccessLinkDialog.tsx` (Manager),
  `accessLink.logic.ts` (estado do link, mensagem pronta para o WhatsApp), hooks em
  `payouts/api.ts` (`useCompanyAccessLinks`, `useCompanyContactEmail`, `useCreateCompanyAccessLink`,
  `useRevokeCompanyAccessLink`).
- O e-mail vem pré-preenchido com o contato da unidade (`location.email`), e é com ele que o dono
  entra depois pelo login normal (código por e-mail).

## O que não é

- Não é convite de equipe: para Gerente, Operação e Financeiro continua o convite por e-mail.
- Não substitui a verificação da Movepark: o recebedor só fica ativo quando a equipe cria e
  sincroniza no gateway (`sync-recipient`), como antes.
