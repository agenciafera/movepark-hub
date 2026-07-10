import { describe, expect, it } from "vitest";
import { postLoginPath, postLogoutPath } from "./postLoginRedirect";

describe("postLoginPath", () => {
  it("honra o next pretendido para qualquer role", () => {
    expect(postLoginPath("customer", "/checkout/abc")).toBe("/checkout/abc");
    expect(postLoginPath("hub_admin", "/p/x/y/z")).toBe("/p/x/y/z");
    expect(postLoginPath("company_operator", "/conta")).toBe("/conta");
  });

  it("manda hub_admin para /manager sem next", () => {
    expect(postLoginPath("hub_admin", null)).toBe("/manager");
  });

  it("manda company_operator para /operator sem next", () => {
    expect(postLoginPath("company_operator", null)).toBe("/operator");
  });

  it("manda customer para / sem next", () => {
    expect(postLoginPath("customer", null)).toBe("/");
  });

  it("cai em / quando o role ainda não carregou e não há next", () => {
    expect(postLoginPath(null, null)).toBe("/");
  });

  it("ignora next inseguro (open redirect) e usa o default do role", () => {
    // protocol-relative e absolutos não são honrados
    expect(postLoginPath("customer", "//evil.com")).toBe("/");
    expect(postLoginPath("hub_admin", "//evil.com")).toBe("/manager");
    expect(postLoginPath("customer", "https://evil.com")).toBe("/");
    expect(postLoginPath("customer", "/\\evil.com")).toBe("/");
    expect(postLoginPath("company_operator", "javascript:alert(1)")).toBe("/operator");
  });
});

describe("postLogoutPath", () => {
  it("consumidor (customer) volta pra home", () => {
    expect(postLogoutPath("customer")).toBe("/");
  });

  it("anônimo/sem papel volta pra home", () => {
    expect(postLogoutPath(null)).toBe("/");
  });

  it("backoffice (hub_admin e company_operator) vai pro login", () => {
    expect(postLogoutPath("hub_admin")).toBe("/login");
    expect(postLogoutPath("company_operator")).toBe("/login");
  });
});
