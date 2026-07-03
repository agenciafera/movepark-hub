import * as React from "react";
import { toast } from "sonner";
import { MapPin, MoreVertical, Plus, Star } from "lucide-react";
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
import { AddressForm } from "@/features/addresses/AddressForm";
import {
  useDeleteAddress,
  useMyAddresses,
  useUpdateAddress,
} from "@/features/addresses/api";
import { useAuth } from "@/auth/context";
import type { Database } from "@/types/database";

type AddressRow = Database["public"]["Tables"]["address"]["Row"];

function formatAddress(a: AddressRow) {
  const line1 = [a.street, a.number].filter(Boolean).join(", ");
  const line2 = [a.district, a.city, a.state].filter(Boolean).join(" · ");
  return { line1, line2 };
}

export default function AddressesPage() {
  const { session } = useAuth();
  const list = useMyAddresses(session?.userId);
  const update = useUpdateAddress();
  const remove = useDeleteAddress();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AddressRow | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(a: AddressRow) {
    setEditing(a);
    setFormOpen(true);
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

  async function handleDelete(a: AddressRow) {
    if (!confirm(`Remover o endereço ${a.label || a.street}?`)) return;
    try {
      await remove.mutateAsync(a.id);
      toast.success("Endereço removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Endereços"
        description="Cadastre endereços pra agilizar reservas e referência."
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" />
            Novo endereço
          </Button>
        }
      />

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
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo endereço
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.data?.map((a) => {
            const { line1, line2 } = formatAddress(a);
            return (
              <li
                key={a.id}
                className="flex items-start gap-4 rounded-md border border-hairline bg-canvas p-4"
              >
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-title-md text-ink">
                      {a.label || "Endereço"}
                    </span>
                    {a.is_default && (
                      <Badge tone="active">
                        <Star className="mr-1 h-3 w-3" />
                        Padrão
                      </Badge>
                    )}
                  </div>
                  <div className="text-body-sm text-ink">{line1}</div>
                  {line2 && (
                    <div className="text-body-sm text-muted">{line2}</div>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Mais opções">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(a)}>
                      Editar
                    </DropdownMenuItem>
                    {!a.is_default && (
                      <DropdownMenuItem onClick={() => makeDefault(a)}>
                        Tornar padrão
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="!text-error"
                      onClick={() => handleDelete(a)}
                    >
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      <AddressForm
        open={formOpen}
        onOpenChange={setFormOpen}
        address={editing}
      />
    </div>
  );
}
