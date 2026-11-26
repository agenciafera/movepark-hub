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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangeField } from "@/features/search/DateRangeField";
import { formatBRL } from "@/lib/format";
import {
  type ChangePaidDatesQuote,
  type ChangePaidDatesResult,
  useChangePaidBookingDates,
  useQuotePaidBookingDates,
} from "./customerApi";
import { descreverCotacao, mensagemDaTroca } from "./changeDatesPaid.logic";
import { ExtraChargeCardForm } from "./ExtraChargeCardForm";
import { PixChargePanel } from "./PixChargePanel";
import { datesLanded } from "./staffChange.logic";

type Props = {
  bookingCode: string;
  currentCheckIn: string;
  currentCheckOut: string;
  /** Parcelamento congelado na reserva: vale também para a diferença no cartão. */
  installmentsMax?: number | null;
  installmentsInterestFree?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Avisa a página que um PIX espera: ela relê a reserva até as datas mudarem. */
  onWaitingChange?: (waiting: boolean) => void;
};

type Etapa = "datas" | "valor" | "pix";

/**
 * Altera as datas de uma reserva PAGA (E2.8-h; regra de 17/11/2026, docs/specs/booking-modifications.md §8).
 * Primeiro o cliente vê quanto paga ou recebe de volta, pela tabela de preço da compra, e só depois
 * confirma. Mais caro: paga a diferença no PIX ou no cartão e as datas mudam quando aprovar. Mais
 * barato ou igual: muda na hora e devolve a diferença.
 */
