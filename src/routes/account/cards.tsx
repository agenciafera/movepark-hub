import * as React from "react";
import { toast } from "sonner";
import { CreditCard, Info, MoreVertical, Plus, Star } from "lucide-react";
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
import { PaymentMethodForm } from "@/features/payment-methods/PaymentMethodForm";
import {
  useDeletePaymentMethod,
  useMyPaymentMethods,
  useSetDefaultPaymentMethod,
} from "@/features/payment-methods/api";
import { useAuth } from "@/auth/context";
import type { Database } from "@/types/database";

type PaymentMethodRow = Database["public"]["Tables"]["payment_method"]["Row"];

const brandLabels: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  elo: "Elo",
  hipercard: "Hipercard",
  unknown: "Cartão",
};

function formatExpiry(month: number | null, year: number | null) {
  if (!month || !year) return "—";
  const mm = String(month).padStart(2, "0");
  const yy = String(year % 100).padStart(2, "0");
  return `${mm}/${yy}`;
}

export default function CardsPage() {
  const { session } = useAuth();
  const list = useMyPaymentMethods(session?.userId);
  const setDefault = useSetDefaultPaymentMethod();
  const remove = useDeletePaymentMethod();
  const [formOpen, setFormOpen] = React.useState(false);

  async function makeDefault(c: PaymentMethodRow) {
    if (!session) return;
    try {
      await setDefault.mutateAsync({
        id: c.id,
        profileId: session.userId,
      });
      toast.success("Cartão padrão atualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleDelete(c: PaymentMethodRow) {
    if (!confirm(`Remover o cartão •••• ${c.last4}?`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("Cartão removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartões"
        description="Cartões salvos pra reservar mais rápido."
        actions={
          <Button onClick={() => setFormOpen(true)} size="sm">
            <Plus className="h-4 w-4" />
            Novo cartão
          </Button>
        }
      />

      <div className="flex gap-3 rounded-md border border-hairline bg-mp-pale/40 p-4 text-body-sm text-mp-indigo">
        <Info className="h-4 w-4 shrink-0" />
        <p>
          Hoje os cartões são mockados pra simular o fluxo. Quando integrarmos
          gateway real, eles serão tokenizados. O número fica só com o
          gateway, nunca no nosso banco.
        </p>
      </div>

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : list.data?.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-10 w-10" />}
          title="Cadastre seu primeiro cartão"
          description="Ele vai aparecer pré-selecionado no checkout."
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo cartão
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.data?.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-4 rounded-md border border-hairline bg-canvas p-4"
            >
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                <CreditCard className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-title-md text-ink">
                    {brandLabels[c.brand] ?? "Cartão"} •••• {c.last4}
                  </span>
                  {c.is_default && (
                    <Badge tone="active">
                      <Star className="mr-1 h-3 w-3" />
                      Padrão
                    </Badge>
                  )}
                </div>
                <div className="text-body-sm text-muted">
                  {c.holder_name ? `${c.holder_name} · ` : ""}
                  Vencimento {formatExpiry(c.expiry_month, c.expiry_year)}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Mais opções">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!c.is_default && (
                    <DropdownMenuItem onClick={() => makeDefault(c)}>
                      Tornar padrão
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="!text-error"
                    onClick={() => handleDelete(c)}
                  >
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <PaymentMethodForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
