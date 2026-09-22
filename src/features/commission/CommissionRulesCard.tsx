import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCompanies } from "@/features/companies/api";
import { useAppSettings } from "@/features/settings/api";
import { formatBRL } from "@/lib/format";
import type { CommissionRule } from "@/types/domain";
import { useCommissionRules, useDeleteCommissionRule, useSaveCommissionRule } from "./api";
import {
  CHARGEBACK_LABEL,
  EMPTY_RULE_FORM,
  FEE_PAYER_LABEL,
  RULE_STATUS_LABEL,
  feeCoverageWarning,
  formFromRule,
  parseUtmSources,
  ruleStatus,
  splitExample,
  validateRuleForm,
  type ChargebackBearer,
  type FeePayer,
  type RuleForm,
  type RuleStatus,
} from "./rule.logic";
import { parseCommissionPct } from "@/routes/manager/finance-commissions.logic";

const GLOBAL = "__global__";

const STATUS_TONE: Record<RuleStatus, "confirmed" | "neutral" | "pending" | "cancelled"> = {
  active: "confirmed",
  inactive: "neutral",
  scheduled: "pending",
  expired: "cancelled",
};

/**
 * Regras de comissão por origem da venda (E0.3.12, hub_admin). Cada regra diz de onde a venda
 * tem que vir (utm_source cadastrado, ou o site white-label da empresa) e qual pacote ela recebe:
 * comissão, quem paga a taxa do gateway e quem arca com chargeback. Venda que não casa com
 * nenhuma regra segue o padrão da empresa, na tabela logo abaixo.
 */
