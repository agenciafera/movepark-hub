import { CreditCard } from "@phosphor-icons/react";
import { BRAND_LABEL, normalizeBrand } from "@/lib/card-brand";
import { cn } from "@/lib/utils";

/**
 * A marca da bandeira, em SVG próprio (nada de logo baixado: cor e forma bastam para o cliente
 * reconhecer o cartão dele). Mesma caixa 40x26 para alinhar em select, lista e input.
 * Sem bandeira conhecida cai no ícone de cartão.
 */
export function CardBrandMark({ brand, className }: { brand: string | null | undefined; className?: string }) {
  const b = normalizeBrand(brand);
  const box = cn("inline-flex h-[26px] w-10 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-hairline", className);
  const label = BRAND_LABEL[b];

  if (b === "visa") {
    return (
      <span className={cn(box, "bg-white")} role="img" aria-label={label}>
        <svg viewBox="0 0 40 26" className="h-full w-full" aria-hidden="true">
          <text x="20" y="18" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontStyle="italic" fontSize="13" fill="#1A1F71">VISA</text>
        </svg>
      </span>
    );
  }
  if (b === "mastercard") {
    return (
      <span className={cn(box, "bg-white")} role="img" aria-label={label}>
        <svg viewBox="0 0 40 26" className="h-full w-full" aria-hidden="true">
          <circle cx="15.5" cy="13" r="7.5" fill="#EB001B" />
          <circle cx="24.5" cy="13" r="7.5" fill="#F79E1B" fillOpacity="0.92" />
        </svg>
      </span>
    );
  }
  if (b === "amex") {
    return (
      <span className={cn(box, "bg-[#2E77BC]")} role="img" aria-label={label}>
        <svg viewBox="0 0 40 26" className="h-full w-full" aria-hidden="true">
          <text x="20" y="17" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="10" fill="#fff">AMEX</text>
        </svg>
      </span>
    );
  }
  if (b === "elo") {
    return (
      <span className={cn(box, "bg-black")} role="img" aria-label={label}>
        <svg viewBox="0 0 40 26" className="h-full w-full" aria-hidden="true">
          <circle cx="12" cy="13" r="4" fill="#FFCB05" />
          <circle cx="20" cy="13" r="4" fill="#00A4E0" />
          <circle cx="28" cy="13" r="4" fill="#EF4123" />
        </svg>
      </span>
    );
  }
  if (b === "hipercard") {
    return (
      <span className={cn(box, "bg-[#B3131B]")} role="img" aria-label={label}>
        <svg viewBox="0 0 40 26" className="h-full w-full" aria-hidden="true">
          <text x="20" y="17" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontStyle="italic" fontSize="9" fill="#fff">Hiper</text>
        </svg>
      </span>
    );
  }
  return (
    <span className={cn(box, "bg-surface-soft text-muted")} role="img" aria-label={label}>
      <CreditCard size={16} />
    </span>
  );
}
