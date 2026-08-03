import * as React from "react";
import { toast } from "sonner";
import { Car, Plus, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { AccountCard, AccountRow, RowAction } from "@/components/shared/AccountCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { VehicleForm } from "@/features/vehicles/VehicleForm";
import { PlateLookupField, type ConfirmedVehicle } from "@/features/vehicles/PlateLookupField";
import {
  useCreateVehicle,
  useDeleteVehicle,
  useMyVehicles,
  useUpdateVehicle,
  type Vehicle,
} from "@/features/vehicles/api";
import { useAuth } from "@/auth/context";

export default function VehiclesPage() {
  const { session } = useAuth();
  const list = useMyVehicles(session?.userId);
  const create = useCreateVehicle();
  const update = useUpdateVehicle();
  const remove = useDeleteVehicle();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Vehicle | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Vehicle | null>(null);
  const [manualPlate, setManualPlate] = React.useState<string | null>(null);
  // Remonta o campo de placa depois de salvar, pra ele voltar limpo.
  const [lookupKey, setLookupKey] = React.useState(0);

  function openEdit(v: Vehicle) {
    setEditing(v);
    setManualPlate(null);
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

  /** Confirmou o veículo que a consulta trouxe: grava direto, sem abrir o formulário. */
  async function saveFromLookup(data: ConfirmedVehicle) {
    if (!session) return;
    try {
      await create.mutateAsync({
        profile_id: session.userId,
        license_plate: data.license_plate,
        model: data.model ?? undefined,
        color: data.color ?? undefined,
        // O primeiro veículo entra como padrão: é o que o checkout vai pré-selecionar.
        is_default: (list.data?.length ?? 0) === 0,
      });
      toast.success("Veículo salvo");
      setLookupKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  /** A consulta não achou a placa: abre o formulário manual já com ela preenchida. */
  function openManual(plate: string) {
    setEditing(null);
    setManualPlate(plate);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success("Veículo removido");
      setPendingDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <AccountCard
        title="Veículos salvos"
        subtitle="O padrão vem pré-selecionado no checkout."
        action={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setManualPlate(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Novo veículo
          </Button>
        }
      >
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
          />
        ) : (
          <ul className="space-y-3">
            {list.data?.map((v) => (
              <AccountRow
                key={v.id}
                icon={<Car className="h-5 w-5" />}
                title={v.license_plate}
                isDefault={v.is_default}
                detail={[v.model, v.color].filter(Boolean).join(" · ") || "Sem detalhes adicionais"}
                actions={
                  <>
                    {!v.is_default && (
                      <RowAction tone="primary" onClick={() => makeDefault(v)}>
                        Tornar padrão
                      </RowAction>
                    )}
                    <RowAction onClick={() => openEdit(v)}>Editar</RowAction>
                    <RowAction tone="danger" onClick={() => setPendingDelete(v)}>
                      Remover
                    </RowAction>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </AccountCard>

      <div className="space-y-5">
        <AccountCard
          title="Adicionar pela placa"
          subtitle="Buscamos marca, modelo e cor automaticamente. Você só confere."
        >
          <PlateLookupField
            key={lookupKey}
            onConfirm={saveFromLookup}
            onManual={openManual}
            confirming={create.isPending}
          />
        </AccountCard>

        <section className="rounded-lg border border-hairline bg-surface-soft p-5 desktop:p-7">
          <div className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 shrink-0 text-mp-indigo" aria-hidden />
            <h2 className="text-title-md text-ink">A placa vale na portaria</h2>
          </div>
          <p className="mt-2 text-body-sm leading-relaxed text-muted">
            Muitos parceiros liberam a entrada só com a leitura da placa. Se ela estiver errada, o
            manobrista precisa conferir o voucher.
          </p>
        </section>
      </div>

      <VehicleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        vehicle={editing}
        initialPlate={manualPlate}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Remover o veículo ${pendingDelete?.license_plate ?? ""}?`}
        description="Ele sai da sua lista. As reservas que já usaram esse veículo continuam como estão."
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
