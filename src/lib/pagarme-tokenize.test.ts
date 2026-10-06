import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { detectBrand, tokenizeCard, TokenizeError } from "./pagarme-tokenize";

afterEach(() => server.resetHandlers());

describe("detectBrand", () => {
  it("identifica visa/master/amex/elo", () => {
    expect(detectBrand("4111111111111111")).toBe("visa");
    expect(detectBrand("5555555555554444")).toBe("mastercard");
    expect(detectBrand("378282246310005")).toBe("amex");
  });
});

describe("tokenizeCard", () => {
  it("tokeniza no Pagar.me e devolve token + brand + last4 (PAN não vai ao nosso backend)", async () => {
    let capturedUrl = "";
    server.use(
      http.post("https://api.pagar.me/core/v5/tokens", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ id: "token_abc123" });
      }),
    );

    const r = await tokenizeCard("pk_test_x", {
      number: "4111 1111 1111 1111",
      holder_name: "Tony Stark",
      exp_month: 12,
      exp_year: 2030,
      cvv: "123",
    });
    expect(r.token).toBe("token_abc123");
    expect(r.brand).toBe("visa");
    expect(r.last4).toBe("1111");
    // a chamada vai pro Pagar.me com a public key no appId — não pro Supabase
    expect(capturedUrl).toContain("appId=pk_test_x");
  });

  it("erro de validação → mensagem amigável", async () => {
    server.use(
      http.post("https://api.pagar.me/core/v5/tokens", () => new HttpResponse(null, { status: 422 })),
    );
    await expect(
      tokenizeCard("pk_test_x", { number: "4111111111111111", holder_name: "X", exp_month: 1, exp_year: 2030, cvv: "1" }),
    ).rejects.toThrow(/cartão/i);
  });

  it("falha guarda o status e o motivo da Pagar.me, sem dado do cartão", async () => {
    server.use(
      http.post("https://api.pagar.me/core/v5/tokens", () =>
        HttpResponse.json(
          {
            message: "The request is invalid.",
            errors: { "card.number": ["The field number must be a string with a minimum length of 13."] },
            request: { type: "card", card: { holder_name: "Tony Stark", exp_month: 1 } },
          },
          { status: 422 },
        ),
      ),
    );
    const err = await tokenizeCard("pk_test_x", {
      number: "4111111111111111",
      holder_name: "Tony Stark",
      exp_month: 1,
      exp_year: 2030,
      cvv: "123",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(TokenizeError);
    expect(err.httpStatus).toBe(422);
    expect(err.diagnostic).toEqual({
      gateway_message: "The request is invalid.",
      fields: ["card.number"],
    });
    expect(JSON.stringify(err.diagnostic)).not.toMatch(/4111|Tony/);
  });

  it("falha de rede (bloqueio, CORS, sem sinal) vira status 0", async () => {
    server.use(http.post("https://api.pagar.me/core/v5/tokens", () => HttpResponse.error()));
    const err = await tokenizeCard("pk_test_x", {
      number: "4111111111111111",
      holder_name: "X",
      exp_month: 1,
      exp_year: 2030,
      cvv: "123",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(TokenizeError);
    expect(err.httpStatus).toBe(0);
    expect(err.message).toMatch(/conexão/i);
  });

  it("public key ausente → erro", async () => {
    await expect(
      tokenizeCard("", { number: "4111111111111111", holder_name: "X", exp_month: 1, exp_year: 2030, cvv: "1" }),
    ).rejects.toThrow(/indisponível/i);
  });
});
