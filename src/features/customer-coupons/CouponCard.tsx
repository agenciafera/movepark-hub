import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  couponAmountLabel,
  couponCapLabel,
  couponIssuer,
  couponUnavailableReason,
  couponValidityLabel,
  type WalletCoupon,
} from "./couponWallet.logic";

type Props = {
  coupon: WalletCoupon;
  /** Aplicar o cupom neste pedido. Ausente na tela da conta, onde não há pedido. */
  onUse?: (code: string) => void;
  applying?: boolean;
  isApplied?: boolean;
};

/**
 * Cartão de um cupom na carteira.
 *
 * Indisponível mostra o motivo no lugar do botão. O motivo é obrigatório: um cartão apagado sem
 * explicação faz a pessoa tentar de novo e culpar o app.
 */
export function CouponCard({ coupon, onUse, applying, isApplied }: Props) {
  const indisponivel = coupon.is_eligible === false;
  const cap = couponCapLabel(coupon);
  const validade = couponValidityLabel(coupon);

  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-hairline bg-canvas p-4",
        indisponivel && "opacity-60",
      )}
    >
      {(coupon.is_best && !indisponivel) || isApplied ? (
        <div className="flex flex-wrap items-center gap-2">
          {coupon.is_best && !indisponivel ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-badge text-on-primary">
              Melhor opção
            </span>
          ) : null}
          {isApplied ? (
            <span className="rounded-full bg-badge-confirmed-bg px-2 py-0.5 text-badge text-badge-confirmed-fg">
              Em uso
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p
            className={cn("text-display-sm", indisponivel ? "text-muted" : "text-success")}
          >
            {couponAmountLabel(coupon)}
            {cap ? <span className="text-body-sm">, {cap}</span> : null}
          </p>

          {coupon.title ? <p className="text-title-sm text-ink">{coupon.title}</p> : null}

          <p className="text-caption-sm text-muted">{couponIssuer(coupon)}</p>

          {coupon.terms ? <p className="text-caption-sm text-muted">{coupon.terms}</p> : null}
          {validade ? <p className="text-caption-sm text-muted">{validade}</p> : null}

          <p className="font-mono text-caption-sm text-muted">{coupon.code}</p>
        </div>

        {onUse && !indisponivel && !isApplied ? (
          <Button size="sm" onClick={() => onUse(coupon.code)} disabled={applying}>
            Usar
          </Button>
        ) : null}
      </div>

      {indisponivel ? (
        <div className="border-t border-hairline pt-2">
          <p className="text-caption text-warning">Por que não dá para usar</p>
          <p className="text-body-sm text-ink">{couponUnavailableReason(coupon.reason)}</p>
        </div>
      ) : null}
    </article>
  );
}
