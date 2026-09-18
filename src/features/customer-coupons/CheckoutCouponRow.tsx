import * as React from "react";
import { Ticket } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatBRL } from "@/lib/format";
import { CouponWalletView } from "./CouponWalletView";
import { useApplyCouponToBooking, useRemoveCouponFromBooking } from "./api";
import { couponUnavailableReason } from "./couponWallet.logic";

type Props = {
  bookingId: string;
  /** Cupom já aplicado na reserva, quando houver. */
  applied: { code: string; discount: number } | null;
  /** A unidade fecha a reserva no Hub? ADR-009: sem isso o bloco não existe. */
  allowsCoupons: boolean;
};

/**
 * Linha "Usar cupom" do resumo do checkout. Abre a carteira no contexto desta reserva, onde cada
 * cupom já vem com veredito e valor.
 *
 * Aplicar é aqui, e não na página da unidade: o cliente decide o desconto olhando o total que vai
 * pagar. A página da unidade continua aceitando `?cupom=` de campanha, que o checkout aplica
 * sozinho ao abrir.
 */
export function CheckoutCouponRow({ bookingId, applied, allowsCoupons }: Props) {
  const [aberto, setAberto] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const aplicar = useApplyCouponToBooking();
  const remover = useRemoveCouponFromBooking();

  // ADR-009: promessa de transação só renderiza com capacidade declarada.
  if (!allowsCoupons) return null;

  async function usar(code: string) {
    setErro(null);
    const res = await aplicar.mutateAsync({ bookingId, code });
    if (res.ok) setAberto(false);
    else setErro(couponUnavailableReason(res.error_code));
  }

  async function limpar() {
    setErro(null);
    await remover.mutateAsync(bookingId);
    setAberto(false);
  }

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-md border border-hairline bg-canvas px-3 py-2.5 text-left transition-colors hover:bg-surface-soft"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Ticket className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="truncate text-body-sm text-ink">
              {applied ? `Cupom ${applied.code}` : "Usar cupom"}
            </span>
          </span>
          <span className="shrink-0 text-body-sm tabular-nums text-badge-confirmed-fg">
            {applied ? `−${formatBRL(applied.discount)}` : "Ver cupons"}
          </span>
        </button>
      </SheetTrigger>

      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Cupons de desconto</SheetTitle>
        </SheetHeader>

        {erro ? <p className="mt-3 text-body-sm text-error">{erro}</p> : null}

        <div className="mt-4">
          <CouponWalletView
            orderContext={{ bookingId }}
            onUse={usar}
            applying={aplicar.isPending || remover.isPending}
            appliedCode={applied?.code ?? null}
            onClearCoupon={limpar}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
