import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { useDurationPrices } from "./api";
import { buildPriceRows, durationList } from "./price-table.logic";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companySlug: string | undefined;
  locationSlug: string | undefined;
  parkingTypeCode: string | undefined;
  /** Duração buscada pelo usuário (destacada). 0 quando sem datas. */
  selectedDays: number;
  title?: string;
};

export function PriceTableDialog({
  open,
  onOpenChange,
  companySlug,
  locationSlug,
  parkingTypeCode,
  selectedDays,
  title,
}: Props) {
  const durations = durationList(selectedDays);
  const queries = useDurationPrices({
    companySlug,
    locationSlug,
    parkingTypeCode,
    durations,
    enabled: open,
  });
  const rows = buildPriceRows(
    durations,
    queries.map((q) => q.data),
    selectedDays,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preços por duração{title ? ` — ${title}` : ""}</DialogTitle>
          <DialogDescription>
            O preço por diária cai nas estadias mais longas. A linha destacada é a sua busca.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Duração</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Por dia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const loading = queries[i]?.isLoading;
                return (
                  <TableRow
                    key={row.days}
                    className={cn(row.isSelected && "bg-surface-soft")}
                    aria-current={row.isSelected ? "true" : undefined}
                  >
                    <TableCell className="font-medium text-ink">
                      {row.label}
                      {row.isSelected && (
                        <span className="ml-2 rounded-sm bg-mp-pale px-1.5 py-0.5 text-caption text-mp-indigo">
                          sua busca
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {loading ? (
                        <Skeleton className="ml-auto h-4 w-16" />
                      ) : row.total != null ? (
                        <span className="inline-flex flex-col items-end">
                          {row.oldPrice != null && (
                            <span className="text-caption text-muted line-through">
                              {formatBRL(row.oldPrice)}
                            </span>
                          )}
                          <span className="text-ink">{formatBRL(row.total)}</span>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted">
                      {loading ? (
                        <Skeleton className="ml-auto h-4 w-12" />
                      ) : row.perDay != null ? (
                        formatBRL(row.perDay)
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
