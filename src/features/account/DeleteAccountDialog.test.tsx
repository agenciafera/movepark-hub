import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, mockAuth, mockSession } from "@/test/utils";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

const mutateAsync = vi.fn();
vi.mock("./api", () => ({
  useDeleteAccount: () => ({ mutateAsync, isPending: false }),
}));

function open() {
  const auth = mockAuth({
    session: mockSession("customer", { email: "maria@example.com" }),
    signOut: vi.fn(),
  });
  renderWithProviders(<DeleteAccountDialog />, { auth });
  fireEvent.click(screen.getByRole("button", { name: /excluir conta/i }));
  return { auth, dialog: screen.getByRole("dialog") };
}

describe("DeleteAccountDialog", () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ ok: true, cancelled: 0, refunded: 0 });
  });

  it("mantém o botão de confirmar desabilitado até o e-mail bater", () => {
    const { dialog } = open();
    const confirm = within(dialog).getByRole("button", { name: /^excluir conta$/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/digite seu e-mail/i), {
      target: { value: "errado@example.com" },
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/digite seu e-mail/i), {
      target: { value: "maria@example.com" },
    });
    expect(confirm).toBeEnabled();
  });

  it("case-insensitive: MARIA@EXAMPLE.COM confirma", () => {
    const { dialog } = open();
    fireEvent.change(within(dialog).getByLabelText(/digite seu e-mail/i), {
      target: { value: "MARIA@EXAMPLE.COM" },
    });
    expect(within(dialog).getByRole("button", { name: /^excluir conta$/i })).toBeEnabled();
  });

  it("ao confirmar: chama a exclusão e desloga", async () => {
    const { auth, dialog } = open();
    fireEvent.change(within(dialog).getByLabelText(/digite seu e-mail/i), {
      target: { value: "maria@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^excluir conta$/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});
