import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  trend?: { value: string; positive?: boolean };
  isLoading?: boolean;
};

export function KpiCard({ label, value, hint, trend, isLoading }: Props) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-6">
        <span className="text-caption text-muted">{label}</span>
        {isLoading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <span className="text-display-xl text-ink">{value}</span>
        )}
        <div className="flex items-center gap-2 text-body-sm">
          {hint && <span className="text-muted">{hint}</span>}
          {trend && (
            <span
              className={cn(
                "text-caption",
                trend.positive === false ? "text-error" : "text-success",
              )}
            >
              {trend.value}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
