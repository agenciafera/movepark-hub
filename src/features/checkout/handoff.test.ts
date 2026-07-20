import { describe, expect, it } from "vitest";
import { parseHandoffToken, wantsPayStep } from "./handoff";

describe("parseHandoffToken", () => {
  it("extrai o segredo de #ht=", () => {
    expect(parseHandoffToken("#ht=abc123")).toBe("abc123");
    expect(parseHandoffToken("ht=abc123")).toBe("abc123");
  });

  it("null quando não há ht", () => {
    expect(parseHandoffToken("")).toBeNull();
    expect(parseHandoffToken("#")).toBeNull();
    expect(parseHandoffToken("#pay=1")).toBeNull();
    expect(parseHandoffToken("#ht=")).toBeNull();
  });

  it("convive com outros params no hash", () => {
    expect(parseHandoffToken("#x=1&ht=zzz&y=2")).toBe("zzz");
  });
});

describe("wantsPayStep", () => {
  it("true só com pay=1", () => {
    expect(wantsPayStep("?pay=1")).toBe(true);
    expect(wantsPayStep("?pay=0")).toBe(false);
    expect(wantsPayStep("")).toBe(false);
    expect(wantsPayStep("?foo=bar")).toBe(false);
  });
});
