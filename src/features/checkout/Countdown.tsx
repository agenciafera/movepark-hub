import * as React from "react";
import { Hourglass, AlertTriangle } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Props = {
  expiresAt: string | null;
  onExpire?: () => void;
};

function diffSeconds(target: Date): number {
  return Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
}

export function Countdown({ expiresAt, onExpire }: Props) {
  const target = React.useMemo(
    () => (expiresAt ? new Date(expiresAt) : null),
    [expiresAt],
  );
  const [secs, setSecs] = React.useState(() =>
    target ? diffSeconds(target) : 0,
  );

  React.useEffect(() => {
    if (!target) return;
    const id = setInterval(() => {
      const next = diffSeconds(target);
      setSecs(next);
      if (next === 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onExpire]);

  if (!target) return null;

  const expired = secs === 0;
  const mins = Math.floor(secs / 60);
  const ss = secs % 60;
  const label = expired
    ? "Sua reserva expirou"
    : `Sua vaga está reservada por ${String(mins).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  const tone =
    expired
      ? "bg-badge-cancelled-bg text-error"
      : secs < 5 * 60
        ? "bg-badge-pending-bg text-warning"
        : "bg-mp-pale text-mp-indigo";

  return (
    <div
      className={cn(
        "sticky top-16 z-30 flex items-center justify-center gap-2 border-b border-hairline px-4 py-3 text-body-sm tabular-nums desktop:px-8",
        tone,
      )}
      role="timer"
      aria-live="polite"
    >
      {expired ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Hourglass className="h-4 w-4" />
      )}
      <span>{label}</span>
    </div>
  );
}
