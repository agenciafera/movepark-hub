import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { EmailEventRow } from "@/features/email-events/api";

const { rows } = vi.hoisted(() => ({ rows: { current: [] as unknown[] } }));

vi.mock("@/features/email-events/api", () => ({
  useEmailEvents: () => ({ data: rows.current, isLoading: false, isError: false }),
}));

import ManagerEmails from "./emails";

function evento(over: Partial<EmailEventRow>): EmailEventRow {
  return {
    id: crypto.randomUUID(),
    sns_message_id: "sns",
    event_type: "delivery",
    recipient: "a@ex.com",
    ses_message_id: null,
    subject: "Movimento de hoje: Pare Seguro",
    sender: "contato@movepark.co",
    bounce_type: null,
    bounce_subtype: null,
    diagnostic: null,
    occurred_at: "2026-11-19T10:00:00Z",
    created_at: "2026-11-19T10:00:00Z",
    ...over,
  };
}

describe("ManagerEmails", () => {
  beforeEach(() => {
    rows.current = [];
  });

  it("sem evento, diz que o SES ainda não mandou nada", () => {
    renderWithProviders(<ManagerEmails />);
    expect(screen.getByText("Nenhum evento")).toBeInTheDocument();
  });

  it("lista os eventos e destaca o endereço que devolveu", () => {
    rows.current = [
      evento({ recipient: "parceiro@ex.com", event_type: "bounce", bounce_type: "Permanent", diagnostic: "550 5.7.1 rejected", occurred_at: "2026-11-19T11:00:00Z" }),
      evento({ recipient: "ok@ex.com" }),
    ];
    renderWithProviders(<ManagerEmails />);
    expect(screen.getByText("Endereços com problema")).toBeInTheDocument();
    expect(screen.getAllByText("parceiro@ex.com")).toHaveLength(2);
    expect(screen.getByText("Sem entrega depois")).toBeInTheDocument();
    expect(screen.getAllByText("Devolvido").length).toBeGreaterThan(0);
    expect(screen.getByText("550 5.7.1 rejected")).toBeInTheDocument();
    expect(screen.getByText("Entregue")).toBeInTheDocument();
  });

  it("só entrega: sem o quadro de problemas", () => {
    rows.current = [evento({})];
    renderWithProviders(<ManagerEmails />);
    expect(screen.queryByText("Endereços com problema")).not.toBeInTheDocument();
  });
});
