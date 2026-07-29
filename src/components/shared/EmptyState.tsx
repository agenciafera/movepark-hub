import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /**
   * Ilustração do estado vazio (SVG da marca em `/illustrations`, ver
   * `docs/design-system/illustrations.md`). Quando presente, ocupa o slot visual no
   * lugar do ícone. É decorativa: o título carrega a mensagem, então vai com `alt=""`.
   */
  illustration?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon,
  illustration,
  action,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-hairline bg-surface-soft px-6 py-12 text-center",
        className,
      )}
    >
      {illustration ? (
        <img
          src={illustration}
          alt=""
          loading="lazy"
          draggable={false}
          className="mb-1 h-32 w-auto max-w-[220px] select-none"
        />
      ) : (
        <div className="text-muted-soft">{icon ?? <Inbox className="h-10 w-10" />}</div>
      )}
      <div className="space-y-1">
        <h3 className="text-title-md text-ink">{title}</h3>
        {description && <p className="text-body-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