export function ChangeDatesPaidDialog({
  bookingCode,
  currentCheckIn,
  currentCheckOut,
  installmentsMax,
  installmentsInterestFree,
  open,
  onOpenChange,
  onWaitingChange,
}: Props) {
  const qc = useQueryClient();
  const cotar = useQuotePaidBookingDates();
  const change = useChangePaidBookingDates();
  const [from, setFrom] = React.useState<Date | null>(new Date(currentCheckIn));
  const [to, setTo] = React.useState<Date | null>(new Date(currentCheckOut));
  const [etapa, setEtapa] = React.useState<Etapa>("datas");
  const [cotacao, setCotacao] = React.useState<ChangePaidDatesQuote | null>(null);
  const [charge, setCharge] = React.useState<Extract<ChangePaidDatesResult, { mode: "charge" }> | null>(null);

  // Zera só ao ABRIR. Antes zerava também quando as datas da reserva mudavam, e é exatamente isso que
  // acontece quando o PIX entra: a tela voltaria para o calendário em vez de dizer que deu certo.
  const abertoAntes = React.useRef(false);
  React.useEffect(() => {
    if (open && !abertoAntes.current) {
      setFrom(new Date(currentCheckIn));
      setTo(new Date(currentCheckOut));
      setEtapa("datas");
      setCotacao(null);
      setCharge(null);
    }
    abertoAntes.current = open;
  }, [open, currentCheckIn, currentCheckOut]);

  const periodo = from && to ? { checkInAt: from.toISOString(), checkOutAt: to.toISOString() } : null;

  // O PIX entrou quando a reserva relida já tem as datas pedidas (a página relê a cada 3 s).
  const pago =
    etapa === "pix" && !!periodo && datesLanded({ check_in_at: currentCheckIn, check_out_at: currentCheckOut }, periodo);
  React.useEffect(() => {
    onWaitingChange?.(open && etapa === "pix" && !pago);
  }, [open, etapa, pago, onWaitingChange]);
  React.useEffect(() => {
    if (!pago) return;
    void qc.invalidateQueries({ queryKey: ["my-bookings"] });
  }, [pago, qc]);

  async function verValor() {
    if (!from || !to || to <= from || !periodo) {
      toast.error("Escolha um período válido.");
      return;
    }
    try {
      const q = await cotar.mutateAsync({ bookingCode, ...periodo });
      setCotacao(q);
      setEtapa("valor");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui calcular o valor.");
    }
  }

  function terminar(mensagem: string) {
    toast.success(mensagem);
    void qc.invalidateQueries({ queryKey: ["my-bookings"] });
    void qc.invalidateQueries({ queryKey: ["booking-detail"] });
    onOpenChange(false);
  }

  async function confirmarOuPix() {
    if (!periodo || !cotacao) return;
    try {
      const res = await change.mutateAsync({ bookingCode, ...periodo, expectedDeltaCents: cotacao.delta_cents });
      if (res.mode === "charge") {
        setCharge(res);
        setEtapa("pix");
        return;
      }
      terminar(mensagemDaTroca(res));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar datas");
      // O valor pode ter mudado desde a prévia: mostra o novo antes de qualquer coisa.
      void verValor();
    }
  }

  const resumo = cotacao ? descreverCotacao(cotacao) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar datas</DialogTitle>
          <DialogDescription>
            {etapa === "pix"
              ? pago
                ? "As novas datas já estão na sua reserva."
                : "Pague a diferença por PIX para confirmar as novas datas."
              : "Escolha o novo período. Antes de confirmar, você vê quanto paga ou recebe de volta."}
          </DialogDescription>
        </DialogHeader>

        {etapa === "datas" && (
          <>
            <div className="rounded-md border border-hairline">
              <div className="grid grid-cols-2 divide-x divide-hairline">
                <DateRangeField mode="check-in" date={from} onChange={setFrom} />
                <DateRangeField mode="check-out" date={to} onChange={setTo} minDate={from ?? undefined} />
              </div>
            </div>
            <Button className="w-full" onClick={verValor} disabled={cotar.isPending}>
              {cotar.isPending ? "Calculando…" : "Ver o valor"}
            </Button>
          </>
        )}

        {etapa === "valor" && cotacao && resumo && periodo && (
          <div className="space-y-4">
            <div className="space-y-1 rounded-md border border-hairline bg-surface-soft p-4" data-testid="cotacao-datas">
              <p className="text-body-md font-medium text-ink">{resumo.titulo}</p>
              <p className="text-pretty text-body-sm text-muted">{resumo.detalhe}</p>
            </div>

            {resumo.acao === "confirmar" && (
              <Button className="w-full" onClick={confirmarOuPix} disabled={change.isPending}>
                {change.isPending ? "Alterando…" : "Confirmar novas datas"}
              </Button>
            )}

            {resumo.acao === "pagar" && cotacao.delta_cents != null && (
              <Tabs defaultValue="pix">
                <TabsList className="w-full">
                  <TabsTrigger value="pix" className="flex-1">PIX</TabsTrigger>
                  {cotacao.card_allowed && <TabsTrigger value="card" className="flex-1">Cartão</TabsTrigger>}
                </TabsList>
                <TabsContent value="pix">
                  <Button className="mt-2 w-full" onClick={confirmarOuPix} disabled={change.isPending}>
                    {change.isPending ? "Gerando o PIX…" : `Pagar ${formatBRL(cotacao.delta_cents / 100)} no PIX`}
                  </Button>
                </TabsContent>
                {cotacao.card_allowed && (
                  <TabsContent value="card">
                    <div className="mt-2">
                      <ExtraChargeCardForm
                        bookingCode={bookingCode}
                        amountCents={cotacao.delta_cents}
                        charge={{ kind: "date_change", checkInAt: periodo.checkInAt, checkOutAt: periodo.checkOutAt }}
                        installmentsMax={installmentsMax}
                        installmentsInterestFree={installmentsInterestFree}
                        onPaid={(applied) =>
                          terminar(applied ? "Pagamento aprovado. Datas alteradas." : "Pagamento em análise. As datas mudam quando ele for aprovado.")
                        }
                        onUsePix={() => void confirmarOuPix()}
                      />
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            )}

            <Button variant="secondary" className="w-full" onClick={() => setEtapa("datas")}>
              Escolher outras datas
            </Button>
          </div>
        )}

        {etapa === "pix" && charge && (
          <div className="space-y-3">
            <PixChargePanel
              amount={charge.charge_amount ?? charge.delta}
              qrCode={charge.qr_code}
              expiresAt={charge.expires_at}
              forCustomer
              paid={pago}
              paidText="Pagamento recebido. As novas datas já valem e o voucher foi atualizado."
            />
            <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
