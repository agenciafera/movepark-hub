import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateRangeField } from "@/features/search/DateRangeField";
import { useCreateFareUpgrade, type FareUpgradeResponse } from "@/features/fares/api";
import {
  type ChangePaidDatesQuote,
  type ChangePaidDatesResult,
  useChangePaidBookingDates,
  useQuotePaidBookingDates,
} from "./customerApi";
import { mensagemDaTroca } from "./changeDatesPaid.logic";
import { PixChargePanel } from "./PixChargePanel";
import {
  datesLanded,
  pixMessage,
  staffQuoteSummary,
  staffQuoteText,
  tierLanded,
} from "./staffChange.logic";

export type StaffBooking = {
  code: string;
  check_in_at: string;
  check_out_at: string;
  fare_tier: string | null;
};

type Props = {
  booking: StaffBooking;
  /** O Manager (equipe da Movepark) pode trocar a Básica sem cobrar o upgrade, com motivo. */
  canWaiveUpgrade: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Liga a releitura da reserva enquanto um PIX espera pagamento. */
  onWaitingChange: (waiting: boolean) => void;
};

type Etapa =
  | { tipo: "datas" }
  | { tipo: "valor"; cotacao: ChangePaidDatesQuote }
  | { tipo: "pix_datas"; cobranca: Extract<ChangePaidDatesResult, { mode: "charge" }> }
  | { tipo: "pix_upgrade"; cobranca: FareUpgradeResponse; cotacao: ChangePaidDatesQuote }
  | { tipo: "pago"; texto: string };

/**
 * Alterar datas de reserva paga pela equipe (26/11/2026). Mesma Edge e mesma conta do cliente
 * (tabela da compra); o que muda é que a equipe só gera PIX e que a reserva Básica leva o upgrade
 * para o Flex junto, porque o plano dela não inclui alterar datas. Quando não há diferença a cobrar,
 * o upgrade vem antes e a troca é feita sozinha assim que ele é pago.
 */
