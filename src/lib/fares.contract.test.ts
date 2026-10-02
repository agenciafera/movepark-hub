import { describe, expect, it } from "vitest";
import { cancelWindowLabel, FARE_BENEFIT_LABELS } from "./fares";

/**
 * Os rótulos das tarifas têm duas cópias, e este teste as solda.
 *
 * `src/lib/fares.ts` é a fonte única da promessa no site. O agente de WhatsApp lê as tarifas pela
 * tool `list_fares`, que roda no Deno e não importa do front: por isso existe o espelho em
 * `supabase/functions/_shared/fares.ts`. Se a copy mudar só de um lado, o agente promete uma
 * coisa e o site mostra outra.
 */

// Caminho em variável: o import fica fora do projeto do tsc e o Vite resolve em tempo de teste.
const ESPELHO = "../../supabase/functions/_shared/fares.ts";

describe("tarifas: espelho do Deno igual ao site", () => {
  it("mesmos benefícios, na mesma ordem, com o mesmo rótulo", async () => {
    const deno = await import(/* @vite-ignore */ ESPELHO);
    expect(deno.FARE_BENEFIT_LABELS).toEqual(FARE_BENEFIT_LABELS);
  });

  it("mesma janela de cancelamento em texto", async () => {
    const deno = await import(/* @vite-ignore */ ESPELHO);
    for (const m of [null, undefined, 0, 1, 30, 59, 60, 90, 120, 1440, 2880, 1500]) {
      expect(deno.cancelWindowLabel(m), String(m)).toBe(cancelWindowLabel(m));
    }
  });
});
