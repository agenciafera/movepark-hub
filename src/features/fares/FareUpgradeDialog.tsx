import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL } from "@/lib/format";
import { fareReais, FARE_TIER_LABEL, type FareTier } from "@/lib/fares";
import { PixChargePanel } from "@/features/bookings/PixChargePanel";
import { ExtraChargeCardForm } from "@/features/bookings/ExtraChargeCardForm";
import { tierLanded } from "@/features/bookings/staffChange.logic";
import { useCreateFareUpgrade, useFareCatalog, type FareUpgradeResponse } from "./api";
import { FareUpgradeTable } from "./FareUpgradeTable";
import { defaultUpgradeTarget, upgradeColumns } from "./fareUpgrade.logic";

type Props = {
  bookingCode: string;
  currentTier: FareTier;
  currentFarePriceCents: number;
  /** Cartão só em reserva já paga; reserva pendente faz o upgrade no PIX (ou junto da compra). */
  cardAllowed?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Avisa a página que um PIX espera: ela relê a reserva até a tarifa mudar. */
  onWaitingChange?: (waiting: boolean) => void;
};

type Etapa = "escolher" | "pix" | "pago";

/**
 * Upgrade de Tarifa depois da compra (E2.8-d; reunião de 26/11/2026). O cliente compara as tarifas
 * numa tabela, escolhe e paga só a diferença, no PIX ou no cartão à vista. Com o PIX, a página relê a
 * reserva e o diálogo mostra "Pagamento recebido" quando a tarifa muda, sem precisar fechar.
 */
export function FareUpgradeDialog({
  bookingCode,
  currentTier,
  currentFarePriceCents,
  cardAllowed = false,
  open,
  onOpenChange,
  onWaitingChange,
}: Props) {
  const qc = useQueryClient();
  const catalog = useFareCatalog();
  const upgrade = useCreateFareUpgrade();
  const [target, setTarget] = React.useState<FareTier | null>(null);
  const [etapa, setEtapa] = React.useState<Etapa>("escolher");
  const [charge, setCharge] = React.useState<FareUpgradeResponse | null>(null);

  const fares = React.useMemo(() => catalog.data ?? [], [catalog.data]);
  const alvos = upgradeColumns(fares, currentTier).filter((f) => f.tier !== currentTier);
  const escolhida = alvos.find((f) => f.tier === target) ?? null;
  const deltaCents = escolhida ? Math.max(0, escolhida.price_cents - currentFarePriceCents) : 0;

  React.useEffect(() => {
    if (open && !target) setTarget(defaultUpgradeTarget(fares, currentTier));
  }, [open, target, fares, currentTier]);

  // O PIX entrou quando a reserva relida já está na tarifa escolhida (ou acima).
  const pago = etapa === "pago" || (etapa === "pix" && !!target && tierLanded(currentTier, target));
  React.useEffect(() => {
    onWaitingChange?.(open && etapa === "pix" && !pago);
  }, [open, etapa, pago, onWaitingChange]);
  React.useEffect(() => {
    if (pago) void qc.invalidateQueries({ queryKey: ["my-bookings"] });
  }, [pago, qc]);

  async function gerarPix() {
    if (!target) return;
    try {
      const res = await upgrade.mutateAsync({ booking_code: bookingCode, target_tier: target });
      setCharge(res);
      setEtapa("pix");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar o upgrade");
    }
  }

  function pagoNoCartao(applied: boolean) {
    void qc.invalidateQueries({ queryKey: ["booking-detail", bookingCode] });
    if (applied) {
      setEtapa("pago");
      return;
    }
    toast.success("Pagamento em análise. A tarifa muda quando ele for aprovado.");
    close(false);
  }

  function close(o: boolean) {
    if (!o) {
      setCharge(null);
      setTarget(null);
      setEtapa("escolher");
    }
    onOpenChange(o);
  }

  const novaTarifa = target ? FARE_TIER_LABEL[target] : "a nova tarifa";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fazer upgrade de Tarifa</DialogTitle>
          <DialogDescription>
            {pago
              ? `Sua reserva agora é ${novaTarifa}.`
              : "Compare o que cada tarifa inclui e pague só a diferença."}
          </DialogDescription>
        </DialogHeader>

        {pago ? (
          <div className="space-y-3">
            <PixChargePanel
              amount={0}
              qrCode={null}
              expiresAt={null}
              paid
              paidText={`Pagamento recebido. Os benefícios da ${novaTarifa} já valem nesta reserva.`}
            />
            <Button variant="secondary" className="w-full" onClick={() => close(false)}>
              Fechar
            </Button>
          </div>
        ) : etapa === "pix" && charge ? (
          <div className="space-y-3">
            <PixChargePanel
              amount={charge.delta}
              qrCode={charge.qr_code}
              expiresAt={charge.expires_at}
              forCustomer
              paid={false}
              paidText=""
            />
            <Button variant="secondary" className="w-full" onClick={() => close(false)}>
              Fechar
            </Button>
          </div>
        ) : catalog.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : alvos.length === 0 ? (
          <p className="text-body-sm text-muted">Você já está na Tarifa mais alta.</p>
        ) : (
          <div className="space-y-4">
            <FareUpgradeTable
              catalog={fares}
              currentTier={currentTier}
              currentPriceCents={currentFarePriceCents}
              selected={target}
              onSelect={setTarget}
            />
            <p className="text-caption text-muted">
              Você está na Tarifa {FARE_TIER_LABEL[currentTier]}. Sem reembolso se mudar de ideia.
            </p>

            {escolhida && (
              <Tabs defaultValue="pix">
                <TabsList className="w-full">
                  <TabsTrigger value="pix" className="flex-1">
                    PIX
                  </TabsTrigger>
                  {cardAllowed && (
                    <TabsTrigger value="card" className="flex-1">
                      Cartão
                    </TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="pix">
                  <Button
                    className="mt-2 w-full"
                    onClick={() => void gerarPix()}
                    disabled={upgrade.isPending}
                    data-testid="fare-upgrade-submit"
                  >
                    {upgrade.isPending ? "Gerando o PIX…" : `Pagar ${formatBRL(fareReais(deltaCents))} no PIX`}
                  </Button>
                </TabsContent>
                {cardAllowed && escolhida.tier !== "basica" && (
                  <TabsContent value="card">
                    <div className="mt-2">
                      <ExtraChargeCardForm
                        key={escolhida.tier}
                        bookingCode={bookingCode}
                        amountCents={deltaCents}
                        charge={{ kind: "fare_upgrade", targetTier: escolhida.tier }}
                        onPaid={pagoNoCartao}
                        onUsePix={() => void gerarPix()}
                      />
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
