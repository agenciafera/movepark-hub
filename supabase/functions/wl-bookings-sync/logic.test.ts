import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cursorStuck, readPolicy } from "./logic.ts";

Deno.test("readPolicy: desligada por padrão, limite entre 1 e 500", () => {
  assertEquals(readPolicy(null), { enabled: false, pageLimit: 200 });
  assertEquals(readPolicy({ enabled: "true" }).enabled, false); // só o booleano liga
  assertEquals(readPolicy({ enabled: true, page_limit: 9999 }), { enabled: true, pageLimit: 500 });
  assertEquals(readPolicy({ enabled: true, page_limit: 0 }).pageLimit, 1);
});

Deno.test("cursorStuck: só para quando a página não andou e diz que tem mais", () => {
  const a = { updated_since: "2026-10-01 10:00:00", after_id: 5 };
  assertEquals(cursorStuck(a, { ...a }, true), true);
  assertEquals(cursorStuck(a, { ...a }, false), false); // fim normal: nada novo
  assertEquals(cursorStuck(a, { ...a, after_id: 6 }, true), false);
});
