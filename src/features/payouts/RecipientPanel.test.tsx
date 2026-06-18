import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import { renderWithProviders, mockAuth, mockSession } from "@/test/utils";
import { server } from "@/test/msw/server";
import { RecipientPanel } from "./RecipientPanel";

describe("RecipientPanel — recebedor no Manager", () => {
  beforeEach(() => {
    // Sem recebedor cadastrado ainda → PostGREST devolve lista vazia.
    server.use(
      http.get("*/rest/v1/payout_recipient", () => HttpResponse.json([])),
    );
  });

  it("sem recebedor ainda, mostra a seção e o botão de criar", () => {
    renderWithProviders(<RecipientPanel companyId="company-1" />, {
      auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
    });
    expect(screen.getByText(/Recebedor \(pagamento\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Criar recebedor/i })).toBeInTheDocument();
  });
});
