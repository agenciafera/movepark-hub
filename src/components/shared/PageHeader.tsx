import { cn } from "@/lib/utils";

type Props = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: Props) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        {eyebrow && (
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
            {eyebrow}
          </span>
        )}
        <h1 className="text-display-xl text-ink">{title}</h1>
        {description && <p className="text-body-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
