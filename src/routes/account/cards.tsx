import * as React from "react";
import { toast } from "sonner";
import { CreditCard, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { AccountCard, AccountRow, RowAction } from "@/components/shared/AccountCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
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
  if (!month || !year) return null;
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
  const [pendingDelete, setPendingDelete] = React.useState<PaymentMethodRow | null>(null);

  async function makeDefault(c: PaymentMethodRow) {
    if (!session) return;
    try {
      await setDefault.mutateAsync({ id: c.id, profileId: session.userId });
      toast.success("Cartão padrão atualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success("Cartão removido");
      setPendingDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-display-xl text-ink">Cartões</h1>
        <p className="mt-2 text-body-md text-muted">Cartões salvos pra reservar mais rápido.</p>
      </header>

      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AccountCard
          title="Cartões salvos"
          subtitle="Usados no checkout e nas cobranças de extensão."
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo cartão
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
              icon={<CreditCard className="h-10 w-10" />}
              title="Cadastre seu primeiro cartão"
              description="Ele vai aparecer pré-selecionado no checkout."
            />
          ) : (
            <ul className="space-y-3">
              {list.data?.map((c) => {
                const vence = formatExpiry(c.expiry_month, c.expiry_year);
                return (
                  <AccountRow
                    key={c.id}
                    icon={<CreditCard className="h-5 w-5" />}
                    title={`${brandLabels[c.brand] ?? "Cartão"} •••• ${c.last4}`}
                    isDefault={c.is_default}
                    detail={
                      [c.holder_name, vence ? `vence ${vence}` : null]
                        .filter(Boolean)
                        .join(" · ") || null
                    }
                    actions={
                      <>
                        {!c.is_default && (
                          <RowAction tone="primary" onClick={() => makeDefault(c)}>
                            Tornar padrão
                          </RowAction>
                        )}
                        <RowAction tone="danger" onClick={() => setPendingDelete(c)}>
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

        <section className="rounded-lg border border-hairline bg-canvas p-5 desktop:p-7">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mp-pale text-mp-indigo">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-title-md text-ink">O número nunca fica com a gente</h2>
              <p className="mt-2 text-body-sm leading-relaxed text-muted">
                No nosso banco ficam só a bandeira e os 4 últimos dígitos. O número completo não é
                gravado em lugar nenhum.
              </p>
            </div>
          </div>
          {/* O cadastro de cartão salvo ainda é simulado. Esconder isso deixaria o
              cliente achar que já dá pra cobrar por aqui. */}
          <p className="mt-5 border-t border-hairline pt-5 text-caption-sm leading-relaxed text-muted">
            Por enquanto o cartão salvo serve pra simular o fluxo de reserva. A cobrança de verdade
            passa pelo gateway, no checkout.
          </p>
        </section>
      </div>

      <PaymentMethodForm open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Remover o cartão •••• ${pendingDelete?.last4 ?? ""}?`}
        description="Ele sai da sua lista. Suas reservas já pagas não mudam."
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
