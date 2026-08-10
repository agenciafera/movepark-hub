import { afterEach, describe, expect, it, vi } from "vitest";
import { buildExitClickPayload, sendExitClick } from "./exitClick";

const UTM_VAZIO = { utm_source: null, utm_medium: null, utm_campaign: null };
const LPT = "9f1c4a2e-0000-4000-8000-000000000001";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("buildExitClickPayload", () => {
  it("monta o evento com a vaga, a sessão e as datas em ISO", () => {
    const p = buildExitClickPayload({
      locationParkingTypeId: LPT,
      sessionId: "sess-1",
      from: new Date("2026-09-19T21:00:00Z"),
      to: new Date("2026-09-22T21:00:00Z"),
      utm: UTM_VAZIO,
    });
    expect(p).toEqual({
      p_location_parking_type_id: LPT,
      p_session_id: "sess-1",
      p_check_in_at: "2026-09-19T21:00:00.000Z",
      p_check_out_at: "2026-09-22T21:00:00.000Z",
      p_utm_source: null,
      p_utm_medium: null,
      p_utm_campaign: null,
    });
  });

  it("leva o UTM da sessão, que é como o funil separa canal pago de orgânico", () => {
    const p = buildExitClickPayload({
      locationParkingTypeId: LPT,
      sessionId: "sess-1",
      from: null,
      to: null,
      utm: { utm_source: "google", utm_medium: "cpc", utm_campaign: "gru-agosto" },
    });
    expect(p).toMatchObject({
      p_utm_source: "google",
      p_utm_medium: "cpc",
      p_utm_campaign: "gru-agosto",
    });
  });

  it("não registra nada sem sessão anônima", () => {
    // Sem storage não há dedup nem contagem de visitante distinto. Inventar um id a cada clique
    // inflaria o funil, que é pior do que não medir.
    expect(
      buildExitClickPayload({
        locationParkingTypeId: LPT,
        sessionId: null,
        from: null,
        to: null,
        utm: UTM_VAZIO,
      }),
    ).toBeNull();
  });

  it("não registra nada sem a vaga", () => {
    expect(
      buildExitClickPayload({
        locationParkingTypeId: null,
        sessionId: "sess-1",
        from: null,
        to: null,
        utm: UTM_VAZIO,
      }),
    ).toBeNull();
  });

  it("data inválida vira null em vez de derrubar o clique", () => {
    const p = buildExitClickPayload({
      locationParkingTypeId: LPT,
      sessionId: "sess-1",
      from: new Date("nada disso"),
      to: null,
      utm: UTM_VAZIO,
    });
    expect(p?.p_check_in_at).toBeNull();
    expect(p?.p_check_out_at).toBeNull();
  });

  it("o evento não carrega PII", () => {
    // Trava de desenho, não de implementação: a tabela é anônima de propósito e um campo novo
    // com nome de pessoa aqui é o começo do vazamento. Ver o comentário de `anonSession.ts`.
    const p = buildExitClickPayload({
      locationParkingTypeId: LPT,
      sessionId: "sess-1",
      from: null,
      to: null,
      utm: UTM_VAZIO,
    })!;
    const proibido = ["email", "phone", "name", "cpf", "profile", "user", "ip", "document"];
    const chaves = Object.keys(p).join(" ").toLowerCase();
    for (const termo of proibido) {
      expect(chaves, `campo com "${termo}" no evento de clique`).not.toContain(termo);
    }
  });
});

describe("sendExitClick", () => {
  it("dispara com keepalive, que é o que deixa a requisição sobreviver ao redirect", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("true"));
    sendExitClick({
      p_location_parking_type_id: LPT,
      p_session_id: "sess-1",
      p_check_in_at: null,
      p_check_out_at: null,
      p_utm_source: null,
      p_utm_medium: null,
      p_utm_campaign: null,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/rest/v1/rpc/log_external_exit");
    expect(init?.keepalive).toBe(true);
    expect(init?.method).toBe("POST");
  });

  it("não devolve promessa, para ninguém conseguir dar await antes de navegar", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("true"));
    const r = sendExitClick({
      p_location_parking_type_id: LPT,
      p_session_id: "sess-1",
      p_check_in_at: null,
      p_check_out_at: null,
      p_utm_source: null,
      p_utm_medium: null,
      p_utm_campaign: null,
    });
    expect(r).toBeUndefined();
  });

  it("falha de rede é engolida: métrica não pode quebrar a saída do cliente", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(() =>
      sendExitClick({
        p_location_parking_type_id: LPT,
        p_session_id: "sess-1",
        p_check_in_at: null,
        p_check_out_at: null,
        p_utm_source: null,
        p_utm_medium: null,
        p_utm_campaign: null,
      }),
    ).not.toThrow();
    // Deixa o rejeito ser tratado dentro do `.catch`, senão o Vitest acusa unhandled rejection.
    await Promise.resolve();
  });
});
