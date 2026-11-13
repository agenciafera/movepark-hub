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
import {
  useCompanyAnticipationEnabled,
  useSetCompanyAnticipation,
  useSetCompanyPayoutReleaseDays,
  useSetCompanyPayoutSchedule,
} from "./api";
import { useCompanies } from "@/features/companies/api";
import { useAppSettings } from "@/features/settings/api";
import {
  anticipationGatewaySettings,
  payerLabel,
  referenceCostLine,
  toPayer,
  type AnticipationPayer,
  type PayerChoice,
} from "./anticipation.logic";

type Props = {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CompanyPayoutFields = {
  payout_release_days?: number | null;
  payout_auto_day?: number | null;
  payout_auto_enabled?: boolean | null;
  anticipation_fee_payer?: AnticipationPayer | null;
};

type AutoChoice = "inherit" | "on" | "off";

/**
 * Repasse por empresa (hub_admin): prazo de liberação do saque (E0.3.8), dia do repasse automático
 * e se ele está ligado para esta empresa (E0.3.13). Vazio herda o global de Configurações.
 *
 * Cartão em 30 dias (E0.3.14): liga a antecipação automática no recebedor (mesma regra do
 * recebedor da Movepark) e define quem paga a taxa nas vendas sem regra de origem. Spec:
 * docs/specs/antecipacao-do-parceiro.md
 *
 * A cadência de transferência automática da Pagar.me continua fora daqui de propósito: quem saca
 * no dia X é o nosso cron, com o mesmo saque do botão Repassar, e o recebedor nasce com
 * `transfer_enabled = false` pelo `sync-recipient`. Spec: docs/specs/repasse-automatico-mensal.md.
 */
export function PayoutSettingsDialog({ companyId, open, onOpenChange }: Props) {
  const setReleaseDays = useSetCompanyPayoutReleaseDays();
  const setSchedule = useSetCompanyPayoutSchedule();
  const setAnticipation = useSetCompanyAnticipation();
  const anticipationEnabled = useCompanyAnticipationEnabled(open ? companyId : undefined);
  const settings = useAppSettings();
  const companies = useCompanies();
  const company = companies.data?.find((c) => c.id === companyId) as CompanyPayoutFields | undefined;
  const [releaseDays, setReleaseDaysState] = React.useState<string>("");
  const [autoDay, setAutoDay] = React.useState<string>("");
  const [autoChoice, setAutoChoice] = React.useState<AutoChoice>("inherit");
  const [antOn, setAntOn] = React.useState<"on" | "off">("off");
  const [payerChoice, setPayerChoice] = React.useState<PayerChoice>("inherit");
  const savedAntOn = anticipationEnabled.data === true;
  const savedPayer: PayerChoice = company?.anticipation_fee_payer ?? "inherit";
  React.useEffect(() => {
    if (!open) return;
    setReleaseDaysState(company?.payout_release_days == null ? "" : String(company.payout_release_days));
    setAutoDay(company?.payout_auto_day == null ? "" : String(company.payout_auto_day));
    setAutoChoice(company?.payout_auto_enabled == null ? "inherit" : company.payout_auto_enabled ? "on" : "off");
  }, [open, company?.payout_release_days, company?.payout_auto_day, company?.payout_auto_enabled]);
  React.useEffect(() => {
    if (!open) return;
    setAntOn(savedAntOn ? "on" : "off");
    setPayerChoice(savedPayer);
  }, [open, savedAntOn, savedPayer]);

  const pending = setReleaseDays.isPending || setSchedule.isPending || setAnticipation.isPending;
  const rateBps = Number(settings.data?.card_anticipation_rate_monthly_bps ?? 0);

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
      // Cartão em 30 dias (E0.3.14): só chama a Pagar.me quando o liga/desliga mudou.
      const ligaMudou = (antOn === "on") !== savedAntOn;
      if (ligaMudou || payerChoice !== savedPayer) {
        await setAnticipation.mutateAsync({
          company_id: companyId,
          fee_payer: toPayer(payerChoice),
          gateway: ligaMudou ? anticipationGatewaySettings(antOn === "on") : undefined,
        });
      }
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

        <div className="flex flex-col gap-3 border-t border-hairline pt-4">
          <span className="text-body-sm font-semibold text-ink">Cartão em 30 dias</span>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anticipation-enabled">Antecipação do cartão</Label>
            <Select value={antOn} onValueChange={(v) => setAntOn(v as "on" | "off")}>
              <SelectTrigger id="anticipation-enabled" aria-label="Antecipação do cartão">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Desligada</SelectItem>
                <SelectItem value="on">Ligada</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-caption text-muted">
              Ligada, a Pagar.me antecipa as parcelas e o estacionamento recebe tudo em 30 dias.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anticipation-payer">Quem paga a antecipação</Label>
            <Select value={payerChoice} onValueChange={(v) => setPayerChoice(v as PayerChoice)}>
              <SelectTrigger id="anticipation-payer" aria-label="Quem paga a antecipação">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">{payerLabel(null)}</SelectItem>
                <SelectItem value="movepark">{payerLabel("movepark")}</SelectItem>
                <SelectItem value="partner">{payerLabel("partner")}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-caption text-muted">
              {payerChoice === "partner"
                ? "A taxa sai da parte do estacionamento e aparece no extrato dele."
                : "A Movepark manda a taxa a mais no split, e o estacionamento recebe o valor cheio."}{" "}
              {referenceCostLine(rateBps)}
            </span>
          </div>
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
