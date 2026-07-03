import { Inbox } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-hairline bg-surface-soft px-6 py-12 text-center",
        className,
      )}
    >
      <div className="text-muted-soft">{icon ?? <Inbox className="h-10 w-10" />}</div>
      <div className="space-y-1">
        <h3 className="text-title-md text-ink">{title}</h3>
        {description && <p className="text-body-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
