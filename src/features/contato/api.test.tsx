import * as React from "react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { useEnviarContato } from "./api";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-contact-message`;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const payload = {
  name: "Ana Souza",
  email: "ana@exemplo.com",
  message: "Preciso mudar a data da minha reserva em Guarulhos.",
};

describe("useEnviarContato", () => {
  it("faz POST e devolve o resultado no sucesso", async () => {
    let recebido: Record<string, unknown> | null = null;
    server.use(
      http.post(URL, async ({ request }) => {
        recebido = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, id: "m1" }, { status: 201 });
      }),
    );

    const { result } = renderHook(() => useEnviarContato(), { wrapper });
    const res = await result.current.mutateAsync(payload);

    expect(res).toEqual({ ok: true, id: "m1" });
    expect(recebido!.name).toBe("Ana Souza");
    expect(recebido!.message).toBe(payload.message);
  });

  /** A função é pública: sem o bearer o gateway recusa antes de chegar no código. */
  it("manda apikey e Authorization, que é o que o gateway exige", async () => {
    let headers: Headers | null = null;
    server.use(
      http.post(URL, ({ request }) => {
        headers = request.headers;
        return HttpResponse.json({ ok: true, id: "m1" }, { status: 201 });
      }),
    );

    const { result } = renderHook(() => useEnviarContato(), { wrapper });
    await result.current.mutateAsync(payload);

    expect(headers!.get("apikey")).toBeTruthy();
    expect(headers!.get("authorization")).toMatch(/^Bearer /);
  });

  /**
   * A Edge devolve mensagem pronta para a tela nos casos de validação. Se o hook
   * engolisse isso e trocasse por texto genérico, o visitante veria "tente de
   * novo" quando o problema era o e-mail dele.
   */
  it("propaga a mensagem de erro que a Edge devolveu", async () => {
    server.use(
      http.post(URL, () => HttpResponse.json({ error: "E-mail inválido." }, { status: 400 })),
    );

    const { result } = renderHook(() => useEnviarContato(), { wrapper });
    await expect(result.current.mutateAsync(payload)).rejects.toThrow("E-mail inválido.");
  });

  /** Erro sem corpo (502 do gateway) ainda precisa dizer algo. */
  it("erro sem mensagem cai num texto que serve para a tela", async () => {
    server.use(http.post(URL, () => new HttpResponse(null, { status: 502 })));

    const { result } = renderHook(() => useEnviarContato(), { wrapper });
    await expect(result.current.mutateAsync(payload)).rejects.toThrow(/tente de novo/i);
  });

  /**
   * Regressão vista no navegador: com a função fora do ar o `fetch` lança um
   * TypeError cru, e o visitante lia "Failed to fetch" na tela.
   */
  it("falha de rede não vaza o texto do navegador", async () => {
    server.use(http.post(URL, () => HttpResponse.error()));

    const { result } = renderHook(() => useEnviarContato(), { wrapper });
    await expect(result.current.mutateAsync(payload)).rejects.toThrow(/tente de novo/i);
    await expect(result.current.mutateAsync(payload)).rejects.not.toThrow(/failed to fetch/i);
  });
});
