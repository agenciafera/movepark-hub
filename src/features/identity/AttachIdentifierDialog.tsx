import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/ui/phone-field";
import { useRequestAttachOtp, useConfirmAttach, type Channel } from "./api";

type Preview = { bookings: number; vehicles: number; saved: number; reviews: number };

/**
 * Anexa/altera um identificador verificado (E0.10). Fluxo: informar → código (OTP) → confirmar.
 * Se o identificador já é de outra conta com histórico, entra o passo "conectar contas" (Q-006).
 */
export function AttachIdentifierDialog({
  channel,
  open,
  onOpenChange,
}: {
  channel: Channel;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const request = useRequestAttachOtp();
  const confirm = useConfirmAttach();
  const [step, setStep] = React.useState<"input" | "code" | "merge">("input");
  const [identifier, setIdentifier] = React.useState<string | undefined>(undefined);
  const [code, setCode] = React.useState("");
  const [preview, setPreview] = React.useState<Preview | null>(null);

  const label = channel === "phone" ? "telefone" : "e-mail";

  function reset() {
    setStep("input");
    setIdentifier(undefined);
    setCode("");
    setPreview(null);
  }

  async function handleSend() {
    if (!identifier) return;
    try {
      await request.mutateAsync({ channel, identifier });
      setStep("code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar o código");
    }
  }

  async function handleConfirm(allowMerge = false) {
    if (!identifier || !code.trim()) return;
    try {
      const res = await confirm.mutateAsync({ channel, identifier, code: code.trim(), allowMerge });
      if (res.status === "needs_merge_confirm") {
        setPreview(res.preview);
        setStep("merge");
        return;
      }
      toast.success(
        res.status === "merged" ? "Contas conectadas com sucesso." : `Seu ${label} foi verificado.`,
      );
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "merge" ? "Conectar contas" : `Adicionar ${label}`}
          </DialogTitle>
          <DialogDescription>
            {step === "input" && `Vamos enviar um código para confirmar que o ${label} é seu.`}
            {step === "code" && `Digite o código que enviamos para o seu ${label}.`}
            {step === "merge" &&
              `Este ${label} já pertence a outra conta sua. Conectar vai unir as duas — nada é perdido.`}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="attach-id">{channel === "phone" ? "Telefone" : "E-mail"}</Label>
              {channel === "phone" ? (
                <PhoneField id="attach-id" value={identifier} onChange={setIdentifier} />
              ) : (
                <Input
                  id="attach-id"
                  type="email"
                  value={identifier ?? ""}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="seu@email.com"
                />
              )}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSend} disabled={!identifier || request.isPending}>
                {request.isPending ? "Enviando…" : "Enviar código"}
              </Button>
            </div>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="attach-code">Código</Label>
              <Input
                id="attach-code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
              />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={handleSend} disabled={request.isPending}>
                Reenviar
              </Button>
              <Button size="sm" onClick={() => handleConfirm(false)} disabled={!code.trim() || confirm.isPending}>
                {confirm.isPending ? "Confirmando…" : "Confirmar"}
              </Button>
            </div>
          </div>
        )}

        {step === "merge" && preview && (
          <div className="space-y-4">
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-muted">
              <li>{preview.bookings} reserva(s)</li>
              <li>{preview.vehicles} veículo(s)</li>
              <li>{preview.saved} favorito(s)</li>
              <li>{preview.reviews} avaliação(ões)</li>
            </ul>
            <p className="text-body-sm text-body">
              Tudo isso vai passar para esta conta. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => handleConfirm(true)} disabled={confirm.isPending}>
                {confirm.isPending ? "Conectando…" : "Conectar contas"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
