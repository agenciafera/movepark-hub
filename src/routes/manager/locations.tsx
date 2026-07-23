import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { useCompany } from "@/features/companies/api";
import { useLocationsByCompany } from "@/features/locations/api";
import { LocationForm } from "@/features/locations/LocationForm";
import type { Location } from "@/types/domain";

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
        title={`Unidades${company.data ? ` · ${company.data.name}` : ""}`}
        description="Unidades operacionais da empresa."
        back={{ to: "/manager/companies", label: "Voltar para Empresas" }}
        actions={
          <Button size="sm" onClick={openCreate} disabled={!companyId}>
            <Plus className="h-4 w-4" /> Nova unidade
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Sem unidades"
          description="Cadastre a primeira unidade para essa empresa."
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Destino</TableHead>
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
                  <TableCell>{loc.address ?? "-"}</TableCell>
                  <TableCell>
                    {loc.destination
                      ? `${loc.destination.short_name ?? loc.destination.name} (${loc.destination.code})`
                      : "-"}
                  </TableCell>
                  <TableCell>{loc.timezone}</TableCell>
                  <TableCell>
                    <EntityStatusBadge status={loc.status} />
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
