import * as React from "react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { server } from "./server";

/**
 * Kit para testar os hooks de mutation das features sem banco, sem navegador e
 * sem sessão.
 *
 * O molde nasceu inline em `src/features/onboarding/leadApi.test.tsx`. Foi
 * fatorado aqui porque são ~100 mutations para cobrir, e repetir wrapper e URL
 * em cada arquivo faz o teste virar boilerplate que ninguém lê.
 *
 * O que este kit prova: o hook bate no endpoint certo, com o payload certo, e
 * propaga o erro do servidor. O que ele NÃO prova: que a RPC existe no banco,
 * que o SECURITY DEFINER faz o que diz, que a RLS barra o não-autorizado. Isso
 * é pgTAP. A divisão é de propósito: MSW prova o contrato do cliente, pgTAP
 * prova o do servidor, e nenhum dos dois precisa de navegador.
 */

const BASE = import.meta.env.VITE_SUPABASE_URL;

/** Espião de chamada: guarda corpo, URL e cabeçalhos de cada requisição capturada. */
export type Espiao = {
  chamadas: { body: unknown; url: string; headers: Headers }[];
  /** Açúcar para o caso comum de uma chamada só. */
  readonly ultimoBody: unknown;
};

function novoEspiao(): Espiao {
  const chamadas: Espiao["chamadas"] = [];
  return {
    chamadas,
    get ultimoBody() {
      return chamadas[chamadas.length - 1]?.body;
    },
  };
}

type Resposta = { status?: number; json?: unknown };

async function corpoDe(request: Request): Promise<unknown> {
  const texto = await request.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

function registra(
  metodo: "post" | "get" | "patch" | "delete",
  url: string,
  resposta: Resposta,
): Espiao {
  const espiao = novoEspiao();
  server.use(
    http[metodo](url, async ({ request }) => {
      espiao.chamadas.push({
        body: await corpoDe(request),
        url: request.url,
        headers: request.headers,
      });
      const status = resposta.status ?? 200;
      if (status === 204) return new HttpResponse(null, { status });
      return HttpResponse.json((resposta.json ?? {}) as never, { status });
    }),
  );
  return espiao;
}

/** RPC do Postgrest: `POST /rest/v1/rpc/<nome>`. */
export const rpc = (nome: string, resposta: Resposta = {}) =>
  registra("post", `${BASE}/rest/v1/rpc/${nome}`, resposta);

/** Tabela do Postgrest. O método escolhe insert (post), update (patch) ou delete. */
export const tabela = (
  nome: string,
  metodo: "post" | "get" | "patch" | "delete" = "post",
  resposta: Resposta = {},
) => registra(metodo, `${BASE}/rest/v1/${nome}`, resposta);

/** Edge Function: `POST /functions/v1/<nome>`. */
export const edge = (nome: string, resposta: Resposta = {}) =>
  registra("post", `${BASE}/functions/v1/${nome}`, resposta);

/** Faz o endpoint responder erro, para provar que o hook propaga a mensagem. */
export const falha = (
  alvo: "rpc" | "edge" | "tabela",
  nome: string,
  status = 500,
  mensagem = "erro do servidor",
) => {
  const url =
    alvo === "edge" ? `${BASE}/functions/v1/${nome}`
    : alvo === "rpc" ? `${BASE}/rest/v1/rpc/${nome}`
    : `${BASE}/rest/v1/${nome}`;
  server.use(
    http.all(url, () => HttpResponse.json({ message: mensagem, error: mensagem }, { status })),
  );
};

/**
 * Renderiza o hook com um QueryClient próprio e devolve também o client, para
 * asserir invalidação de cache quando isso for o ponto do teste.
 */
export function renderMutation<T>(hook: () => T) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(hook, { wrapper });
  return { result, qc };
}
