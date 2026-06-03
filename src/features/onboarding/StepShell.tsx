import * as React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  secondaryAction?: React.ReactNode;
};

export function StepShell({
  title,
  description,
  children,
  onBack,
  onNext,
  nextLabel = "Continuar",
  nextDisabled,
  busy,
  secondaryAction,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-display-md text-ink">{title}</h2>
        {description && <p className="text-body-sm text-muted">{description}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
      <div className="flex items-center justify-between gap-2 border-t border-hairline pt-4">
        <div>
          {onBack && (
            <Button variant="ghost" onClick={onBack} disabled={busy}>
              Voltar
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {secondaryAction}
          <Button onClick={onNext} disabled={nextDisabled || busy}>
            {busy ? "Salvando…" : nextLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
