import * as React from "react";
import { toast } from "sonner";
import { Car, MoreVertical, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { VehicleForm } from "@/features/vehicles/VehicleForm";
import {
  useDeleteVehicle,
  useMyVehicles,
  useUpdateVehicle,
  type Vehicle,
} from "@/features/vehicles/api";
import { useAuth } from "@/auth/context";

export default function VehiclesPage() {
  const { session } = useAuth();
  const list = useMyVehicles(session?.userId);
  const update = useUpdateVehicle();
  const remove = useDeleteVehicle();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Vehicle | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(v: Vehicle) {
    setEditing(v);
    setFormOpen(true);
  }

  async function makeDefault(v: Vehicle) {
    if (!session) return;
    try {
      await update.mutateAsync({
        id: v.id,
        profileId: session.userId,
        patch: { is_default: true },
      });
      toast.success(`${v.license_plate} agora é o padrão`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleDelete(v: Vehicle) {
    if (!confirm(`Remover o veículo ${v.license_plate}?`)) return;
    try {
      await remove.mutateAsync(v.id);
      toast.success("Veículo removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Veículos"
        description="Salve veículos pra agilizar suas reservas."
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" />
            Novo veículo
          </Button>
        }
      />

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : list.data?.length === 0 ? (
        <EmptyState
          icon={<Car className="h-10 w-10" />}
          title="Cadastre seu primeiro veículo"
          description="Vai aparecer pré-selecionado nas próximas reservas."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo veículo
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.data?.map((v) => (
            <li
              key={v.id}
              className="flex items-center gap-4 rounded-md border border-hairline bg-canvas p-4"
            >
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                <Car className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-title-md text-ink">
                    {v.license_plate}
                  </span>
                  {v.is_default && (
                    <Badge tone="active">
                      <Star className="mr-1 h-3 w-3" />
                      Padrão
                    </Badge>
                  )}
                </div>
                <div className="text-body-sm text-muted">
                  {[v.model, v.color].filter(Boolean).join(" · ") ||
                    "Sem detalhes adicionais"}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Mais opções">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(v)}>
                    Editar
                  </DropdownMenuItem>
                  {!v.is_default && (
                    <DropdownMenuItem onClick={() => makeDefault(v)}>
                      Tornar padrão
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="!text-error"
                    onClick={() => handleDelete(v)}
                  >
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <VehicleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        vehicle={editing}
      />
    </div>
  );
}
