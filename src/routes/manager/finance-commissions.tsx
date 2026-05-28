import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanies } from "@/features/companies/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

export default function ManagerFinanceCommissions() {
  const { data, isLoading } = useCompanies();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Comissões"
        description="Taxas de comissão por empresa parceira."
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="w-40 text-right">Comissão (%)</TableHead>
                  <TableHead className="w-40">Vigência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-ink">{c.name}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        defaultValue={10}
                        step="0.1"
                        className="h-9 max-w-24 text-right tabular-nums"
                        disabled
                      />
                    </TableCell>
                    <TableCell className="text-muted">Atual</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-caption text-muted">
        * Taxa atualmente fixa em 10% — campo dedicado na tabela{" "}
        <code>company</code> ficará em uma próxima migração.
      </p>
    </div>
  );
}
