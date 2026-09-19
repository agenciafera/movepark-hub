import { afterEach, describe, expect, it } from "vitest";
import {
  bookingAttributionPayload,
  captureUtmFromSearch,
  cleanReferrer,
  getStoredAttribution,
  getStoredUtm,
  landingUrl,
  parseUtm,
} from "./utm";

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

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

// E0.3.12: a comissão depende da origem, e a janela é de dias. A prova tem que sobreviver à sessão.
describe("prova da origem (último clique com data)", () => {
  const clique = new Date("2026-09-10T12:00:00Z");

  it("guarda a hora do clique, a página de entrada e o referrer sem query", () => {
    captureUtmFromSearch("?utm_source=abbapark&utm_medium=site&cpf=123", {
      now: clique,
      pathname: "/p/abbapark-gru",
      referrer: "https://abbapark.com.br/reservar?email=x@y.com#topo",
    });
    expect(getStoredAttribution(clique)).toEqual({
      utm_source: "abbapark",
      utm_medium: "site",
      utm_campaign: null,
      clicked_at: "2026-09-10T12:00:00.000Z",
      landing_url: "/p/abbapark-gru?utm_source=abbapark&utm_medium=site",
      referrer: "https://abbapark.com.br/reservar",
    });
  });

  it("sobrevive ao fim da sessão: mora em localStorage", () => {
    captureUtmFromSearch("?utm_source=abbapark", { now: clique, pathname: "/", referrer: "" });
    sessionStorage.clear();
    expect(getStoredUtm(new Date("2026-09-16T12:00:00Z")).utm_source).toBe("abbapark");
  });

  it("o último clique sobrescreve, inclusive a data", () => {
    captureUtmFromSearch("?utm_source=abbapark", { now: clique, pathname: "/", referrer: "" });
    const depois = new Date("2026-09-12T08:00:00Z");
    captureUtmFromSearch("?utm_source=google", { now: depois, pathname: "/search", referrer: "" });
    const a = getStoredAttribution(depois);
    expect(a?.utm_source).toBe("google");
    expect(a?.clicked_at).toBe("2026-09-12T08:00:00.000Z");
  });

  it("descarta o que passou de 30 dias (a janela de verdade quem decide é o servidor)", () => {
    captureUtmFromSearch("?utm_source=abbapark", { now: clique, pathname: "/", referrer: "" });
    expect(getStoredAttribution(new Date("2026-10-09T12:00:00Z"))?.utm_source).toBe("abbapark");
    expect(getStoredAttribution(new Date("2026-10-11T12:00:00Z"))).toBeNull();
    expect(localStorage.getItem("mp_utm")).toBeNull();
  });

  it("registro antigo sem data não vira prova", () => {
    localStorage.setItem("mp_utm", JSON.stringify({ utm_source: "abbapark" }));
    expect(getStoredAttribution()).toBeNull();
    expect(getStoredUtm().utm_source).toBeNull();
  });

  it("lixo no storage não quebra a reserva", () => {
    localStorage.setItem("mp_utm", "{nao-e-json");
    expect(getStoredAttribution()).toBeNull();
  });

  it("cleanReferrer e landingUrl", () => {
    expect(cleanReferrer("nao-e-url")).toBeNull();
    expect(cleanReferrer("")).toBeNull();
    expect(landingUrl(null, { utm_source: "a", utm_medium: null, utm_campaign: null })).toBeNull();
    expect(landingUrl("/x", { utm_source: null, utm_medium: null, utm_campaign: "c" })).toBe("/x?utm_campaign=c");
  });
});

describe("corpo do create-booking", () => {
  it("sem clique guardado: utm nulos e sem prova", () => {
    expect(bookingAttributionPayload()).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      attribution: null,
    });
  });
  it("com clique: utm soltos e a prova num objeto só", () => {
    const clique = new Date("2026-09-10T12:00:00Z");
    captureUtmFromSearch("?utm_source=abbapark", { now: clique, pathname: "/p/x", referrer: "" });
    expect(bookingAttributionPayload(clique)).toEqual({
      utm_source: "abbapark",
      utm_medium: null,
      utm_campaign: null,
      attribution: {
        clicked_at: "2026-09-10T12:00:00.000Z",
        landing_url: "/p/x?utm_source=abbapark",
        referrer: null,
      },
    });
  });
});
