import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCompany } from "@/features/companies/api";
import { useLocationsByCompany } from "@/features/locations/api";
import { LocationForm } from "@/features/locations/LocationForm";
import type { EntityStatus, Location } from "@/types/domain";

const statusTone: Record<EntityStatus, "confirmed" | "pending" | "cancelled"> = {
  active: "confirmed",
  inactive: "pending",
  suspended: "cancelled",
};

export default function ManagerLocations() {
  const { id: companyId } = useParams<{ id: string }>();
  const company = useCompany(companyId);
  const { data, isLoading } = useLocationsByCompany(companyId);
  const [editing, setEditing] = React.useState<Location | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Localizações${company.data ? ` — ${company.data.name}` : ""}`}
        description="Unidades operacionais da empresa."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/manager/companies">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Link>
            </Button>
            <Button size="sm" onClick={openCreate} disabled={!companyId}>
              <Plus className="h-4 w-4" /> Nova localização
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Sem localizações"
          description="Cadastre a primeira localização para essa empresa."
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Fuso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((loc) => (
                <TableRow key={loc.id}>
                  <TableCell className="text-ink">{loc.name}</TableCell>
                  <TableCell className="text-caption text-muted">/{loc.slug}</TableCell>
                  <TableCell>{loc.address ?? "—"}</TableCell>
                  <TableCell>{loc.timezone}</TableCell>
                  <TableCell>
                    <Badge tone={statusTone[loc.status]}>{loc.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditing(loc);
                          setFormOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link
                          to={`/manager/companies/${companyId}/locations/${loc.id}/parking-types`}
                        >
                          Tipos de vaga
                        </Link>
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
        <LocationForm
          open={formOpen}
          companyId={companyId}
          location={editing}
          onOpenChange={setFormOpen}
        />
      )}
    </div>
  );
}
