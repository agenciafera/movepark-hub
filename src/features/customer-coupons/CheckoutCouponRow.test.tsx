import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rpc } from "@/test/msw/supabase";
import { renderWithProviders } from "@/test/utils";
import { CheckoutCouponRow } from "./CheckoutCouponRow";

/**
 * Regressão: o SheetContent não tem padding próprio, e a carteira entrava direto nele. O campo de
 * código e o botão "Resgatar" encostavam na borda do painel e o botão saía cortado.
 */
describe("CheckoutCouponRow", () => {
  it("a carteira fica dentro do corpo com respiro lateral e o campo cede espaço ao botão", async () => {
    rpc("customer_coupon_wallet", { json: { items: [], has_order_context: true } });
    renderWithProviders(<CheckoutCouponRow bookingId="b1" applied={null} allowsCoupons />);

    await userEvent.click(screen.getByRole("button", { name: /usar cupom/i }));

    const campo = await screen.findByRole("textbox", { name: "Código promocional" });
    const corpo = campo.closest(".overflow-y-auto");
    expect(corpo).not.toBeNull();
    expect(corpo).toHaveClass("px-6");
    expect(campo).toHaveClass("min-w-0", "flex-1");
    expect(screen.getByRole("button", { name: "Resgatar" })).toHaveClass("shrink-0");
  });
});
