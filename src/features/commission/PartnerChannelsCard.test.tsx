import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { siteUrl } from "@/lib/site";

const channels = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("./api", () => ({ usePartnerChannels: () => ({ data: channels.current }) }));

import { PartnerChannelsCard } from "./PartnerChannelsCard";

describe("PartnerChannelsCard", () => {
  it("sem regra da empresa o card não existe", () => {
    channels.current = { default_take_rate_bps: 2000, window_days: 10, rules: [], locations: [] };
    const { container } = renderWithProviders(<PartnerChannelsCard companyId="c1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra a comissão do canal, a padrão, e o link da unidade com o UTM", () => {
    channels.current = {
      default_take_rate_bps: 2000, window_days: 10,
      rules: [{ id: "r1", name: "Site do Abbapark", utm_sources: ["abbapark"], match_white_label: true, take_rate_bps: 500, valid_until: null }],
      locations: [{ id: "l1", name: "Abbapark GRU", public_path: "/estacionamentos/gru/abbapark" }],
    };
    renderWithProviders(<PartnerChannelsCard companyId="c1" />);
    expect(screen.getByText("comissão de 5%")).toBeInTheDocument();
    expect(screen.getByText(/comissão é de 20%/)).toBeInTheDocument();
    expect(screen.getByText("vale por 10 dias depois do clique")).toBeInTheDocument();
    expect(
      screen.getByText(`${siteUrl("/estacionamentos/gru/abbapark")}?utm_source=abbapark&utm_medium=parceiro`),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar link abbapark" })).toBeInTheDocument();
  });

  it("unidade sem página pública: avisa em vez de montar link quebrado", () => {
    channels.current = {
      default_take_rate_bps: 2000, window_days: 10,
      rules: [{ id: "r1", name: "Site", utm_sources: ["abbapark"], match_white_label: false, take_rate_bps: 500, valid_until: null }],
      locations: [],
    };
    renderWithProviders(<PartnerChannelsCard companyId="c1" />);
    expect(screen.getByText(/ainda não tem página pública/)).toBeInTheDocument();
  });
});
