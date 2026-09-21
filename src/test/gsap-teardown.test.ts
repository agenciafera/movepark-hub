import { afterEach, expect, it, vi } from "vitest";
import "@/lib/gsap";
import { disableScrollTriggerIfLoaded } from "./gsap-teardown";

afterEach(() => {
  vi.restoreAllMocks();
});

// Regressão do flake que reprovava `quality` e `coverage` com a suíte inteira verde: o intervalo
// de sincronia do ScrollTrigger sobrevivia ao teardown e chamava um `requestAnimationFrame` que
// não existia mais.
it("depois da limpeza, o ScrollTrigger não agenda mais requestAnimationFrame", async () => {
  await disableScrollTriggerIfLoaded();

  const raf = vi.spyOn(globalThis, "requestAnimationFrame");
  // O intervalo do GSAP é de 250 ms: 600 ms cobrem dois disparos com folga.
  await new Promise((resolve) => setTimeout(resolve, 600));

  expect(raf).not.toHaveBeenCalled();
});
