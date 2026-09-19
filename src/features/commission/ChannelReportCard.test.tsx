import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const report = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("./api", () => ({ useChannelReport: () => ({ data: report.current, isLoading: false }) }));

import { ChannelReportCard } from "./ChannelReportCard";

describe("ChannelReportCard", () => {
  it("mês sem venda paga", () => {
    report.current = { alert_pct: 60, companies: [] };
    renderWithProviders(<ChannelReportCard />);
    expect(screen.getByText("Sem vendas pagas no mês")).toBeInTheDocument();
  });

  it("abre a empresa por canal e acende o alerta de concentração", () => {
    report.current = {
      alert_pct: 60,
      companies: [
        {
          company_id: "c1", company_name: "Abbapark", paid_bookings: 2, gmv_cents: 30000, movepark_cents: 3000,
          partner_gmv_cents: 20000, partner_share_pct: 67, alert: true,
          channels: [
            { channel: "Site do Abbapark", from_rule: true, paid_bookings: 1, gmv_cents: 20000, movepark_cents: 1000, avg_take_rate_bps: 500 },
            { channel: "hub", from_rule: false, paid_bookings: 1, gmv_cents: 10000, movepark_cents: 2000, avg_take_rate_bps: 2000 },
          ],
        },
        {
          company_id: "c2", company_name: "Virapark", paid_bookings: 1, gmv_cents: 10000, movepark_cents: 2000,
          partner_gmv_cents: 0, partner_share_pct: 0, alert: false,
          channels: [{ channel: "hub", from_rule: false, paid_bookings: 1, gmv_cents: 10000, movepark_cents: 2000, avg_take_rate_bps: null }],
        },
      ],
    };
    renderWithProviders(<ChannelReportCard />);
    expect(screen.getByText("67% pelo canal dele, vale conferir")).toBeInTheDocument();
    const canal = screen.getByText("Site do Abbapark").closest("tr")!;
    expect(within(canal).getByText("5%")).toBeInTheDocument();
    expect(within(canal).getByText(/200,00/)).toBeInTheDocument();
    // empresa sem venda pelo canal dela não ganha selo, e comissão desconhecida vira traço
    const vira = screen.getByText("Virapark").closest("tr")!;
    expect(within(vira).queryByText(/pelo canal dele/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Movepark (busca e site)")).toHaveLength(2);
  });
});
