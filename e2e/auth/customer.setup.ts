import { test as setup } from "@playwright/test";
import { signInAs, CUSTOMER_STATE } from "../support/session";
import { env } from "../support/env";

setup("mint da sessão do customer (consumidor)", async ({ page, context }) => {
  await signInAs(page, env.customerEmail);
  await context.storageState({ path: CUSTOMER_STATE });
});
