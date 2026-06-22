import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { Company } from "@/types/domain";

const updateMutate = vi.fn().mockResolvedValue({});
const createMutate = vi.fn().mockResolvedValue({});

vi.mock("./api", () => ({
  useCreateCompany: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateCompany: () => ({ mutateAsync: updateMutate, isPending: false }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

import { CompanyForm } from "./CompanyForm";

function makeCompany(over: Partial<Company>): Company {
  return {
    id: "c1",
    name: "Ferapark",
    slug: "ferapark",
    wl_base_url: null,
    wl_tenant_key: null,
    wl_sync_enabled: false,
    ...over,
  } as unknown as Company;
}

describe("CompanyForm — integração White-label", () => {
  beforeEach(() => {
    updateMutate.mockClear();
    createMutate.mockClear();
    toastError.mockClear();
  });

  it("mostra e preenche os campos de integração WL ao editar", () => {
    renderWithProviders(
      <CompanyForm
        open
        onOpenChange={() => {}}
        company={makeCompany({
          wl_base_url: "https://ferapark.movepark.com.br/api/v3/backend",
          wl_tenant_key: "ferapark",
          wl_sync_enabled: true,
        })}
      />,
    );
    expect(screen.getByText("Integração White-label")).toBeInTheDocument();
    expect(screen.getByLabelText(/URL base da API do WL/i)).toHaveValue(
      "https://ferapark.movepark.com.br/api/v3/backend",
    );
    expect(screen.getByLabelText(/Tenant/i)).toHaveValue("ferapark");
  });

  it("bloqueia ligar a sync sem URL/tenant (não chama o update)", () => {
    renderWithProviders(
      <CompanyForm
        open
        onOpenChange={() => {}}
        company={makeCompany({ wl_sync_enabled: true, wl_base_url: null, wl_tenant_key: null })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/sincronização/i));
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
