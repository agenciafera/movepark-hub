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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSetCompanyPayoutReleaseDays, useSetCompanyPayoutSchedule } from "./api";
import { useCompanies } from "@/features/companies/api";

type Props = {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CompanyPayoutFields = {
  payout_release_days?: number | null;
  payout_auto_day?: number | null;
  payout_auto_enabled?: boolean | null;
};

type AutoChoice = "inherit" | "on" | "off";

/**
 * Repasse por empresa (hub_admin): prazo de liberação do saque (E0.3.8), dia do repasse automático
 * e se ele está ligado para esta empresa (E0.3.13). Vazio herda o global de Configurações.
 *
 * A cadência de transferência automática da Pagar.me continua fora daqui de propósito: quem saca
 * no dia X é o nosso cron, com o mesmo saque do botão Repassar, e o recebedor nasce com
 * `transfer_enabled = false` pelo `sync-recipient`. Spec: docs/specs/repasse-automatico-mensal.md.
 */
export function PayoutSettingsDialog({ companyId, open, onOpenChange }: Props) {
  const setReleaseDays = useSetCompanyPayoutReleaseDays();
  const setSchedule = useSetCompanyPayoutSchedule();
  const companies = useCompanies();
  const company = companies.data?.find((c) => c.id === companyId) as CompanyPayoutFields | undefined;
  const [releaseDays, setReleaseDaysState] = React.useState<string>("");
  const [autoDay, setAutoDay] = React.useState<string>("");
  const [autoChoice, setAutoChoice] = React.useState<AutoChoice>("inherit");
  React.useEffect(() => {
    if (!open) return;
    setReleaseDaysState(company?.payout_release_days == null ? "" : String(company.payout_release_days));
    setAutoDay(company?.payout_auto_day == null ? "" : String(company.payout_auto_day));
    setAutoChoice(company?.payout_auto_enabled == null ? "inherit" : company.payout_auto_enabled ? "on" : "off");
  }, [open, company?.payout_release_days, company?.payout_auto_day, company?.payout_auto_enabled]);

  const pending = setReleaseDays.isPending || setSchedule.isPending;

  async function save() {
    try {
      const dias = releaseDays.trim() === "" ? null : Math.min(365, Math.max(0, Math.round(Number(releaseDays))));
      await setReleaseDays.mutateAsync({ company_id: companyId, days: Number.isFinite(dias as number) ? dias : null });
      const dia = autoDay.trim() === "" ? null : Math.min(31, Math.max(1, Math.round(Number(autoDay))));
      await setSchedule.mutateAsync({
        company_id: companyId,
        day: Number.isFinite(dia as number) ? dia : null,
        enabled: autoChoice === "inherit" ? null : autoChoice === "on",
      });
      toast.success("Repasse salvo");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Repasse</DialogTitle>
          <DialogDescription>
            Prazo de liberação, dia do repasse automático e se ele está ligado para esta empresa.
            Vazio herda o padrão global de Configurações.
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
            Quantos dias depois do pagamento cada venda entra no disponível para saque.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auto-day">Dia do repasse automático</Label>
          <Input
            id="auto-day"
            type="number"
            min={1}
            max={31}
            value={autoDay}
            onChange={(e) => setAutoDay(e.target.value)}
            placeholder="herda o global"
          />
          <span className="text-caption text-muted">
            Sem taxa para o parceiro: a taxa da Pagar.me fica por conta da Movepark. Dia 29, 30 ou 31
            em mês mais curto roda no último dia.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auto-enabled">Repasse automático</Label>
          <Select value={autoChoice} onValueChange={(v) => setAutoChoice(v as AutoChoice)}>
            <SelectTrigger id="auto-enabled" aria-label="Repasse automático">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Herda o global</SelectItem>
              <SelectItem value="on">Ligado</SelectItem>
              <SelectItem value="off">Desligado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
