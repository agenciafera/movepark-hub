import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSettings, useUpdateAppSettings } from "@/features/settings/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL } from "@/lib/format";
import { useChannelReport } from "./api";
import { channelLabel, recentMonths } from "./report.logic";

const brl = (cents: number) => formatBRL(cents / 100);

/**
 * Vendas pagas por canal de comissão (E0.3.12, hub_admin): quanto cada empresa vendeu, quanto
 * ficou com a Movepark e que fatia veio pelo canal do próprio estacionamento. Fatia alta acende
 * um alerta para alguém conferir se é marketing dele ou tráfego do Hub com o UTM dele.
 */
export function ChannelReportCard() {
  const months = React.useMemo(() => recentMonths(12), []);
  const [monthKey, setMonthKey] = React.useState(months[0].value);
  const period = months.find((m) => m.value === monthKey) ?? months[0];
  const report = useChannelReport(period.from, period.to);
  const companies = report.data?.companies ?? [];
  const settings = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const alertSaved = settings.data?.commission_partner_share_alert_pct ?? "60";
  const [alertDraft, setAlertDraft] = React.useState<string | null>(null);
  const alertValue = alertDraft ?? alertSaved;
  const alertDirty = alertDraft != null && alertDraft.trim() !== alertSaved;

  async function saveAlert() {
    const n = Number(alertValue.trim());
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      toast.error("O alerta é um número inteiro de 1 a 100.");
      return;
    }
    try {
      await updateSettings.mutateAsync({ commission_partner_share_alert_pct: String(n) });
      setAlertDraft(null);
      toast.success("Alerta atualizado.");
      report.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar o alerta.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Vendas por canal</CardTitle>
          <p className="mt-1 max-w-[68ch] text-pretty text-body-sm text-muted">
            Reservas pagas no mês, abertas por canal. O alerta acende quando o canal do estacionamento
            passa de uma fatia das vendas dele.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="alert-pct" className="text-caption text-muted">
              Alerta a partir de
            </label>
            <Input
              id="alert-pct"
              inputMode="numeric"
              value={alertValue}
              onChange={(e) => setAlertDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && alertDirty) saveAlert();
              }}
              className="h-8 w-16 text-right tabular-nums"
              aria-label="Alerta de concentração em porcentagem"
            />
            <span className="text-caption text-muted">% pelo canal dele</span>
            {alertDirty && (
              <Button size="sm" variant="secondary" onClick={saveAlert} disabled={updateSettings.isPending}>
                {updateSettings.isPending ? "Salvando…" : "Salvar"}
              </Button>
            )}
          </div>
        </div>
        <div className="w-48 shrink-0">
          <Select value={monthKey} onValueChange={setMonthKey}>
            <SelectTrigger aria-label="Mês do relatório">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {report.isLoading ? (
          <div className="p-6">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : companies.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Sem vendas pagas no mês" description="Escolha outro mês para ver o histórico." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa e canal</TableHead>
                  <TableHead className="text-right">Reservas pagas</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="text-right">Ficou com a Movepark</TableHead>
                  <TableHead className="text-right">Comissão média</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <React.Fragment key={c.company_id}>
                    <TableRow className="bg-surface-soft">
                      <TableCell className="text-ink">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{c.company_name}</span>
                          {c.partner_gmv_cents > 0 && (
                            <Badge tone={c.alert ? "pending" : "neutral"}>
                              {c.partner_share_pct}% pelo canal dele{c.alert ? ", vale conferir" : ""}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.paid_bookings}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(c.gmv_cents)}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(c.movepark_cents)}</TableCell>
                      <TableCell />
                    </TableRow>
                    {c.channels.map((ch) => (
                      <TableRow key={`${c.company_id}-${ch.channel}`}>
                        <TableCell className="pl-8 text-body">{channelLabel(ch.channel, ch.from_rule)}</TableCell>
                        <TableCell className="text-right tabular-nums">{ch.paid_bookings}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(ch.gmv_cents)}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(ch.movepark_cents)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ch.avg_take_rate_bps == null ? "-" : `${ch.avg_take_rate_bps / 100}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