export function StaffChangeDatesDialog({ booking, canWaiveUpgrade, open, onOpenChange, onWaitingChange }: Props) {
  const cotar = useQuotePaidBookingDates();
  const trocar = useChangePaidBookingDates();
  const upgrade = useCreateFareUpgrade();
  const [from, setFrom] = React.useState<Date | null>(new Date(booking.check_in_at));
  const [to, setTo] = React.useState<Date | null>(new Date(booking.check_out_at));
  const [etapa, setEtapa] = React.useState<Etapa>({ tipo: "datas" });
  const [dispensar, setDispensar] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const trocandoRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    setFrom(new Date(booking.check_in_at));
    setTo(new Date(booking.check_out_at));
    setEtapa({ tipo: "datas" });
    setDispensar(false);
    setMotivo("");
    trocandoRef.current = false;
    // Só ao abrir: a reserva relida durante o PIX não pode zerar a janela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const periodo = React.useMemo(
    () => (from && to ? { checkInAt: from.toISOString(), checkOutAt: to.toISOString() } : null),
    [from, to],
  );
  const esperando = etapa.tipo === "pix_datas" || etapa.tipo === "pix_upgrade";
  React.useEffect(() => {
    onWaitingChange(open && esperando);
  }, [open, esperando, onWaitingChange]);

  // PIX da diferença: pago quando a reserva relida já tem as datas pedidas.
  React.useEffect(() => {
    if (etapa.tipo === "pix_datas" && periodo && datesLanded(booking, periodo)) {
      setEtapa({ tipo: "pago", texto: "As novas datas já estão na reserva e o cliente recebeu o aviso." });
    }
  }, [booking, etapa.tipo, periodo]);

  // PIX do upgrade: pago quando a reserva virou Flex. Aí a troca vai sozinha, agora sem upgrade.
  React.useEffect(() => {
    if (etapa.tipo !== "pix_upgrade" || !periodo || trocandoRef.current) return;
    if (!tierLanded(booking.fare_tier, "flex")) return;
    trocandoRef.current = true;
    void (async () => {
      try {
        const res = await trocar.mutateAsync({
          bookingCode: booking.code,
          ...periodo,
          expectedDeltaCents: etapa.cotacao.delta_cents,
        });
        if (res.mode === "charge") {
          setEtapa({ tipo: "pix_datas", cobranca: res });
          return;
        }
        setEtapa({ tipo: "pago", texto: `Upgrade pago. ${mensagemDaTroca(res)}` });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "O upgrade entrou, mas a troca falhou.");
        setEtapa({ tipo: "datas" });
      }
    })();
  }, [booking.fare_tier, booking.code, etapa, periodo, trocar]);

  async function verValor(semUpgrade = dispensar) {
    if (!from || !to || to <= from || !periodo) {
      toast.error("Escolha um período válido.");
      return;
    }
    try {
      const cotacao = await cotar.mutateAsync({
        bookingCode: booking.code,
        ...periodo,
        waiveFareUpgrade: canWaiveUpgrade && semUpgrade,
      });
      setEtapa({ tipo: "valor", cotacao });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui calcular o valor.");
    }
  }

  async function confirmar(cotacao: ChangePaidDatesQuote) {
    if (!periodo) return;
    const resumo = staffQuoteSummary(cotacao);
    try {
      if (resumo.kind === "upgrade_first") {
        const cobranca = await upgrade.mutateAsync({ booking_code: booking.code, target_tier: "flex" });
        setEtapa({ tipo: "pix_upgrade", cobranca, cotacao });
        return;
      }
      const semUpgrade = canWaiveUpgrade && dispensar;
      if (semUpgrade && !motivo.trim()) {
        toast.error("Diga o motivo de não cobrar o upgrade.");
        return;
      }
      const res = await trocar.mutateAsync({
        bookingCode: booking.code,
        ...periodo,
        expectedDeltaCents: cotacao.delta_cents,
        waiveFareUpgrade: semUpgrade,
        reason: semUpgrade ? motivo.trim() : null,
      });
      if (res.mode === "charge") {
        setEtapa({ tipo: "pix_datas", cobranca: res });
        return;
      }
      setEtapa({ tipo: "pago", texto: mensagemDaTroca(res) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui alterar as datas.");
      // O valor pode ter mudado desde a prévia: mostra o novo antes de qualquer coisa.
      void verValor();
    }
  }

  const ocupado = cotar.isPending || trocar.isPending || upgrade.isPending;
  const exigeUpgrade = etapa.tipo === "valor" && !!etapa.cotacao.fare_upgrade;
  const mostraDispensa = canWaiveUpgrade && (exigeUpgrade || dispensar);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar datas</DialogTitle>
          <DialogDescription>
            A diferença sai da tabela de preço do dia da compra. Antes de confirmar, você vê quanto o
            cliente paga ou recebe de volta.
          </DialogDescription>
        </DialogHeader>

        {etapa.tipo === "datas" && (
          <>
            <div className="rounded-md border border-hairline">
              <div className="grid grid-cols-2 divide-x divide-hairline">
                <DateRangeField mode="check-in" date={from} onChange={setFrom} />
                <DateRangeField mode="check-out" date={to} onChange={setTo} minDate={from ?? undefined} />
              </div>
            </div>
            <Button className="w-full" onClick={() => void verValor()} disabled={ocupado}>
              {cotar.isPending ? "Calculando…" : "Ver o valor"}
            </Button>
          </>
        )}

        {etapa.tipo === "valor" && (
          <ValorDaTroca
            cotacao={etapa.cotacao}
            mostraDispensa={mostraDispensa}
            dispensar={dispensar}
            motivo={motivo}
            ocupado={ocupado}
            onDispensar={(v) => {
              setDispensar(v);
              void verValor(v);
            }}
            onMotivo={setMotivo}
            onConfirmar={() => void confirmar(etapa.cotacao)}
            onVoltar={() => setEtapa({ tipo: "datas" })}
          />
        )}

        {etapa.tipo === "pix_datas" && (
          <PixChargePanel
            amount={etapa.cobranca.charge_amount ?? etapa.cobranca.delta}
            qrCode={etapa.cobranca.qr_code}
            expiresAt={etapa.cobranca.expires_at}
            message={pixMessage({ code: booking.code, amount: etapa.cobranca.charge_amount ?? etapa.cobranca.delta, what: "datas" })}
            paid={false}
            paidText=""
          />
        )}

        {etapa.tipo === "pix_upgrade" && (
          <PixChargePanel
            amount={etapa.cobranca.delta}
            qrCode={etapa.cobranca.qr_code}
            expiresAt={etapa.cobranca.expires_at}
            message={pixMessage({ code: booking.code, amount: etapa.cobranca.delta, what: "upgrade" })}
            paid={false}
            paidText=""
          />
        )}

        {etapa.tipo === "pago" && <PixChargePanel amount={0} qrCode={null} expiresAt={null} message="" paid paidText={etapa.texto} />}

        {(etapa.tipo === "pix_datas" || etapa.tipo === "pix_upgrade" || etapa.tipo === "pago") && (
          <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ValorDaTroca({
  cotacao,
  mostraDispensa,
  dispensar,
  motivo,
  ocupado,
  onDispensar,
  onMotivo,
  onConfirmar,
  onVoltar,
}: {
  cotacao: ChangePaidDatesQuote;
  mostraDispensa: boolean;
  dispensar: boolean;
  motivo: string;
  ocupado: boolean;
  onDispensar: (v: boolean) => void;
  onMotivo: (v: string) => void;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  const resumo = staffQuoteSummary(cotacao);
  const texto = staffQuoteText(resumo);
  const botao =
    resumo.kind === "charge"
      ? "Gerar o PIX"
      : resumo.kind === "upgrade_first"
        ? "Gerar o PIX do upgrade"
        : resumo.kind === "unavailable"
          ? null
          : "Confirmar novas datas";
  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-md border border-hairline bg-surface-soft p-4" data-testid="cotacao-equipe">
        <p className="text-body-md font-medium text-ink">{texto.titulo}</p>
        <p className="text-pretty text-body-sm text-muted">{texto.detalhe}</p>
      </div>
      {mostraDispensa && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox id="dispensar-upgrade" checked={dispensar} onCheckedChange={(v) => onDispensar(v === true)} />
            <Label htmlFor="dispensar-upgrade">Não cobrar o upgrade (cortesia da Movepark)</Label>
          </div>
          {dispensar && (
            <Textarea
              aria-label="Motivo"
              placeholder="Motivo, que fica no histórico da reserva"
              value={motivo}
              maxLength={300}
              onChange={(e) => onMotivo(e.target.value)}
            />
          )}
        </div>
      )}
      {botao && (
        <Button className="w-full" onClick={onConfirmar} disabled={ocupado}>
          {ocupado ? "Um instante…" : botao}
        </Button>
      )}
      <Button variant="secondary" className="w-full" onClick={onVoltar}>
        Escolher outras datas
      </Button>
    </div>
  );
}
