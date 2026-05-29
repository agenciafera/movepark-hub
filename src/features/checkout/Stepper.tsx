import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { id: 1, label: "Identificação" },
  { id: 2, label: "Veículo" },
  { id: 3, label: "Pagamento" },
  { id: 4, label: "Confirmação" },
];

type Props = {
  current: 1 | 2 | 3 | 4;
};

export function Stepper({ current }: Props) {
  return (
    <ol className="flex items-center gap-2 tablet:gap-4">
      {steps.map((s) => {
        const completed = s.id < current;
        const active = s.id === current;
        return (
          <li
            key={s.id}
            className="flex items-center gap-2"
            aria-current={active ? "step" : undefined}
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
                completed
                  ? "bg-success text-white"
                  : active
                    ? "bg-mp-navy text-white"
                    : "border border-hairline bg-canvas text-muted",
              )}
            >
              {completed ? <Check className="h-4 w-4" /> : s.id}
            </div>
            <span
              className={cn(
                "hidden text-body-sm tablet:inline",
                active ? "text-ink font-medium" : completed ? "text-ink" : "text-muted",
              )}
            >
              {s.label}
            </span>
            {s.id < 4 && (
              <span
                className={cn(
                  "h-px w-8 tablet:w-12",
                  completed ? "bg-success" : "bg-hairline",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
