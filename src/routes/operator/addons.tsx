import * as React from "react";
import { toast } from "sonner";
import { Plus, Sparkles, MapPin, Pencil, Trash2 } from "@/lib/icons";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { useAuth } from "@/auth/context";
import type { AddOnService, AddOnServiceWithAvailability } from "@/types/domain";
import { useCompanyAddons, useDeleteAddon } from "@/features/addons/api";
import { activeLocationCount } from "@/features/addons/addons.logic";
import { AddonForm } from "@/features/addons/AddonForm";
import { AddonAvailability } from "@/features/addons/AddonAvailability";

export default function OperatorAddons() {
  const { effectiveCompanyIds } = useAuth();
  const companyId = effectiveCompanyIds[0];
  const { data, isLoading } = useCompanyAddons(companyId);
  const del = useDeleteAddon(companyId);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AddOnService | null>(null);
  const [availOpen, setAvailOpen] = React.useState(false);
  const [availFor, setAvailFor] = React.useState<AddOnServiceWithAvailability | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(a: AddOnService) {
    setEditing(a);
    setFormOpen(true);
  }
  function openAvailability(a: AddOnServiceWithAvailability) {
    setAvailFor(a);
    setAvailOpen(true);
  }
  async function remove(a: AddOnService) {
    if (!confirm(`Excluir o serviço "${a.name}"?`)) return;
    try {
      await del.mutateAsync(a.id);
      toast.success("Serviço excluído");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  const noCompany = !companyId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Serviços adicionais"
        description="Serviços extras vendidos com a vaga (ex: lava-jato). Defina o catálogo da empresa e habilite por unidade."
        actions={
          <Button onClick={openCreate} size="sm" disabled={noCompany}>
            <Plus className="h-4 w-4" /> Novo serviço
          </Button>
        }
      />

      {noCompany ? (
        <EmptyState
          title="Sem empresa vinculada"
          description="Solicite à equipe Movepark a vinculação da sua empresa."
        />
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-10 w-10" />}
          title="Nenhum serviço cadastrado"
          description="Crie o primeiro serviço adicional da sua empresa."
          action={
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4" /> Novo serviço
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Preço base</TableHead>
                <TableHead>Unidades ativas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium text-ink">
                    {a.name}
                    {a.description && (
                      <div className="text-caption text-muted">{a.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatBRL(Number(a.base_price))}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => openAvailability(a)}
                      className="inline-flex items-center gap-1 text-body-sm text-mp-primary hover:underline"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {activeLocationCount(a.availability)} unidade(s)
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge tone={a.is_active ? "confirmed" : "pending"}>
                      {a.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(a)}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openAvailability(a)}>
                        Disponibilidade
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(a)}
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

      {companyId && (
        <>
          <AddonForm
            open={formOpen}
            companyId={companyId}
            addon={editing}
            onOpenChange={setFormOpen}
          />
          <AddonAvailability
            open={availOpen}
            companyId={companyId}
            addon={availFor}
            onOpenChange={setAvailOpen}
          />
        </>
      )}
    </div>
  );
}
