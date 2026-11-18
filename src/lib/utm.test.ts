import { afterEach, describe, expect, it } from "vitest";
import {
  bookingAttributionPayload,
  captureAttribution,
  classifyReferrer,
  cleanReferrer,
  getStoredAttribution,
  getStoredReferrals,
  getStoredUtm,
  landingUrl,
  MAX_REFERRALS,
  parseUtm,
  resetArrivalForTest,
} from "./utm";
import { siteUrl } from "@/lib/site";

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetArrivalForTest();
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
    captureAttribution("?utm_source=google&utm_medium=cpc");
    expect(getStoredUtm()).toEqual({ utm_source: "google", utm_medium: "cpc", utm_campaign: null });
    captureAttribution("?utm_source=meta&utm_campaign=retarget");
    expect(getStoredUtm()).toEqual({
      utm_source: "meta",
      utm_medium: null,
      utm_campaign: "retarget",
    });
  });
  it("URL sem utm não apaga o que já estava guardado", () => {
    captureAttribution("?utm_source=google");
    captureAttribution("?dest=GRU");
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
    captureAttribution("?utm_source=abbapark&utm_medium=site&cpf=123", {
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
    captureAttribution("?utm_source=abbapark", { now: clique, pathname: "/", referrer: "" });
    sessionStorage.clear();
    expect(getStoredUtm(new Date("2026-09-16T12:00:00Z")).utm_source).toBe("abbapark");
  });

  it("o último clique sobrescreve, inclusive a data", () => {
    captureAttribution("?utm_source=abbapark", { now: clique, pathname: "/", referrer: "" });
    const depois = new Date("2026-09-12T08:00:00Z");
    captureAttribution("?utm_source=google", { now: depois, pathname: "/search", referrer: "" });
    const a = getStoredAttribution(depois);
    expect(a?.utm_source).toBe("google");
    expect(a?.clicked_at).toBe("2026-09-12T08:00:00.000Z");
  });

  it("descarta o que passou de 30 dias (a janela de verdade quem decide é o servidor)", () => {
    captureAttribution("?utm_source=abbapark", { now: clique, pathname: "/", referrer: "" });
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

// 18/11/2026: a regra também reconhece o site de onde o cliente veio, com ou sem UTM.
describe("site de origem", () => {
  const dia = (d: number) => new Date(Date.UTC(2026, 10, d, 12));

  it("classifica o referrer: outro site vale, o próprio site e a volta do login não", () => {
    expect(classifyReferrer("https://pareseguro.com/?x=1", "localhost")).toEqual({
      kind: "external",
      referrer: "https://pareseguro.com/",
    });
    expect(classifyReferrer(siteUrl("/login"), "localhost").kind).toBe("internal");
    expect(classifyReferrer("http://localhost:5173/busca", "localhost").kind).toBe("internal");
    expect(classifyReferrer("https://accounts.google.com/", "localhost").kind).toBe("internal");
    expect(classifyReferrer("https://abcdefgh.supabase.co/auth/v1/callback", "localhost").kind).toBe("internal");
    expect(classifyReferrer("https://api.pagar.me/x", "localhost").kind).toBe("internal");
    expect(classifyReferrer("", "localhost").kind).toBe("none");
    expect(classifyReferrer("javascript:alert(1)", "localhost").kind).toBe("none");
  });

  it("chegada sem UTM vinda de outro site entra na lista e não mexe no clique guardado", () => {
    captureAttribution("?utm_source=google", { now: dia(10), pathname: "/", referrer: "" });
    captureAttribution("", { now: dia(11), pathname: "/p/gru/pare-seguro", referrer: "https://pareseguro.com/" });
    expect(getStoredUtm(dia(11)).utm_source).toBe("google");
    expect(getStoredReferrals(dia(11))).toEqual([
      { referrer: "https://pareseguro.com/", arrived_at: dia(11).toISOString(), landing_url: "/p/gru/pare-seguro" },
    ]);
  });

  it("chegada do próprio site, do login ou sem referrer não entra", () => {
    captureAttribution("", { now: dia(11), pathname: "/", referrer: siteUrl("/busca") });
    captureAttribution("", { now: dia(11), pathname: "/", referrer: "https://accounts.google.com/" });
    captureAttribution("", { now: dia(11), pathname: "/", referrer: "" });
    expect(getStoredReferrals(dia(11))).toEqual([]);
  });

  it("um clique com UTM descarta as chegadas de antes dele (último clique)", () => {
    captureAttribution("", { now: dia(10), pathname: "/", referrer: "https://pareseguro.com/" });
    captureAttribution("?utm_source=google", { now: dia(11), pathname: "/", referrer: "" });
    expect(getStoredReferrals(dia(11))).toEqual([]);
  });

  it("a mesma origem não se repete, a mais nova vem primeiro e a lista tem teto", () => {
    captureAttribution("", { now: dia(1), pathname: "/", referrer: "https://pareseguro.com/" });
    for (let i = 2; i <= 8; i++) {
      captureAttribution("", { now: dia(i), pathname: "/", referrer: `https://site${i}.com/` });
    }
    captureAttribution("", { now: dia(9), pathname: "/", referrer: "https://www.google.com/" });
    const r = getStoredReferrals(dia(9));
    expect(r).toHaveLength(MAX_REFERRALS);
    expect(r[0].referrer).toBe("https://www.google.com/");
    expect(r.map((x) => x.referrer)).not.toContain("https://pareseguro.com/");
  });

  it("chegada vencida some da lista", () => {
    captureAttribution("", { now: dia(1), pathname: "/", referrer: "https://pareseguro.com/" });
    expect(getStoredReferrals(new Date(Date.UTC(2026, 11, 2, 12)))).toEqual([]);
  });

  it("voltar do login com o mesmo UTM não troca a prova do clique", () => {
    captureAttribution("?utm_source=google&utm_campaign=gru-marca", {
      now: dia(10),
      pathname: "/p/x",
      referrer: "https://pareseguro.com/",
    });
    captureAttribution("?utm_source=google&utm_campaign=gru-marca", {
      now: dia(11),
      pathname: "/p/x",
      referrer: "https://accounts.google.com/",
    });
    const a = getStoredAttribution(dia(11));
    expect(a?.referrer).toBe("https://pareseguro.com/");
    expect(a?.clicked_at).toBe(dia(10).toISOString());
  });

  it("o mesmo link aberto de novo sem referrer renova a data e mantém o site da primeira vez", () => {
    captureAttribution("?utm_source=pareseguro", { now: dia(10), pathname: "/", referrer: "https://pareseguro.com/" });
    captureAttribution("?utm_source=pareseguro", { now: dia(12), pathname: "/", referrer: "" });
    const a = getStoredAttribution(dia(12));
    expect(a?.clicked_at).toBe(dia(12).toISOString());
    expect(a?.referrer).toBe("https://pareseguro.com/");
  });

  it("o referrer do documento só vale na primeira captura da página", () => {
    Object.defineProperty(document, "referrer", { value: "https://pareseguro.com/", configurable: true });
    try {
      captureAttribution("", { now: dia(10), pathname: "/" });
      captureAttribution("?dest=GRU", { now: dia(11), pathname: "/busca" });
      expect(getStoredReferrals(dia(11))).toEqual([
        { referrer: "https://pareseguro.com/", arrived_at: dia(10).toISOString(), landing_url: "/" },
      ]);
    } finally {
      delete (document as unknown as Record<string, unknown>).referrer;
    }
  });

  it("lixo na lista não quebra a reserva", () => {
    localStorage.setItem("mp_ref", "{quebrado");
    expect(getStoredReferrals()).toEqual([]);
    localStorage.setItem("mp_ref", JSON.stringify([{ referrer: "javascript:x", arrived_at: "2026-11-10" }, "x", null]));
    expect(getStoredReferrals(dia(11))).toEqual([]);
  });
});

describe("corpo do create-booking", () => {
  it("só com chegada de outro site: utm nulos e a chegada na prova", () => {
    captureAttribution("", { now: new Date("2026-11-17T12:00:00Z"), pathname: "/p/x", referrer: "https://pareseguro.com/" });
    expect(bookingAttributionPayload(new Date("2026-11-18T12:00:00Z"))).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      attribution: {
        clicked_at: null,
        landing_url: null,
        referrer: null,
        referrals: [{ referrer: "https://pareseguro.com/", arrived_at: "2026-11-17T12:00:00.000Z", landing_url: "/p/x" }],
      },
    });
  });

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
    captureAttribution("?utm_source=abbapark", { now: clique, pathname: "/p/x", referrer: "" });
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
