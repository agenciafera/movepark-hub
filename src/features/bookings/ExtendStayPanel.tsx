import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateTime } from "@/lib/format";
import {
  type ChangePaidDatesQuote,
  type ChangePaidDatesResult,
  useChangePaidBookingDates,
  useQuotePaidBookingDates,
} from "./customerApi";
import { PixChargePanel } from "./PixChargePanel";
import { pixMessage } from "./staffChange.logic";

export type ExtendTarget = {
  bookingCode: string;
  /** Entrada da reserva, que a extensão não muda. */
  checkInAt: string;
  /** Saída atual da reserva, relida enquanto o PIX espera: quando vira a pedida, ele entrou. */
  checkOutAt: string;
  onWaitingChange: (waiting: boolean) => void;
};

type Etapa =
  | { tipo: "fechado" }
  | { tipo: "previa"; cotacao: ChangePaidDatesQuote }
  | { tipo: "pix"; cobranca: Extract<ChangePaidDatesResult, { mode: "charge" }> }
  | { tipo: "feito"; texto: string };

const mesmoInstante = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

/**
 * Cobrar pelo Hub os dias a mais de quem já entrou (26/11/2026, parte 2). A saída da reserva passa
 * para a saída escolhida no card, e a diferença pela tabela da compra vai num PIX dividido como a
 * reserva. Quem calcula é o servidor (Edge `change-booking-dates-paid` com `extend`); o valor do
 * card é a mesma tabela e pode diferir só quando a reserva tem cupom.
 */
export function ExtendStayPanel({ alvo, saida }: { alvo: ExtendTarget; saida: string }) {
  const cotar = useQuotePaidBookingDates();
  const estender = useChangePaidBookingDates();
  const [etapa, setEtapa] = React.useState<Etapa>({ tipo: "fechado" });
  const { onWaitingChange } = alvo;

  // Mudou a saída escolhida no card: a prévia antiga não vale mais.
  React.useEffect(() => {
    setEtapa((e) => (e.tipo === "previa" ? { tipo: "fechado" } : e));
  }, [saida]);

  const esperando = etapa.tipo === "pix";
  React.useEffect(() => {
    onWaitingChange(esperando);
    return () => onWaitingChange(false);
  }, [esperando, onWaitingChange]);

  // PIX pago: a reserva relida já tem a saída nova.
  React.useEffect(() => {
    if (etapa.tipo === "pix" && mesmoInstante(alvo.checkOutAt, saida)) {
      setEtapa({ tipo: "feito", texto: `A saída da reserva agora é ${formatDateTime(saida)}.` });
    }
  }, [alvo.checkOutAt, etapa.tipo, saida]);

  const pedido = { bookingCode: alvo.bookingCode, checkInAt: alvo.checkInAt, checkOutAt: saida, extend: true };

  async function verValor() {
    try {
      setEtapa({ tipo: "previa", cotacao: await cotar.mutateAsync(pedido) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui calcular o valor.");
    }
  }

  async function confirmar(cotacao: ChangePaidDatesQuote) {
    try {
      const res = await estender.mutateAsync({ ...pedido, expectedDeltaCents: cotacao.delta_cents });
      if (res.mode === "charge") {
        setEtapa({ tipo: "pix", cobranca: res });
        return;
      }
      setEtapa({ tipo: "feito", texto: `Saída estendida para ${formatDateTime(saida)}, sem diferença a pagar.` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui estender a saída.");
      void verValor();
    }
  }

  if (etapa.tipo === "fechado") {
    return (
      <div>
        <Button size="sm" onClick={() => void verValor()} disabled={cotar.isPending}>
          {cotar.isPending ? "Calculando…" : "Cobrar pelo Hub"}
        </Button>
      </div>
    );
  }

  if (etapa.tipo === "previa") {
    const q = etapa.cotacao;
    const valor = q.charge_amount ?? q.delta ?? 0;
    return (
      <div className="flex flex-col gap-3 rounded-md border border-hairline bg-surface-soft p-4" data-testid="extensao-previa">
        {!q.available || q.delta == null ? (
          <p className="text-body-sm text-ink">{q.reason ?? "Não dá para estender para essa saída."}</p>
        ) : (
          <>
            <p className="text-body-md font-medium text-ink">
              {valor > 0 ? `O cliente paga ${formatBRL(valor)} no PIX` : "Sem diferença a pagar"}
            </p>
            <p className="text-pretty text-body-sm text-muted">
              A saída da reserva passa para {formatDateTime(saida)}.
              {valor > 0 ? " Ela muda quando o PIX for pago." : ""}
            </p>
            {q.access_provider === "cloudpark" && (
              <p className="rounded-sm border border-warning/40 bg-warning/5 p-2 text-body-sm text-ink" data-testid="aviso-cloudpark">
                Esta unidade manda as reservas para a cancela da Cloudpark, e a extensão não chega lá.
                Ajuste a saída deste cartão na Cloudpark para o cliente não pagar de novo na saída.
              </p>
            )}
            <Button size="sm" onClick={() => void confirmar(q)} disabled={estender.isPending}>
              {estender.isPending ? "Um instante…" : valor > 0 ? "Gerar o PIX" : "Estender a saída"}
            </Button>
          </>
        )}
        <Button size="sm" variant="secondary" onClick={() => setEtapa({ tipo: "fechado" })}>
          Voltar
        </Button>
      </div>
    );
  }

  if (etapa.tipo === "pix") {
    const valor = etapa.cobranca.charge_amount ?? etapa.cobranca.delta;
    return (
      <PixChargePanel
        amount={valor}
        qrCode={etapa.cobranca.qr_code}
        expiresAt={etapa.cobranca.expires_at}
        message={pixMessage({ code: alvo.bookingCode, amount: valor, what: "dias" })}
        paid={false}
        paidText=""
      />
    );
  }

  return <PixChargePanel amount={0} qrCode={null} expiresAt={null} message="" paid paidText={etapa.texto} />;
}
