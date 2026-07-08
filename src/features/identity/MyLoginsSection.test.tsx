import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { MyLoginsSection } from "./MyLoginsSection";
import * as api from "./api";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const unlinkMutate = vi.fn().mockResolvedValue(undefined);
const linkMutate = vi.fn();

function stub(identities: Partial<api.Identities>) {
  vi.spyOn(api, "useIdentities").mockReturnValue({
    data: {
      email: null,
      phone: null,
      email_verified: false,
      phone_verified: false,
      providers: [],
      ...identities,
    },
    isLoading: false,
  } as never);
  vi.spyOn(api, "useLinkGoogle").mockReturnValue({ mutate: linkMutate, isPending: false } as never);
  vi.spyOn(api, "useUnlinkProvider").mockReturnValue({
    mutateAsync: unlinkMutate,
    isPending: false,
  } as never);
}

describe("MyLoginsSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mostra e-mail, telefone e Google", () => {
    stub({ email: "a@b.com", email_verified: true, phone: "+5511999990001", phone_verified: true });
    renderWithProviders(<MyLoginsSection />);
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByText("+5511999990001")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
  });

  it("bloqueia remover o Google quando é o único login", async () => {
    // só Google, sem e-mail/telefone → é o único método
    stub({ providers: [{ provider: "google", last_sign_in_at: null }] });
    renderWithProviders(<MyLoginsSection />);
    fireEvent.click(screen.getByRole("button", { name: /Remover/i }));
    expect(unlinkMutate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("permite remover o Google quando há e-mail também", async () => {
    stub({
      email: "a@b.com",
      email_verified: true,
      providers: [{ provider: "google", last_sign_in_at: null }],
    });
    renderWithProviders(<MyLoginsSection />);
    fireEvent.click(screen.getByRole("button", { name: /Remover/i }));
    expect(unlinkMutate).toHaveBeenCalledWith("google");
  });
});
