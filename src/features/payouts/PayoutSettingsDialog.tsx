import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRecipient, useUpdateRecipientPayout } from "./api";
import {
  coerceDay,
  dayOptions,
  INTERVAL_LABELS,
  TRANSFER_INTERVALS,
  WEEKDAY_LABELS,
  type TransferInterval,
} from "./payoutSettings.logic";

type Props = {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Configuração de repasse por empresa (E0.3.3, hub_admin): cadência de transferência editável;
 * antecipação automática exibida porém desabilitada (requer liberação prévia na Pagar.me).
 */
export function PayoutSettingsDialog({ companyId, open, onOpenChange }: Props) {
  const update = useUpdateRecipientPayout();
  const { data: recipient } = useRecipient(open ? companyId : undefined);

  // NULL nas colunas = herda o default global (hoje Mensal/dia 1); refletimos isso na dica "herdado"
  // e no fallback do formulário (pra não exibir "Diário" quando a empresa na verdade recebe mensal).
  const inheritsTransfer = recipient?.transfer_interval == null;
  const [interval, setInterval] = React.useState<TransferInterval>("Monthly");
  const [day, setDay] = React.useState(1);
  const [enabled, setEnabled] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    const iv = (recipient?.transfer_interval as TransferInterval) ?? "Monthly";
    setInterval(iv);
    setDay(coerceDay(iv, recipient?.transfer_day ?? 1));
    setEnabled(recipient?.transfer_enabled ?? true);
  }, [open, recipient]);

  function changeInterval(next: TransferInterval) {
    setInterval(next);
    setDay((d) => coerceDay(next, d));
  }

  const days = dayOptions(interval);

  async function save() {
    try {
      const res = await update.mutateAsync({
        company_id: companyId,
        transfer: { enabled, interval, day: coerceDay(interval, day) },
      });
      toast.success("Configuração de repasse salva");
      if (res.warning) toast.warning(res.warning);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configuração de repasse</DialogTitle>
          <DialogDescription>
            Frequência com que a Pagar.me transfere o saldo desta empresa pro banco dela.
            {inheritsTransfer && " Hoje herdando o padrão global."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-body-sm text-ink">Transferência automática</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>

          <div className="flex flex-col gap-1.5">
            <Label>Recorrência</Label>
            <Select value={interval} onValueChange={(v) => changeInterval(v as TransferInterval)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFER_INTERVALS.map((i) => (
                  <SelectItem key={i} value={i}>
                    {INTERVAL_LABELS[i]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {days && (
            <div className="flex flex-col gap-1.5">
              <Label>{interval === "Weekly" ? "Dia da semana" : "Dia do mês"}</Label>
              <Select value={String(day || days[0])} onValueChange={(v) => setDay(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {interval === "Weekly" ? WEEKDAY_LABELS[d - 1] : `Dia ${d}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Antecipação — desabilitada até liberação da Pagar.me (E0.3.3, decisão de produto). */}
          <div className="space-y-2 rounded-md border border-hairline bg-surface-soft p-3 opacity-80">
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-sm text-ink">Antecipação automática</span>
              <Switch
                checked={recipient?.anticipation_enabled ?? false}
                onCheckedChange={() => {}}
                disabled
              />
            </div>
            <p className="flex items-start gap-1.5 text-caption text-muted">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              Requer liberação prévia junto à Pagar.me. Solicite pra habilitar aqui.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
