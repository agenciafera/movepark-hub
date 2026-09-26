import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { usePayoutAutoForecast } from "./api";
import { lastCycleLabel, scheduleHeadline } from "./schedule.logic";

const brl = (cents: number) => formatBRL(cents / 100);

/**
 * Quando o próximo repasse automático cai e quanto vai cair (E0.3.13). O mesmo card no Operator
 * (a própria empresa) e no Manager (conta de qualquer empresa). Spec: docs/specs/repasse-automatico-mensal.md.
 */
export function PayoutScheduleCard({ companyId, partnerView }: { companyId: string; partnerView: boolean }) {
  const forecast = usePayoutAutoForecast(companyId);
  const f = forecast.data;
  if (!f) return null;
  const h = scheduleHeadline(f, brl, partnerView);
  const ultimo = lastCycleLabel(f, brl);
  const tone = h.tone === "warn" ? "text-error" : h.tone === "muted" ? "text-muted" : "text-ink";
  return (
    <Card data-testid="repasse-automatico">
      <CardContent className="p-5">
        <div className="text-caption text-muted">{h.title}</div>
        <div className={`text-display-sm ${tone}`} data-testid="repasse-previsto">{h.value}</div>
        <div className="text-caption text-muted text-pretty">{h.caption}</div>
        {ultimo && <div className="mt-1 text-caption text-muted text-pretty">{ultimo}</div>}
      </CardContent>
    </Card>
  );
}
