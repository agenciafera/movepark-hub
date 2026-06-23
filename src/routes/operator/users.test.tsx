import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import OperatorUsers from "./users";
import {
  useCompanyMembers,
  useInviteMember,
  useRemoveMember,
  useSetMemberRole,
} from "@/features/team/api";
import type { CompanyMember } from "@/types/domain";

vi.mock("@/features/team/api", () => ({
  useCompanyMembers: vi.fn(),
  useSetMemberRole: vi.fn(),
  useRemoveMember: vi.fn(),
  useInviteMember: vi.fn(),
}));

function member(id: string, role: CompanyMember["role"]): CompanyMember {
  return { profile_id: id, full_name: id, email: `${id}@x.com`, role, created_at: "2026-06-01T00:00:00Z" };
}

function setup(members: CompanyMember[], canManage: boolean) {
  vi.mocked(useCompanyMembers).mockReturnValue({ data: members, isLoading: false } as never);
  vi.mocked(useSetMemberRole).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  vi.mocked(useRemoveMember).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  vi.mocked(useInviteMember).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  return renderWithProviders(<OperatorUsers />, {
    auth: mockAuth({
      session: mockSession("company_operator"),
      effectiveCompanyIds: ["company-1"],
      // team:write governa convite + gestão (ADR-005)
      hasScope: (s) => (s === "team:write" ? canManage : true),
    }),
    route: "/operator/users",
  });
}

describe("OperatorUsers", () => {
  it("com team:write: controles (seletor de papel + remover) + botão de convite", () => {
    setup([member("ana", "owner"), member("bob", "operator")], true);
    expect(screen.getAllByRole("combobox").length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Remover" }).length).toBe(2);
    expect(screen.getByRole("button", { name: /Convidar usuário/i })).toBeInTheDocument();
  });

  it("sem team:write: só badges, sem controles nem convite", () => {
    setup([member("ana", "owner"), member("bob", "operator")], false);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Convidar usuário/i })).not.toBeInTheDocument();
    expect(screen.getByText("Dono")).toBeInTheDocument();
    expect(screen.getByText("Operação")).toBeInTheDocument();
  });

  it("remover do último dono fica desabilitado", () => {
    setup([member("ana", "owner"), member("bob", "operator")], true);
    const buttons = screen.getAllByRole("button", { name: "Remover" });
    // ana é o único dono → seu remover desabilitado; bob (operação) habilitado
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeEnabled();
  });
});
