import * as React from "react";
import { toast } from "sonner";
import { Plus, Tag, Pencil, Trash2 } from "lucide-react";
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
import type { DiscountRuleWithRestrictions } from "@/types/domain";
import { useCompanyLocations } from "@/features/addons/api";
import { useCompanyDiscounts, useDeleteDiscount, useSetDiscountActive } from "./api";
import { discountWindowLabel, formatDiscountValue } from "./discounts.logic";
import { DiscountForm } from "./DiscountForm";

export function DiscountsTab({ companyId }: { companyId: string }) {
  const { data, isLoading } = useCompanyDiscounts(companyId);
  const locations = useCompanyLocations(companyId);
  const del = useDeleteDiscount(companyId);
  const setActive = useSetDiscountActive(companyId);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DiscountRuleWithRestrictions | null>(null);

  const locationNames = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of locations.data ?? []) map[l.id] = l.name;
    return map;
  }, [locations.data]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(d: DiscountRuleWithRestrictions) {
    setEditing(d);
    setFormOpen(true);
  }
  async function remove(d: DiscountRuleWithRestrictions) {
    if (!confirm(`Excluir o desconto "${d.name}"?`)) return;
    try {
      await del.mutateAsync(d.id);
      toast.success("Desconto excluído");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }
  async function toggle(d: DiscountRuleWithRestrictions) {
    try {
      await setActive.mutateAsync({ id: d.id, is_active: !d.is_active });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-muted">
          Promoções aplicadas direto no preço, sem código. O cliente vê o valor já reduzido.
        </p>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> Novo desconto
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Tag className="h-10 w-10" />}
          title="Nenhum desconto cadastrado"
          description="Crie uma promoção automática para a sua empresa."
          action={
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4" /> Novo desconto
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Desconto</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Janela</TableHead>
                <TableHead>Acumula?</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-ink">
                    {d.name}
                    {d.description && (
                      <div className="text-caption text-muted">{d.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDiscountValue(d.discount_type, Number(d.discount_value))}
                  </TableCell>
                  <TableCell className="text-body-sm">
                    {d.location_id ? (locationNames[d.location_id] ?? "—") : "Todas"}
                  </TableCell>
                  <TableCell className="text-body-sm">
                    {discountWindowLabel(d.valid_from, d.valid_until)}
                  </TableCell>
                  <TableCell className="text-body-sm">
                    {d.allow_coupon_stack ? "Sim" : "Não"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={d.is_active} onCheckedChange={() => toggle(d)} />
                      <Badge tone={d.is_active ? "confirmed" : "pending"}>
                        {d.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(d)}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(d)}
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

      <DiscountForm
        open={formOpen}
        companyId={companyId}
        discount={editing}
        onOpenChange={setFormOpen}
      />
    </div>
  );
}
