import { Check } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Props = {
  steps: string[];
  current: number; // 1-based
};

export function OnboardingStepper({ steps, current }: Props) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto tablet:gap-3">
      {steps.map((label, i) => {
        const id = i + 1;
        const completed = id < current;
        const active = id === current;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
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
              {completed ? <Check className="h-4 w-4" /> : id}
            </div>
            <span
              className={cn(
                "hidden whitespace-nowrap text-body-sm desktop:inline",
                active ? "font-medium text-ink" : completed ? "text-ink" : "text-muted",
              )}
            >
              {label}
            </span>
            {id < steps.length && (
              <span className={cn("h-px w-5 tablet:w-8", completed ? "bg-success" : "bg-hairline")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
