import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { formatDateTime } from "@/lib/format";
import { useCommissionRules, useSetBookingCommission } from "./api";
import {
  canFixChannel,
  commissionView,
  rulesForCompany,
  type BookingCommissionLike,
} from "./bookingCommission.logic";

const HUB = "__hub__";

type Props = {
  booking: BookingCommissionLike & { id: string };
  companyId: string | null | undefined;
  payments: { status: string }[] | null | undefined;
  audience: "manager" | "operator";
  /** Só hub_admin corrige o canal (a RPC confere de novo no servidor). */
  canFix: boolean;
};

/**
 * Canal da venda e comissão da reserva (E0.3.12). O Manager vê o pacote inteiro, a prova da
 * origem e pode corrigir o canal antes do pagamento. O estacionamento vê de onde veio a venda e
 * a comissão que ela paga.
 */
export function BookingCommissionCard({ booking, companyId, payments, audience, canFix }: Props) {
  const view = commissionView(booking, (iso) => formatDateTime(iso));
  const [fixing, setFixing] = React.useState(false);
  const manager = audience === "manager";
  const fixable = manager && canFix && canFixChannel(payments);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle>Canal da venda</CardTitle>
        {fixable && (
          <Button size="sm" variant="secondary" onClick={() => setFixing(true)}>
            Corrigir canal
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-title-md text-ink">{view.channel}</span>
          {view.fromRule && <Badge tone="active">venda trazida pelo estacionamento</Badge>}
          {view.locked && manager && <Badge tone="pending">corrigido à mão</Badge>}
        </div>

        {view.legacy ? (
          <p className="text-body-sm text-muted">
            Reserva criada antes da comissão por origem. Vale a comissão padrão da empresa.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 tablet:grid-cols-3">
            <Item label="Comissão da Movepark" value={`${view.takeRatePct}%`} />
            {manager && view.feePayer && <Item label="Taxa do gateway" value={view.feePayer} />}
            {manager && view.chargeback && <Item label="Chargeback" value={view.chargeback} />}
          </dl>
        )}

        {manager && view.proof.length > 0 && (
          <div>
            <div className="text-caption text-muted">De onde o cliente veio</div>
            <dl className="mt-1 grid gap-x-6 gap-y-1 tablet:grid-cols-2">
              {view.proof.map((p) => (
                <div key={p.label} className="flex gap-2 text-body-sm">
                  <dt className="shrink-0 text-muted">{p.label}:</dt>
                  <dd className="min-w-0 break-all text-ink">{p.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {manager && canFix && !canFixChannel(payments) && (
          <p className="text-caption text-muted">
            A reserva já foi paga e a divisão já foi para o gateway. Se o canal estiver errado, o
            acerto é feito por fora, na conta do estacionamento.
          </p>
        )}
      </CardContent>

      {fixing && <FixDialog bookingId={booking.id} companyId={companyId} onClose={() => setFixing(false)} />}
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="text-body-sm text-ink">{value}</dd>
    </div>
  );
}

function FixDialog({
  bookingId,
  companyId,
  onClose,
}: {
  bookingId: string;
  companyId: string | null | undefined;
  onClose: () => void;
}) {
  const rules = useCommissionRules();
  const setCommission = useSetBookingCommission();
  const [ruleId, setRuleId] = React.useState(HUB);
  const [reason, setReason] = React.useState("");
  const options = rulesForCompany(rules.data, companyId);

  async function submit() {
    if (!reason.trim()) {
      toast.error("Escreva o motivo da correção. Ele fica no histórico da reserva.");
      return;
    }
    try {
      await setCommission.mutateAsync({ bookingId, ruleId: ruleId === HUB ? null : ruleId, reason: reason.trim() });
      toast.success("Canal corrigido.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao corrigir o canal.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Corrigir canal da venda</DialogTitle>
          <DialogDescription>
            A cobrança desta reserva vai usar a comissão do canal escolhido. A troca fica registrada
            com o seu usuário e o motivo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fix-rule">Canal</Label>
            <Select value={ruleId} onValueChange={setRuleId}>
              <SelectTrigger id="fix-rule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HUB}>Movepark (comissão padrão da empresa)</SelectItem>
                {options.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.take_rate_bps / 100}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fix-reason">Motivo</Label>
            <Textarea
              id="fix-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Cliente veio pelo site do estacionamento e o link estava sem UTM."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={setCommission.isPending}>
            {setCommission.isPending ? "Salvando…" : "Corrigir canal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
