import { describe, expect, it } from "vitest";
import { userInitials } from "./initials";

describe("userInitials", () => {
  it("usa primeiro + último do nome completo", () => {
    expect(userInitials("Diego Guedes", "diego@fera.ag")).toBe("DG");
    expect(userInitials("Ana Paula Souza")).toBe("AS");
  });

  it("um nome só vira uma letra", () => {
    expect(userInitials("Diego")).toBe("D");
  });

  it("sem nome, cai pro e-mail", () => {
    expect(userInitials(null, "diego@fera.ag")).toBe("D");
    expect(userInitials("", "peu@fera.ag")).toBe("P");
  });

  it("sem nada vira ?", () => {
    expect(userInitials()).toBe("?");
    expect(userInitials("", "")).toBe("?");
  });
});
