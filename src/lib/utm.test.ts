import { afterEach, describe, expect, it } from "vitest";
import { captureUtmFromSearch, getStoredUtm, parseUtm } from "./utm";

afterEach(() => sessionStorage.clear());

describe("parseUtm", () => {
  it("extrai utm presentes", () => {
    expect(parseUtm("?utm_source=google&utm_medium=cpc&utm_campaign=gru")).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "gru",
    });
  });
  it("parcial: só os presentes, resto null", () => {
    expect(parseUtm("?utm_source=meta")).toEqual({
      utm_source: "meta",
      utm_medium: null,
      utm_campaign: null,
    });
  });
  it("sem utm → null", () => {
    expect(parseUtm("?dest=GRU&from=x")).toBeNull();
    expect(parseUtm("")).toBeNull();
  });
});

describe("captura/leitura na sessão", () => {
  it("captura e relê (last-touch sobrescreve)", () => {
    captureUtmFromSearch("?utm_source=google&utm_medium=cpc");
    expect(getStoredUtm()).toEqual({ utm_source: "google", utm_medium: "cpc", utm_campaign: null });
    captureUtmFromSearch("?utm_source=meta&utm_campaign=retarget");
    expect(getStoredUtm()).toEqual({
      utm_source: "meta",
      utm_medium: null,
      utm_campaign: "retarget",
    });
  });
  it("URL sem utm não apaga o que já estava guardado", () => {
    captureUtmFromSearch("?utm_source=google");
    captureUtmFromSearch("?dest=GRU");
    expect(getStoredUtm().utm_source).toBe("google");
  });
  it("sem nada guardado → tudo null", () => {
    expect(getStoredUtm()).toEqual({ utm_source: null, utm_medium: null, utm_campaign: null });
  });
});
