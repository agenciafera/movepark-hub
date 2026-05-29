import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Disparado ao completar todos os dígitos. */
  onComplete?: (v: string) => void;
};

export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
  disabled = false,
  onComplete,
}: Props) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = React.useMemo(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  React.useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function setAt(i: number, ch: string) {
    const sanitized = ch.replace(/\D/g, "").slice(-1);
    const next = digits.slice();
    next[i] = sanitized;
    const joined = next.join("");
    onChange(joined);
    if (sanitized && i < length - 1) refs.current[i + 1]?.focus();
    if (joined.replace(/\s/g, "").length === length && onComplete) {
      onComplete(joined);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === "Backspace") {
      if (digits[i]) {
        setAt(i, "");
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
        const next = digits.slice();
        next[i - 1] = "";
        onChange(next.join(""));
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
      e.preventDefault();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted.padEnd(length, "").slice(0, length));
    const focusIdx = Math.min(pasted.length, length - 1);
    refs.current[focusIdx]?.focus();
    if (pasted.length === length && onComplete) onComplete(pasted);
  }

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          aria-label={`Dígito ${i + 1}`}
          className={cn(
            "h-12 w-10 rounded-md border border-hairline bg-canvas text-center text-display-sm text-ink tabular-nums",
            "focus:border-mp-indigo focus:outline-none focus:ring-2 focus:ring-mp-indigo/30",
            "disabled:cursor-not-allowed disabled:bg-surface-soft",
          )}
        />
      ))}
    </div>
  );
}
