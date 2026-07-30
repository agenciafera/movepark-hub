import { describe, expect, it } from "vitest";
import {
  errorMessage,
  JSONRPC,
  MCP_BASE,
  rpc,
  toolNames,
  toolPayload,
  TRANSACTIONAL_NAMES,
} from "../support/mcp";

// Contrato das três superfícies do MCP contra o ambiente vivo. Automatiza os cenários F1 a F5 de
// docs/specs/customer/agent-test-scenarios.md §9, que eram rodados à mão com curl.
// Ver docs/specs/mcp.md.

describe("MCP · handshake e protocolo", () => {
  it("initialize devolve versão de protocolo e identidade do servidor", async () => {
    const r = await rpc("", "initialize", {});
    expect(r.result?.protocolVersion).toBeTruthy();
    expect(r.result?.serverInfo?.name).toBe("movepark");
    expect(r.result?.capabilities).toBeTruthy();
  });

  it("método desconhecido devolve -32601", async () => {
    const r = await rpc("", "nao/existe");
    expect(r.error?.code).toBe(JSONRPC.METHOD_NOT_FOUND);
  });

  it("tool desconhecida devolve -32602 (e não 500)", async () => {
    const r = await rpc("", "tools/call", { name: "tool_que_nao_existe", arguments: {} });
    expect(r.error?.code).toBe(JSONRPC.INVALID_PARAMS);
  });

  it("parâmetro obrigatório ausente é recusado antes de executar a tool", async () => {
    const r = await rpc("", "tools/call", { name: "search_knowledge", arguments: {} });
    expect(r.error?.code).toBe(JSONRPC.INVALID_PARAMS);
    expect(r.error?.message).toMatch(/query/i);
  });
});

// F1 · a superfície pública é só descoberta. O risco que este teste cobre não é "faltou uma tool",
// é o oposto: uma tool de ESCRITA vazar para o anônimo.
describe("MCP público · só leitura", () => {
  it("expõe tools de descoberta e nenhuma transacional", async () => {
    const names = await toolNames("");
    expect(names).toContain("search_parking");
    expect(names).toContain("simulate_price");
    expect(names).toContain("get_faq");
    expect(names).toContain("search_knowledge");
    for (const txn of TRANSACTIONAL_NAMES) {
      expect(names, `tool transacional vazou no público: ${txn}`).not.toContain(txn);
    }
  });

  // F2 · filtro por empresa (o bug corrigido em 7b1839f: o bot dizia não saber onde a empresa atua)
  it("list_locations com company devolve só as unidades daquela empresa", async () => {
    const r = await rpc("", "tools/call", {
      name: "list_locations",
      arguments: { company: "aerovalet" },
    });
    const rows = toolPayload<Array<{ company?: { slug?: string; name?: string } }>>(r);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.company?.slug ?? row.company?.name?.toLowerCase()).toMatch(/aerovalet/);
    }
  });
});

// F3/F4 · a superfície de consumidor. A identidade vem do JWT; sem token, nada de escrita.
describe("MCP consumidor · gates de sessão e de escopo", () => {
  it("F3 · transacional sem JWT é recusada, sem criar nada", async () => {
    const r = await rpc("/customer", "tools/call", {
      name: "create_booking",
      arguments: {
        location_parking_type_id: "00000000-0000-0000-0000-000000000000",
        check_in_at: "2026-12-01T10:00:00Z",
        check_out_at: "2026-12-03T10:00:00Z",
      },
    });
    expect(r.result?.isError ?? !!r.error).toBe(true);
    expect(errorMessage(r)).toMatch(/login|sess(ã|a)o/i);
  });

  // F4 · escopo de plataforma (ADR-005). Esconder no tools/list não basta: a chamada tem que ser
  // barrada também. Cobre a proteção contra fixação de sessão do create_checkout_link.
  it("F4 · create_checkout_link não aparece nem é chamável sem chave de plataforma", async () => {
    const names = await toolNames("/customer");
    expect(names).not.toContain("create_checkout_link");

    const r = await rpc("/customer", "tools/call", {
      name: "create_checkout_link",
      arguments: { booking_code: "MP-000000" },
    });
    expect(r.error?.code, "tool de plataforma tem que ser inchamável, não só oculta").toBe(
      JSONRPC.INVALID_PARAMS,
    );
  });

  it("oferece as tools de login e as de leitura (o registro é compartilhado)", async () => {
    const [pub, cust] = await Promise.all([toolNames(""), toolNames("/customer")]);
    for (const t of pub) {
      expect(cust, `leitura ${t} deveria existir no /customer`).toContain(t);
    }
    expect(cust).toContain("request_login_otp");
    expect(cust).toContain("verify_login_otp");
    expect(cust).toContain("whoami");
  });
});

// F5 · a superfície de parceiro é B2B: exige chave mp_ de empresa.
describe("MCP parceiro · exige chave", () => {
  it("F5 · sem chave, recusa o tools/list", async () => {
    const r = await rpc("/partner", "tools/list");
    expect(r.error?.code).toBe(JSONRPC.INVALID_REQUEST);
    expect(r.error?.message).toMatch(/chave/i);
  });

  it("chave inválida não vira sessão de parceiro", async () => {
    const r = await rpc("/partner", "tools/list", undefined, {
      Authorization: "Bearer mp_chave_que_nao_existe",
    });
    expect(r.result?.tools, "chave inválida não pode listar tools").toBeUndefined();
    expect(r.error?.code).toBe(JSONRPC.INVALID_REQUEST);
  });
});

it("guard: a base testada é explícita (evita passar verde contra localhost por engano)", () => {
  expect(MCP_BASE).toMatch(/^https?:\/\//);
});

// Guarda do guarda. A proteção "nenhuma transacional no público" usa `not.toContain`: um nome
// digitado errado nunca casaria com nada e o teste passaria vazio, dando falsa segurança. Aqui
// confirmamos que cada nome da lista é uma tool real da superfície de consumidor.
// `create_checkout_link` fica fora porque é escopo de plataforma: só aparece com a chave do agente.
it("guard: os nomes transacionais vigiados existem de fato no /customer", async () => {
  const cust = await toolNames("/customer");
  const esperados = TRANSACTIONAL_NAMES.filter((n) => n !== "create_checkout_link");
  for (const n of esperados) {
    expect(cust, `"${n}" não é tool real: a vigilância do público passaria vazia`).toContain(n);
  }
});
