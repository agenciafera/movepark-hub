import * as React from "react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { server } from "@/test/msw/server";
import { useSubmitLead } from "./leadApi";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-partner-lead`;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const payload = {
  company_name: "Estac X",
  contact_name: "Op",
  contact_email: "op@x.com",
  contact_phone: "+5511999990000",
  accept_terms: true,
};

describe("useSubmitLead", () => {
  it("faz POST e retorna o resultado em caso de sucesso", async () => {
    let received: Record<string, unknown> | null = null;
    server.use(
      http.post(URL, async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, company_id: "c1" }, { status: 201 });
      }),
    );
    const { result } = renderHook(() => useSubmitLead(), { wrapper });
    const res = await result.current.mutateAsync(payload);
    expect(res).toEqual({ ok: true, company_id: "c1" });
    expect(received!.company_name).toBe("Estac X");
    expect(received!.accept_terms).toBe(true);
  });

  it("propaga a mensagem de erro do servidor (409)", async () => {
    server.use(
      http.post(URL, () => HttpResponse.json({ error: "Este e-mail já pertence a um parceiro ativo." }, { status: 409 })),
    );
    const { result } = renderHook(() => useSubmitLead(), { wrapper });
    await expect(result.current.mutateAsync(payload)).rejects.toThrow(
      "Este e-mail já pertence a um parceiro ativo.",
    );
  });

  it("trata 'já recebemos' (200 already_submitted) como sucesso", async () => {
    server.use(http.post(URL, () => HttpResponse.json({ ok: true, already_submitted: true })));
    const { result } = renderHook(() => useSubmitLead(), { wrapper });
    const res = await result.current.mutateAsync(payload);
    expect(res.already_submitted).toBe(true);
  });
});
