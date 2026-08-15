import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { Plus } from "@phosphor-icons/react";
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
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/features/companies/api";
import { useLocationsByCompany } from "@/features/locations/api";
import { LocationForm } from "@/features/locations/LocationForm";
import { LocationPlatformDialog } from "@/features/locations/LocationPlatformDialog";
import type { CheckoutMode, Location } from "@/types/domain";

export default function ManagerLocations() {
  const { id: companyId } = useParams<{ id: string }>();
  const company = useCompany(companyId);
  const { data, isLoading } = useLocationsByCompany(companyId);
  const [editing, setEditing] = React.useState<Location | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  // Só o id fica no estado, e a linha sai da lista já carregada. Guardar o objeto congelava um
  // retrato do clique: o diálogo grava, a query invalida e recarrega, e o interruptor continuava
  // mostrando o valor velho até fechar e abrir de novo.
  const [platformForId, setPlatformForId] = React.useState<string | null>(null);
  const platformFor = (data ?? []).find((l) => l.id === platformForId) ?? null;

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
        <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Fuso</TableHead>
                <TableHead>Plataforma</TableHead>
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
                  {/* Os dois campos que só a Movepark define (E0.14 + Go2Park), na mesma célula:
                      é o mesmo diálogo que edita os dois, e coluna separada por campo faria a
                      tabela crescer a cada decisão de plataforma nova. */}
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(loc.checkout_mode as CheckoutMode) === "external" ? (
                        <Badge tone="pending">Externo</Badge>
                      ) : (
                        <Badge tone="neutral">Hub</Badge>
                      )}
                      {loc.go2park_enabled && <Badge tone="active">Go2Park</Badge>}
                    </div>
                  </TableCell>
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
                      <Button size="sm" variant="ghost" onClick={() => setPlatformForId(loc.id)}>
                        Plataforma
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

      {platformFor && (
        <LocationPlatformDialog
          open
          locationId={platformFor.id}
          locationName={platformFor.name}
          mode={platformFor.checkout_mode as CheckoutMode}
          go2park={platformFor.go2park_enabled}
          onOpenChange={(o) => !o && setPlatformForId(null)}
        />
      )}
    </div>
  );
}
