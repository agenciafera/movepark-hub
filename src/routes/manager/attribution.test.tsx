import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/features/attribution/api", () => ({
  useBookingAttribution: () => ({
    data: {
      totals: { hub: 30, external: 10, total: 40 },
      by_origin: [
        { origin: "hub_search", count: 18, confirmed: 12 },
        { origin: "white_label", count: 10, confirmed: 9 },
      ],
      by_utm_source: [{ utm_source: "google", count: 14 }],
    },
    isLoading: false,
  }),
}));

import ManagerAttribution from "./attribution";

describe("ManagerAttribution", () => {
  it("mostra hub × white-label com % e as tabelas de origem/utm", () => {
    renderWithProviders(<ManagerAttribution />);
    // 30 hub = 75% do total (40)
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("75% do total")).toBeInTheDocument();
    expect(screen.getByText("25% do total")).toBeInTheDocument();
    // linha por origem + utm
    expect(screen.getByText("hub_search")).toBeInTheDocument();
    expect(screen.getByText("google")).toBeInTheDocument();
  });
});
