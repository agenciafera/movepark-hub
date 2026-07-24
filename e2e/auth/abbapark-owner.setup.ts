import { test as setup } from "@playwright/test";
import { signInAs, ABBAPARK_OWNER_STATE } from "../support/session";
import { env } from "../support/env";

/**
 * Minta a sessão do DONO do Abbapark (peu+operador@fera.ag).
 *
 * O `signInAs` aceita qualquer e-mail que exista em `auth.users`; não há nada
 * preso à fixture Mercy. O usuário já é `owner` da company Abbapark em
 * `profile_company` e tem `profile.role = company_operator`, então cai direto no
 * `/operator` com escopo total.
 */
setup("mint da sessão do dono (Abbapark)", async ({ page, context }) => {
  await signInAs(page, env.abbaparkOwnerEmail);
  await context.storageState({ path: ABBAPARK_OWNER_STATE });
});