export function CommissionRulesCard() {
  const rules = useCommissionRules();
  const companies = useCompanies();
  const del = useDeleteCommissionRule();
  const [editing, setEditing] = React.useState<RuleForm | null>(null);
  const [removing, setRemoving] = React.useState<CommissionRule | null>(null);
  const settings = useAppSettings();
  const globalWindow = Number(settings.data?.commission_attribution_window_days ?? 7) || 7;

  const companyName = (id: string | null) =>
    id ? (companies.data?.find((c) => c.id === id)?.name ?? "Empresa removida") : "Todas as empresas";

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Comissão por origem da venda</CardTitle>
          <p className="mt-1 max-w-[68ch] text-pretty text-body-sm text-muted">
            Quando o cliente chega pelo link ou pelo site do estacionamento, a venda segue a regra
            daqui. O que não casa com nenhuma regra usa a comissão padrão da empresa.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ ...EMPTY_RULE_FORM })}>
          Nova regra
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rules.isLoading ? (
          <div className="p-6">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : rules.isError ? (
          <div className="p-6">
            <EmptyState title="Não deu para carregar as regras" description="Recarregue a página para tentar de novo." />
          </div>
        ) : (rules.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nenhuma regra cadastrada"
              description="Hoje toda venda usa a comissão padrão da empresa. Crie uma regra para cobrar menos de quem traz o próprio cliente."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Regra</TableHead>
                  <TableHead>Vale para</TableHead>
                  <TableHead>Origem reconhecida</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Taxa do gateway</TableHead>
                  <TableHead>Chargeback</TableHead>
                  <TableHead>Janela</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.data?.map((r) => {
                  const st = ruleStatus(r);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-ink">{r.name}</TableCell>
                      <TableCell>{companyName(r.company_id)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.utm_sources.map((u) => (
                            <code key={u} className="rounded bg-surface-soft px-1.5 py-0.5 text-caption text-body">
                              {u}
                            </code>
                          ))}
                          {r.match_white_label && <Badge tone="neutral">site white-label</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.take_rate_bps / 100}%</TableCell>
                      <TableCell>{FEE_PAYER_LABEL[r.gateway_fee_payer as FeePayer] ?? r.gateway_fee_payer}</TableCell>
                      <TableCell>{CHARGEBACK_LABEL[r.chargeback_bearer as ChargebackBearer] ?? r.chargeback_bearer}</TableCell>
                      <TableCell className="tabular-nums text-muted">
                        {r.attribution_window_days ?? globalWindow} dias{r.attribution_window_days == null ? " (padrão)" : ""}
                      </TableCell>
                      <TableCell>
                        <Badge tone={STATUS_TONE[st]}>{RULE_STATUS_LABEL[st]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setEditing(formFromRule(r))}>
                            Editar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRemoving(r)}>
                            Remover
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editing && (
        <RuleDialog
          form={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          companies={(companies.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
          globalWindow={globalWindow}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remover a regra "${removing?.name ?? ""}"?`}
        description="As próximas vendas dessa origem voltam para a comissão padrão. Reservas já criadas mantêm a comissão com que nasceram."
        pending={del.isPending}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await del.mutateAsync(removing.id);
            toast.success("Regra removida.");
            setRemoving(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Falha ao remover a regra.");
          }
        }}
      />
    </Card>
  );
}

function RuleDialog({
  form,
  onChange,
  onClose,
  companies,
  globalWindow,
}: {
  form: RuleForm;
  onChange: (f: RuleForm) => void;
  onClose: () => void;
  companies: { id: string; name: string }[];
  globalWindow: number;
}) {
  const save = useSaveCommissionRule();
  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => onChange({ ...form, [k]: v });

  const pct = parseCommissionPct(form.takeRatePct);
  const bps = "bps" in pct ? pct.bps : null;
  const warning = bps == null ? null : feeCoverageWarning(bps, form.feePayer);
  const example = bps == null ? null : splitExample(bps);
  const utms = parseUtmSources(form.utmSourcesText);

  async function submit() {
    const v = validateRuleForm(form);
    if (!v.ok) {
      toast.error(v.error);
      return;
    }
    try {
      await save.mutateAsync(v.payload);
      toast.success(form.id ? "Regra atualizada." : "Regra criada.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar a regra.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar regra" : "Nova regra de comissão"}</DialogTitle>
          <DialogDescription>
            Vale para as reservas criadas daqui para frente. Reserva que já existe mantém a comissão
            com que nasceu.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-name">Nome da regra</Label>
            <Input
              id="rule-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Site do Abbapark"
            />
            <span className="text-caption text-muted">Aparece na reserva como o canal da venda.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-company">Empresa</Label>
            <Select value={form.companyId || GLOBAL} onValueChange={(v) => set("companyId", v === GLOBAL ? "" : v)}>
              <SelectTrigger id="rule-company">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL}>Todas as empresas (regra global)</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-caption text-muted">
              Regra da empresa vence a global quando as duas reconhecem a mesma origem.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-utm">utm_source reconhecidos</Label>
            <Textarea
              id="rule-utm"
              rows={2}
              value={form.utmSourcesText}
              onChange={(e) => set("utmSourcesText", e.target.value)}
              placeholder="abbapark, abbapark-instagram"
            />
            <span className="text-caption text-muted">
              Separe por vírgula. Maiúscula e minúscula não fazem diferença.
              {utms.length > 0 && ` Vai valer para: ${utms.join(", ")}.`}
            </span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="rule-wl">Site white-label da empresa</Label>
              <p className="text-caption text-muted">
                Toda reserva feita no site próprio dela entra nesta regra, mesmo sem UTM.
              </p>
            </div>
            <Switch
              id="rule-wl"
              checked={form.matchWhiteLabel}
              onCheckedChange={(v: boolean) => set("matchWhiteLabel", v)}
            />
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-pct">Comissão da Movepark (%)</Label>
              <Input
                id="rule-pct"
                inputMode="decimal"
                value={form.takeRatePct}
                onChange={(e) => set("takeRatePct", e.target.value)}
                placeholder="5"
              />
              {example && (
                <span className="text-caption text-muted">
                  Numa reserva de R$ 100,00: {formatBRL(example.partnerCents / 100)} para o estacionamento e{" "}
                  {formatBRL(example.moveparkCents / 100)} para a Movepark.
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-priority">Prioridade</Label>
              <Input
                id="rule-priority"
                inputMode="numeric"
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
              />
              <span className="text-caption text-muted">Só desempata regras globais. A maior vence.</span>
            </div>
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-fee">Taxa do gateway (PIX e cartão)</Label>
              <Select value={form.feePayer} onValueChange={(v) => set("feePayer", v as FeePayer)}>
                <SelectTrigger id="rule-fee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movepark">{FEE_PAYER_LABEL.movepark}</SelectItem>
                  <SelectItem value="partner">{FEE_PAYER_LABEL.partner}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-cb">Chargeback</Label>
              <Select value={form.chargebackBearer} onValueChange={(v) => set("chargebackBearer", v as ChargebackBearer)}>
                <SelectTrigger id="rule-cb">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="each">{CHARGEBACK_LABEL.each}</SelectItem>
                  <SelectItem value="partner">{CHARGEBACK_LABEL.partner}</SelectItem>
                  <SelectItem value="movepark">{CHARGEBACK_LABEL.movepark}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {warning && (
            <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-body-sm text-amber-900">
              {warning}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-window">Janela de atribuição (dias)</Label>
            <Input
              id="rule-window"
              inputMode="numeric"
              value={form.windowDays}
              onChange={(e) => set("windowDays", e.target.value)}
              placeholder={String(globalWindow)}
            />
            <span className="text-caption text-muted">
              Quantos dias depois de clicar no link a reserva ainda conta como trazida pelo estacionamento.
              Vazio usa o padrão de {globalWindow} dias.
            </span>
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-from">Vale a partir de</Label>
              <Input id="rule-from" type="date" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-until">Vale até</Label>
              <Input id="rule-until" type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
            </div>
          </div>
          <span className="-mt-2 text-caption text-muted">Deixe as datas vazias para a regra valer sem prazo.</span>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="rule-active">Regra ligada</Label>
            <Switch id="rule-active" checked={form.isActive} onCheckedChange={(v: boolean) => set("isActive", v)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar regra"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
