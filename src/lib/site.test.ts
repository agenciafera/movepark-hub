import { describe, expect, it } from "vitest";
import { absoluteUrl, SITE_URL } from "@/lib/site";

describe("absoluteUrl", () => {
  it("mantém URL que já é absoluta", () => {
    const storage =
      "https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/x.webp";
    expect(absoluteUrl(storage)).toBe(storage);
  });

  it("prefixa o host canônico em caminho relativo (capa em public/images/blog)", () => {
    expect(absoluteUrl("/images/blog/km64-viracopos/km64-viracopos.webp")).toBe(
      `${SITE_URL}/images/blog/km64-viracopos/km64-viracopos.webp`,
    );
  });
});
