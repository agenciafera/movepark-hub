import * as React from "react";
import { toast } from "sonner";
import { CheckCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateTime } from "@/lib/format";
import { toDataUrl } from "@/lib/qr";

type Props = {
  amount: number;
  qrCode: string | null;
  expiresAt: string | null;
  /** Texto pronto para o WhatsApp, que vai antes do código. Sem ele, só o "Copiar código". */
  message?: string;
  /** Quem paga é o próprio cliente (conta dele): a instrução fala com ele, não com a equipe. */
  forCustomer?: boolean;
  /** O pagamento já entrou (a tela relê a reserva enquanto espera). */
  paid: boolean;
  paidText: string;
};

/**
 * PIX de uma cobrança depois da compra (26/11/2026). Na equipe: o QR para o cliente pagar no balcão e
 * o código para mandar no WhatsApp. Na conta do cliente (`forCustomer`): o QR e o "Copiar código" para
 * colar no app do banco. Nos dois, quem diz que entrou é a reserva relida (`paid`), não um clique.
 */
export function PixChargePanel({ amount, qrCode, expiresAt, message, forCustomer, paid, paidText }: Props) {
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    if (qrCode) void toDataUrl(qrCode, 220).then((u) => vivo && setQrUrl(u));
    return () => {
      vivo = false;
    };
  }, [qrCode]);

  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(aviso);
    } catch {
      toast.error("Não deu para copiar. Selecione o texto e copie.");
    }
  }

  if (paid) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-md border border-success/40 bg-success/5 p-4 text-center"
        data-testid="pix-pago"
      >
        <CheckCircle size={32} weight="fill" className="text-success" />
        <p className="text-body-md font-medium text-ink">Pagamento recebido</p>
        <p className="text-body-sm text-muted">{paidText}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-center" data-testid="pix-cobranca">
      <p className="text-body-sm text-muted">
        PIX de <strong className="text-ink">{formatBRL(amount)}</strong>
        {expiresAt ? `, vale até ${formatDateTime(expiresAt)}` : ""}.{" "}
        {forCustomer
          ? "Leia o QR no app do seu banco ou copie o código."
          : "Mostre o QR ao cliente ou mande o código no WhatsApp."}
      </p>
      {qrUrl && <img src={qrUrl} alt="QR code do PIX" className="mx-auto h-[220px] w-[220px]" data-testid="pix-qr" />}
      {qrCode && (
        <p className="break-all rounded-sm bg-surface-soft p-2 text-caption text-muted">{qrCode}</p>
      )}
      <div className="flex flex-col gap-2 tablet:flex-row">
        <Button
          className="flex-1"
          variant="secondary"
          disabled={!qrCode}
          onClick={() => qrCode && void copiar(qrCode, "Código do PIX copiado.")}
        >
          Copiar código
        </Button>
        {message && (
          <Button
            className="flex-1"
            variant="secondary"
            disabled={!qrCode}
            onClick={() => qrCode && void copiar(`${message}\n\n${qrCode}`, "Mensagem e código copiados.")}
          >
            Copiar com mensagem
          </Button>
        )}
      </div>
      <p className="text-caption text-muted" aria-live="polite">
        Aguardando o pagamento. Esta tela atualiza sozinha.
      </p>
    </div>
  );
}
