import * as React from "react";
import { cn } from "@/lib/utils";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** valor em reais (ex: 29.9) — null/undefined renderiza vazio */
  value: number | null | undefined;
  /** dispara com number ou null se o input for esvaziado */
  onChange: (value: number | null) => void;
  /** símbolo opcional (default R$). Use "" para esconder. */
  symbol?: string;
};

const brl = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCents(cents: number): string {
  const reais = cents / 100;
  return brl.format(reais);
}

function parseDigits(raw: string): number {
  // mantém apenas dígitos
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

/**
 * Input monetário BRL com máscara enquanto digita.
 * Internamente trabalha em centavos pra evitar arredondamento float.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, symbol = "R$", className, disabled, ...rest }, ref) => {
    const cents = React.useMemo(() => {
      if (value === null || value === undefined || Number.isNaN(value)) return null;
      return Math.round(value * 100);
    }, [value]);

    const [display, setDisplay] = React.useState<string>(
      cents === null ? "" : formatCents(cents),
    );

    // sincroniza quando o value externo muda
    React.useEffect(() => {
      setDisplay(cents === null ? "" : formatCents(cents));
    }, [cents]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = e.target.value;
      if (raw.trim() === "") {
        setDisplay("");
        onChange(null);
        return;
      }
      const nextCents = parseDigits(raw);
      setDisplay(formatCents(nextCents));
      onChange(nextCents / 100);
    }

    function handleBlur() {
      if (display === "") return;
      // garante formato canônico
      const nextCents = parseDigits(display);
      setDisplay(formatCents(nextCents));
    }

    return (
      <div
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-sm border border-hairline bg-canvas px-3 transition-colors focus-within:border-2 focus-within:border-ink",
          disabled && "cursor-not-allowed bg-surface-soft opacity-60",
          className,
        )}
      >
        {symbol && <span className="text-body-sm text-muted">{symbol}</span>}
        <input
          ref={ref}
          inputMode="decimal"
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          className="h-full w-full bg-transparent text-body-md text-ink tabular-nums placeholder:text-muted focus:outline-none"
          placeholder="0,00"
          {...rest}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
