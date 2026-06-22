import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { usePartnerAction } from "./managerApi";

type Props = {
  companyId: string | null;
  companyName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

export function RejectDialog({ companyId, companyName, open, onOpenChange, onDone }: Props) {
  const action = usePartnerAction();
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  async function handleReject() {
    if (!companyId) return;
    if (!reason.trim()) {
      toast.error("Informe o motivo da recusa.");
      return;
    }
    try {
      await action.mutateAsync({ company_id: companyId, action: "reject", rejection_reason: reason.trim() });
      toast.success("Cadastro recusado");
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao recusar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recusar cadastro{companyName ? `: ${companyName}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Motivo (enviado ao parceiro)</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: não atende à região de cobertura no momento."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleReject} disabled={action.isPending}>
              {action.isPending ? "Recusando…" : "Recusar cadastro"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
