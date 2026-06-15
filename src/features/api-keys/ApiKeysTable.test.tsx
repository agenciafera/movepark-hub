import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ApiKeysTable } from "./ApiKeysTable";
import * as api from "./api";
import type { ApiKeyView } from "./api-keys.logic";

vi.mock("./api");

const mutation = { mutateAsync: vi.fn(), isPending: false } as never;

beforeEach(() => {
  vi.mocked(api.useRevokeApiKey).mockReturnValue(mutation);
  vi.mocked(api.useRotateApiKey).mockReturnValue(mutation);
  vi.mocked(api.useCreateApiKey).mockReturnValue(mutation);
  vi.mocked(api.useApiScopes).mockReturnValue({ data: [] } as never);
});

describe("ApiKeysTable", () => {
  it("mostra empty state quando não há chaves", () => {
    vi.mocked(api.useCompanyApiKeys).mockReturnValue({ data: [], isLoading: false } as never);
    renderWithProviders(<ApiKeysTable companyId="company-1" />);
    expect(screen.getByText(/Nenhuma chave de API/i)).toBeInTheDocument();
  });

  it("renderiza a chave com prefixo e status", () => {
    const keys: ApiKeyView[] = [
      {
        id: "k1",
        name: "Integração WPS",
        key_prefix: "mp_live_8Kf2c1aQ",
        environment: "live",
        scopes: ["locations:read", "bookings:read", "bookings:write", "faq:read"],
        last_used_at: null,
        expires_at: null,
        created_at: "2026-06-10T00:00:00Z",
        status: "active",
      },
    ];
    vi.mocked(api.useCompanyApiKeys).mockReturnValue({ data: keys, isLoading: false } as never);
    renderWithProviders(<ApiKeysTable companyId="company-1" />);
    expect(screen.getByText("Integração WPS")).toBeInTheDocument();
    expect(screen.getByText(/mp_live_8Kf2c1aQ/)).toBeInTheDocument();
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    expect(screen.getByText("Nunca usada")).toBeInTheDocument();
    // escopos: mostra 3 chips + "+1"
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
