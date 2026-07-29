import { test as setup } from "@playwright/test";
import { signInAs, OPERATOR_STATE } from "../support/session";
import { env } from "../support/env";

setup("mint da sessão do operator (Mercy)", async ({ page, context }) => {
  await signInAs(page, env.operatorEmail);
  await context.storageState({ path: OPERATOR_STATE });
});
