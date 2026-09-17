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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useSetCompanyPayoutReleaseDays } from "./api";
import { useCompanies } from "@/features/companies/api";

type Props = {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Prazo de saque por empresa (E0.3.8, hub_admin): quantos dias depois do pagamento a venda entra
 * no disponível para saque. Vazio herda o global (`app_setting.payout_release_days`).
 *
 * A cadência de transferência automática da Pagar.me saiu daqui de propósito: o saque é sempre
 * manual (o dinheiro sai do recebedor só pelo botão "Repassar para o banco"), e o recebedor nasce
 * com `transfer_enabled = false` pelo `sync-recipient`. Não existe mais UI que religue isso.
 */
export function PayoutSettingsDialog({ companyId, open, onOpenChange }: Props) {
  const setReleaseDays = useSetCompanyPayoutReleaseDays();
  const companies = useCompanies();
  const companyDays = (companies.data?.find((c) => c.id === companyId) as { payout_release_days?: number | null } | undefined)
    ?.payout_release_days;
  const [releaseDays, setReleaseDaysState] = React.useState<string>("");
  React.useEffect(() => {
    if (open) setReleaseDaysState(companyDays == null ? "" : String(companyDays));
  }, [open, companyDays]);

  async function save() {
    try {
      const dias = releaseDays.trim() === "" ? null : Math.min(365, Math.max(0, Math.round(Number(releaseDays))));
      await setReleaseDays.mutateAsync({ company_id: companyId, days: Number.isFinite(dias as number) ? dias : null });
      toast.success("Prazo de saque salvo");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Prazo de saque</DialogTitle>
          <DialogDescription>
            Quantos dias depois do pagamento cada venda desta empresa entra no disponível para
            saque. O dinheiro só sai do recebedor por saque manual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="release-days">Prazo de liberação do saque (dias)</Label>
          <Input
            id="release-days"
            type="number"
            min={0}
            max={365}
            value={releaseDays}
            onChange={(e) => setReleaseDaysState(e.target.value)}
            placeholder="herda o global"
          />
          <span className="text-caption text-muted">
            Vazio herda o padrão global de Configurações.
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={setReleaseDays.isPending}>
            {setReleaseDays.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
