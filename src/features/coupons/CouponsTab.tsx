import * as React from "react";
import { toast } from "sonner";
import { Plus, Ticket, Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CouponWithRestrictions } from "@/types/domain";
import { useCompanyCoupons, useDeleteCoupon, useSetCouponActive } from "./api";
import { formatDiscount, formatUsage } from "./coupons.logic";
import { CouponForm } from "./CouponForm";

function validityLabel(c: CouponWithRestrictions): string {
  const from = c.valid_from ? new Date(c.valid_from).toLocaleDateString("pt-BR") : null;
  const until = c.valid_until ? new Date(c.valid_until).toLocaleDateString("pt-BR") : null;
  if (!from && !until) return "Sempre";
  return `${from ?? "-"} → ${until ?? "-"}`;
}

export function CouponsTab({ companyId }: { companyId: string }) {
  const { data, isLoading } = useCompanyCoupons(companyId);
  const del = useDeleteCoupon(companyId);
  const setActive = useSetCouponActive(companyId);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CouponWithRestrictions | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(c: CouponWithRestrictions) {
    setEditing(c);
    setFormOpen(true);
  }
  async function remove(c: CouponWithRestrictions) {
    if (!confirm(`Excluir o cupom "${c.code}"?`)) return;
    try {
      await del.mutateAsync(c.id);
      toast.success("Cupom excluído");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }
  async function toggle(c: CouponWithRestrictions) {
    try {
      await setActive.mutateAsync({ id: c.id, is_active: !c.is_active });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-muted">
          Códigos que o cliente digita no checkout. O uso conta quando o pagamento é confirmado.
        </p>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> Novo cupom
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-10 w-10" />}
          title="Nenhum cupom cadastrado"
          description="Crie o primeiro cupom de desconto da sua empresa."
          action={
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4" /> Novo cupom
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Desconto</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-ink">
                    {c.code}
                    {c.description && (
                      <div className="text-caption text-muted">{c.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDiscount(c.discount_type, Number(c.discount_value))}
                  </TableCell>
                  <TableCell className="text-body-sm">{validityLabel(c)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatUsage(c.times_used, c.max_uses)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={c.is_active} onCheckedChange={() => toggle(c)} />
                      <Badge tone={c.is_active ? "confirmed" : "pending"}>
                        {c.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(c)}
                        disabled={del.isPending}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CouponForm open={formOpen} companyId={companyId} coupon={editing} onOpenChange={setFormOpen} />
    </div>
  );
}
