import { test as setup } from "@playwright/test";
import { signInAs, MANAGER_STATE } from "../support/session";
import { env } from "../support/env";

setup("mint da sessão do manager (hub_admin)", async ({ page, context }) => {
  await signInAs(page, env.managerEmail);
  await context.storageState({ path: MANAGER_STATE });
});
