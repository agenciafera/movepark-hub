import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Step4Pricing } from "./Step4Pricing";
import type { OnboardingData, WizardParkingItem } from "../wizardApi";

const ITEM: WizardParkingItem = {
  location_parking_type_id: "lpt1",
  company_parking_type_id: "cpt1",
  parking_type_id: "pt1",
  code: "covered",
  name: "Coberto",
  base_price: 50,
  capacity: 10,
  strategy: null,
  tiers: [],
};

function makeData(items: WizardParkingItem[]): OnboardingData {
  return {
    company: { id: "c1", name: "COW", legal_name: null, tax_id: null, logo_url: null, onboarding_status: "approved" },
    currentStep: 4,
    lead: null,
    location: { id: "loc1", name: "U", address: null, latitude: null, longitude: null, timezone: "America/Sao_Paulo", phone: null, email: null, reservation_policy: null, photos: [] },
    items,
    addons: [],
    catalog: [],
  };
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrap = (data: OnboardingData) => (
  <QueryClientProvider client={qc}>
    <Step4Pricing data={data} companyId="c1" onNext={() => {}} onBack={() => {}} />
  </QueryClientProvider>
);

describe("Step4Pricing — itens que chegam após o mount", () => {
  it("renderiza o tipo de vaga mesmo quando data.items nasce vazio e popula depois (regressão do crash 'mode')", () => {
    // Monta com itens vazios (o fetch do onboarding ainda refazendo ao voltar da etapa 3).
    const { rerender } = render(wrap(makeData([])));
    expect(screen.queryByText("Coberto")).not.toBeInTheDocument();

    // Os itens chegam depois — sem a sincronização de state, o card não aparecia (etapa vazia)
    // e o "Continuar" quebrava lendo `ps.mode` de undefined.
    rerender(wrap(makeData([ITEM])));
    expect(screen.getByText("Coberto")).toBeInTheDocument();
  });
});
