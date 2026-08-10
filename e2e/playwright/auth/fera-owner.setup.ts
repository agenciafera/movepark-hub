import { test as setup } from "@playwright/test";
import { signInAs, FERA_OWNER_STATE } from "../support/session";
import { env } from "../support/env";

/**
 * Minta a sessão do DONO da Agência Fera (peu+agenciafera@fera.ag).
 *
 * O `signInAs` aceita qualquer e-mail que exista em `auth.users`; não há nada
 * preso à fixture Mercy. O usuário já é `owner` da company Agência Fera em
 * `profile_company` e tem `profile.role = company_operator`, então cai direto no
 * `/operator` com escopo total.
 */
setup("mint da sessão do dono (Agência Fera)", async ({ page, context }) => {
  await signInAs(page, env.feraOwnerEmail);
  await context.storageState({ path: FERA_OWNER_STATE });
});
