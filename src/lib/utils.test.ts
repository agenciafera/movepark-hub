import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("junta classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("ignora falsy (clsx)", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });
  it("resolve conflito de Tailwind mantendo o último (twMerge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-red-500", "text-lg")).toBe("text-red-500 text-lg");
  });
});
