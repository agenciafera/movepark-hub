import { describe, expect, it } from "vitest";
import { temAvaliacao, temVolumeParaNota } from "@/lib/reviews-volume.mjs";

describe("temAvaliacao", () => {
  it("acende na primeira avaliação, antes do piso da nota", () => {
    expect(temAvaliacao(null)).toBe(false);
    expect(temAvaliacao(undefined)).toBe(false);
    expect(temAvaliacao(0)).toBe(false);
    expect(temAvaliacao(1)).toBe(true);
    // Com uma avaliação o bloco existe, mas a nota média ainda não vira afirmação pública.
    expect(temVolumeParaNota(1)).toBe(false);
  });
});
