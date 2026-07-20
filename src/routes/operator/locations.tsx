import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOperatorLocations } from "@/features/locations/api";
import { LocationForm } from "@/features/locations/LocationForm";
import { useAuth } from "@/auth/context";
import type { Location, EntityStatus } from "@/types/domain";

const statusTone: Record<EntityStatus, "confirmed" | "pending" | "cancelled"> = {
  active: "confirmed",
  inactive: "pending",
  suspended: "cancelled",
};

export default function OperatorLocations() {
  const { effectiveCompanyIds } = useAuth();
  const { data, isLoading } = useOperatorLocations(effectiveCompanyIds);
  const [editing, setEditing] = React.useState<(Location & { company_id: string }) | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: /operator/locations?edit=<id> abre direto o editor da unidade (usado pelo
  // "Adicionar mais fotos" da tela de preview). Consome o parâmetro após abrir.
  const editId = searchParams.get("edit");
  React.useEffect(() => {
    if (!editId || !data) return;
    const loc = data.find((l) => l.id === editId);
    if (loc) setEditing(loc as Location & { company_id: string });
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, data]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Localizações"
        description="Endereço, fotos e dados de cada unidade. Capacidade e preço ficam em Tipos de vaga."
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Sem localizações vinculadas"
          description="Solicite à equipe Movepark para cadastrar suas unidades."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          {data?.map((loc) => (
            <Card key={loc.id}>
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-title-md text-ink">{loc.name}</div>
                    <div className="text-caption text-muted">{loc.address ?? "Sem endereço"}</div>
                  </div>
                  <Badge tone={statusTone[loc.status]}>{loc.status}</Badge>
                </div>
                <div className="text-body-sm text-muted">
                  Fuso: {loc.timezone}
                  {loc.phone ? ` · Tel ${loc.phone}` : ""}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(loc as Location & { company_id: string })}
                  >
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/operator/locations/${loc.id}/parking-types`}>
                      Tipos de vaga
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <LocationForm
          open={!!editing}
          companyId={editing.company_id}
          location={editing}
          onOpenChange={(open) => !open && setEditing(null)}
          editableScope="operator"
        />
      )}
    </div>
  );
}
