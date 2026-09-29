import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatKycCountdown, kycMsRemaining } from "./RecipientKycBanner.logic";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  kycUrl: string | null;
  expiresAt: string | null;
  /** Pede um link novo à Edge (`reissue_kyc`). */
  onReissue: () => void;
  reissuing: boolean;
};

/**
 * Link de prova de vida gerado pela Movepark (Manager, 28/09/2026). Enquanto a equipe faz o
 * cadastro no lugar do estacionamento, o link de verificação da Pagar.me (válido por 20 minutos)
 * precisa sair daqui para o WhatsApp do representante, sem passar pelo painel do gateway nem
 * esperar o parceiro entrar no Operator. Mostra a contagem regressiva e copia com um clique.
 */
export function KycLinkDialog({ open, onOpenChange, companyName, kycUrl, expiresAt, onReissue, reissuing }: Props) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    if (!open || !expiresAt) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [open, expiresAt]);

  const msLeft = expiresAt ? kycMsRemaining(expiresAt, now) : 0;
  const vivo = !!kycUrl && msLeft > 0;

  async function copiar() {
    if (!kycUrl) return;
    try {
      await navigator.clipboard.writeText(kycUrl);
      toast.success("Link copiado. Ele vale só 20 minutos: mande agora.");
    } catch {
      const el = document.getElementById("kyc-link-url") as HTMLInputElement | null;
      el?.select();
      toast.warning("Não consegui copiar sozinho. O link está selecionado: use Ctrl+C.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Prova de vida de {companyName}</DialogTitle>
          <DialogDescription>
            O representante abre este link no celular, tira a selfie e fotografa o documento. A
            Pagar.me libera a movimentação do saldo quando aprovar. O link vale 20 minutos a partir
            da geração, então combine antes de mandar.
          </DialogDescription>
        </DialogHeader>

        {vivo ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-md border border-hairline bg-surface-soft p-3 text-body-sm">
              <span className="text-muted">Expira em</span>
              <span className="font-mono text-ink" data-testid="kyc-link-countdown">
                {formatKycCountdown(msLeft)}
              </span>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input id="kyc-link-url" readOnly value={kycUrl ?? ""} aria-label="Link de prova de vida" />
              </div>
              <Button onClick={copiar}>Copiar link</Button>
            </div>
            <p className="text-caption text-muted text-pretty">
              Se o representante não concluir a tempo, gere outro por aqui. O link antigo deixa de
              valer sozinho.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-body-sm text-muted text-pretty" data-testid="kyc-link-expirado">
              {kycUrl ? "O link anterior expirou." : "Ainda não há link gerado para esta empresa."} Gere um
              novo só quando o representante estiver com o celular na mão.
            </p>
            <div>
              <Button onClick={onReissue} disabled={reissuing}>
                {reissuing ? "Gerando…" : "Gerar link de 20 minutos"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
