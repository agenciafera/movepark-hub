import * as React from "react";
import { cn } from "@/lib/utils";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** valor como decimal (1.20 = 120%). null/undefined = vazio */
  value: number | null | undefined;
  onChange: (value: number | null) => void;
};

const fmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Aceita "20", "20,5", "120" como percentual. Internamente armazena fator decimal (1.205). */
export const PercentInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, disabled, ...rest }, ref) => {
    const initial = React.useMemo(() => {
      if (value === null || value === undefined || Number.isNaN(value)) return "";
      return fmt.format(value * 100);
    }, [value]);

    const [display, setDisplay] = React.useState(initial);

    React.useEffect(() => {
      setDisplay(initial);
    }, [initial]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = e.target.value;
      setDisplay(raw);
      const cleaned = raw.replace(/[^0-9,.-]/g, "").replace(",", ".");
      if (cleaned === "" || cleaned === "-") {
        onChange(null);
        return;
      }
      const num = Number(cleaned);
      if (Number.isNaN(num)) return;
      onChange(num / 100);
    }

    function handleBlur() {
      if (display === "") return;
      if (value === null || value === undefined) return;
      setDisplay(fmt.format(value * 100));
    }

    return (
      <div
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-sm border border-hairline bg-canvas px-3 transition-colors focus-within:border-2 focus-within:border-ink",
          disabled && "cursor-not-allowed bg-surface-soft opacity-60",
          className,
        )}
      >
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
        <span className="text-body-sm text-muted">%</span>
      </div>
    );
  },
);
PercentInput.displayName = "PercentInput";
