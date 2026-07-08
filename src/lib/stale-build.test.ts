import { afterEach, describe, expect, it } from "vitest";
import {
  isStaleBuildError,
  shouldReloadForStaleBuild,
} from "./stale-build";

describe("isStaleBuildError", () => {
  it("reconhece o JSON inválido do fallback SPA (HTML onde esperava JSON)", () => {
    // Assinatura exata reportada em produção após deploy.
    const err = new SyntaxError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`);
    expect(isStaleBuildError(err)).toBe(true);
  });

  it("reconhece corpo JSON vazio (ex.: 404 sem corpo)", () => {
    expect(isStaleBuildError(new SyntaxError("Unexpected end of JSON input"))).toBe(true);
  });

  it("reconhece chunk dinâmico com hash antigo que sumiu", () => {
    const err = new TypeError(
      "Failed to fetch dynamically imported module: https://hub.movepark.co/assets/x-OLD.js",
    );
    expect(isStaleBuildError(err)).toBe(true);
  });

  it("aceita erro não-Error (string/objeto) sem quebrar", () => {
    expect(isStaleBuildError("Unexpected token '<'")).toBe(true);
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });

  it("NÃO trata um erro de app comum como build velho", () => {
    expect(isStaleBuildError(new Error("Usuário não autenticado"))).toBe(false);
    expect(isStaleBuildError(new Error("Network request failed"))).toBe(false);
  });
});

describe("shouldReloadForStaleBuild", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("permite o primeiro reload e registra o momento", () => {
    expect(shouldReloadForStaleBuild(1_000)).toBe(true);
  });

  it("bloqueia um segundo reload dentro do cooldown (evita loop)", () => {
    expect(shouldReloadForStaleBuild(1_000)).toBe(true);
    // 5s depois — ainda dentro do cooldown de 30s
    expect(shouldReloadForStaleBuild(6_000)).toBe(false);
  });

  it("permite recarregar de novo depois que o cooldown passa", () => {
    expect(shouldReloadForStaleBuild(1_000)).toBe(true);
    // 31s depois — cooldown expirou
    expect(shouldReloadForStaleBuild(32_000)).toBe(true);
  });
});
