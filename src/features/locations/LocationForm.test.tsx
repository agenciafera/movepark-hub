import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { LocationForm } from "./LocationForm";
import type { Location } from "@/types/domain";

const location = {
  id: "loc-1",
  company_id: "company-1",
  name: "Lote Teste",
  slug: "lote-teste",
  address: "Rua X",
  latitude: -23.43,
  longitude: -46.47,
  timezone: "America/Sao_Paulo",
  status: "active",
  destination_id: null,
  phone: null,
  email: null,
  notice: null,
  reservation_policy: null,
} as unknown as Location;

const DEST_LABEL = /Destino \(âncora de proximidade\)/i;

describe("LocationForm — gating do vínculo de destino", () => {
  it("mostra o seletor de destino no full scope (hub_admin)", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={() => {}}
        editableScope="full"
      />,
    );
    expect(screen.getByText(DEST_LABEL)).toBeInTheDocument();
  });

  it("esconde o seletor de destino no operator scope", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={() => {}}
        editableScope="operator"
      />,
    );
    expect(screen.queryByText(DEST_LABEL)).not.toBeInTheDocument();
  });
});

/**
 * O formulário sempre manda um valor explícito de `tolerance_minutes` no insert, então
 * ele precisa semear o padrão da plataforma. Sem isso, unidade criada pela tela gravaria
 * 0 e atropelaria o default 60 do banco, quebrando a promessa da FAQ global (86ajp6vrq).
 */
describe("LocationForm — tolerância de saída", () => {
  const TOLERANCIA = /Tolerância na saída/i;

  it("unidade NOVA nasce com o padrão da plataforma no campo (60)", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={null}
        onOpenChange={() => {}}
        editableScope="full"
      />,
    );
    expect(screen.getByLabelText(TOLERANCIA)).toHaveValue(60);
  });

  it("unidade existente que zerou a tolerância mostra o campo vazio", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={{ ...location, tolerance_minutes: 0 } as Location}
        onOpenChange={() => {}}
        editableScope="full"
      />,
    );
    expect(screen.getByLabelText(TOLERANCIA)).toHaveValue(null);
  });

  it("unidade existente mostra a tolerância que ela tem salva", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={{ ...location, tolerance_minutes: 30 } as Location}
        onOpenChange={() => {}}
        editableScope="full"
      />,
    );
    expect(screen.getByLabelText(TOLERANCIA)).toHaveValue(30);
  });
});

describe("LocationForm — foto obrigatória (operador)", () => {
  it("bloqueia salvar sem foto no operator scope (form não fecha)", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={onOpenChange}
        editableScope="operator"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    // guarda impede o submit: onOpenChange(false) nunca é chamado
    await waitFor(() => {
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });
});

describe("LocationForm: aviso de unidade sem e-mail (proteção de voo, 25/09/2026)", () => {
  it("sem e-mail avisa que os avisos operacionais ficam só no painel", () => {
    renderWithProviders(
      <LocationForm open companyId="company-1" location={location} onOpenChange={() => {}} editableScope="full" />,
    );
    expect(screen.getByTestId("location-email-warning")).toHaveTextContent(/proteção de voo/);
  });
  it("com e-mail o aviso some", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={{ ...location, email: "portaria@lote.com.br" } as unknown as Location}
        onOpenChange={() => {}}
        editableScope="full"
      />,
    );
    expect(screen.queryByTestId("location-email-warning")).not.toBeInTheDocument();
  });
});

/**
 * A conta de Ads que recebe a conversão da unidade é configuração de mídia paga da plataforma
 * (docs/specs/analytics-ecommerce.md §3.1). A seção só existe no Manager; o banco é quem barra o
 * parceiro de verdade (trigger `location_ads_conversion_guard`), e a tela espelha isso.
 */
describe("LocationForm — seção Conversão e mídia paga", () => {
  it("mostra os campos de Google Ads no full scope (hub_admin)", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={() => {}}
        editableScope="full"
      />,
    );
    expect(screen.getByRole("heading", { name: "Conversão e mídia paga" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Google Ads · id da conta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Google Ads · rótulo da conversão/i)).toBeInTheDocument();
  });

  it("esconde a seção no operator scope", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={() => {}}
        editableScope="operator"
      />,
    );
    expect(screen.queryByRole("heading", { name: "Conversão e mídia paga" })).not.toBeInTheDocument();
  });

  it("colar o snippet inteiro no id preenche o rótulo sozinho", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={() => {}}
        editableScope="full"
      />,
    );
    const id = screen.getByLabelText(/Google Ads · id da conta/i);
    await user.click(id);
    await user.paste("AW-326904374/EaA6CMu82aYbELbU8JsB");
    expect(id).toHaveValue("AW-326904374");
    expect(screen.getByLabelText(/Google Ads · rótulo da conversão/i)).toHaveValue(
      "EaA6CMu82aYbELbU8JsB",
    );
  });

  it("metade do par preenchida não salva e explica qual metade falta", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={() => {}}
        editableScope="full"
      />,
    );
    await user.type(screen.getByLabelText(/Google Ads · id da conta/i), "AW-326904374");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => {
      expect(screen.getByText(/Informe o rótulo da conversão/i)).toBeInTheDocument();
    });
  });
});
