import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ApplicationDrawer } from "./ApplicationDrawer";
import type { PartnerApplication } from "@/types/domain";

function makeApp(over: Partial<PartnerApplication>): PartnerApplication {
  return {
    company_id: "c1",
    contact_name: "Maria",
    contact_email: "maria@x.com",
    contact_phone: "11999999999",
    city: "São Paulo",
    state: "SP",
    go2park_interest: false,
    company: { id: "c1", name: "Pátio Central", slug: "patio-central", onboarding_status: "pending_review", status: "inactive" },
    ...over,
  } as unknown as PartnerApplication;
}

describe("ApplicationDrawer — selo Go2Park", () => {
  it("mostra o selo 'Interesse Go2Park' quando o parceiro demonstrou interesse", () => {
    renderWithProviders(
      <ApplicationDrawer application={makeApp({ go2park_interest: true })} open onOpenChange={() => {}} onReject={() => {}} />,
    );
    expect(screen.getByText("Interesse Go2Park")).toBeInTheDocument();
  });

  it("não mostra o selo quando não houve interesse", () => {
    renderWithProviders(
      <ApplicationDrawer application={makeApp({ go2park_interest: false })} open onOpenChange={() => {}} onReject={() => {}} />,
    );
    expect(screen.queryByText("Interesse Go2Park")).not.toBeInTheDocument();
  });
});
