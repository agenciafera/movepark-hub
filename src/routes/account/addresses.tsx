import * as React from "react";
import { toast } from "sonner";
import { MagnifyingGlass, MapPin, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { AccountCard, AccountRow, RowAction } from "@/components/shared/AccountCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AddressForm } from "@/features/addresses/AddressForm";
import { useDeleteAddress, useMyAddresses, useUpdateAddress } from "@/features/addresses/api";
import { useAuth } from "@/auth/context";
import type { Database } from "@/types/database";

type AddressRow = Database["public"]["Tables"]["address"]["Row"];

function formatAddress(a: AddressRow) {
  const line1 = [a.street, a.number].filter(Boolean).join(", ");
  const line2 = [a.district, a.city, a.state].filter(Boolean).join(" · ");
  return { line1, line2 };
}

function cepMask(value: string) {
  const v = value.replace(/\D/g, "").slice(0, 8);
  return v.length <= 5 ? v : `${v.slice(0, 5)}-${v.slice(5)}`;
}

export default function AddressesPage() {
  const { session } = useAuth();
  const list = useMyAddresses(session?.userId);
  const update = useUpdateAddress();
  const remove = useDeleteAddress();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AddressRow | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AddressRow | null>(null);
  const [cep, setCep] = React.useState("");
  const [seedCep, setSeedCep] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setSeedCep(null);
    setFormOpen(true);
  }
  function openEdit(a: AddressRow) {
    setEditing(a);
    setSeedCep(null);
    setFormOpen(true);
  }

  /** O card lateral leva o CEP até o formulário, que consulta e preenche sozinho. */
  function openFromCep() {
    if (cep.replace(/\D/g, "").length !== 8) {
      toast.error("Digite os 8 dígitos do CEP");
      return;
    }
    setEditing(null);
    setSeedCep(cep);
    setFormOpen(true);
    setCep("");
  }

  async function makeDefault(a: AddressRow) {
    if (!session) return;
    try {
      await update.mutateAsync({
        id: a.id,
        profileId: session.userId,
        patch: { is_default: true },
      });
      toast.success(`${a.label || a.street} agora é o padrão`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success("Endereço removido");
      setPendingDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <AccountCard
        title="Endereços salvos"
        subtitle="Usados como referência nas suas reservas."
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" />
            Novo endereço
          </Button>
        }
      >
        {list.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-md" />
            ))}
          </div>
        ) : list.data?.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-10 w-10" />}
            title="Cadastre seu primeiro endereço"
            description="Pode ser casa, trabalho ou destino frequente."
          />
        ) : (
          <ul className="space-y-3">
            {list.data?.map((a) => {
              const { line1, line2 } = formatAddress(a);
              return (
                <AccountRow
                  key={a.id}
                  icon={<MapPin className="h-5 w-5" />}
                  // Sem apelido, o endereço se identifica pelo logradouro.
                  title={a.label || line1 || "Endereço"}
                  isDefault={a.is_default}
                  detail={
                    <>
                      {a.label && <span className="block text-ink">{line1}</span>}
                      {line2 && <span className="block">{line2}</span>}
                    </>
                  }
                  actions={
                    <>
                      {!a.is_default && (
                        <RowAction tone="primary" onClick={() => makeDefault(a)}>
                          Tornar padrão
                        </RowAction>
                      )}
                      <RowAction onClick={() => openEdit(a)}>Editar</RowAction>
                      <RowAction tone="danger" onClick={() => setPendingDelete(a)}>
                        Remover
                      </RowAction>
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
      </AccountCard>

      <div className="space-y-5">
        <AccountCard
          title="Adicionar pelo CEP"
          subtitle="Preenchemos logradouro, bairro, cidade e UF. Você completa só o número."
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cep-lookup">CEP</Label>
            <div className="flex gap-2">
              <Input
                id="cep-lookup"
                value={cep}
                onChange={(e) => setCep(cepMask(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && openFromCep()}
                placeholder="00000-000"
                inputMode="numeric"
                maxLength={9}
              />
              <Button variant="secondary" onClick={openFromCep} className="shrink-0">
                <MagnifyingGlass className="h-4 w-4" />
                Buscar
              </Button>
            </div>
          </div>
          <p className="mt-4 text-caption-sm leading-relaxed text-muted">
            O apelido é opcional. Sem ele, o endereço aparece pelo logradouro.
          </p>
        </AccountCard>
      </div>

      <AddressForm
        open={formOpen}
        onOpenChange={setFormOpen}
        address={editing}
        initialCep={seedCep}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Remover o endereço ${pendingDelete?.label || pendingDelete?.street || ""}?`}
        description="Ele sai da sua lista. Suas reservas não mudam."
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
