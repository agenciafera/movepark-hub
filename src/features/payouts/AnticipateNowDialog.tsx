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
import { formatBRL } from "@/lib/format";
import {
  useAnticipationLimits,
  useCompanyAnticipations,
  useCreateAnticipation,
  useSimulateAnticipation,
  type AnticipationSimulation,
} from "./api";

type Props = {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** `2026-11-16T00:00:00.000Z` → `16/11`. A data do gateway é de calendário, sem fuso. */
function diaMes(iso: string | null): string {
  if (!iso || iso.length < 10) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

const STATUS: Record<string, string> = {
  pending: "Aguardando a Pagar.me",
  pre_approved: "Pré-aprovada",
  approved: "Aprovada",
  refused: "Recusada",
  canceled: "Cancelada",
};

/**
 * Antecipação pontual do recebedor da empresa (E0.3.14), para as vendas já feitas no cartão. Só
 * cria depois de simular: a taxa e a data vêm da Pagar.me, e a ação não se desfaz por aqui.
 * Spec: docs/specs/antecipacao-do-parceiro.md
 */
export function AnticipateNowDialog({ companyId, open, onOpenChange }: Props) {
  const limits = useAnticipationLimits(companyId, open);
  const list = useCompanyAnticipations(companyId, open);
  const simulate = useSimulateAnticipation();
  const create = useCreateAnticipation();
  const max = limits.data?.max_amount_cents ?? 0;
  const [valor, setValor] = React.useState<string>("");
  const [sim, setSim] = React.useState<(AnticipationSimulation & { requested: number }) | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSim(null);
    setValor(max > 0 ? String(max / 100) : "");
  }, [open, max]);

  const cents = Math.round(Number(valor.replace(",", ".")) * 100);
  const valido = Number.isFinite(cents) && cents > 0 && cents <= max;

  async function simular() {
    try {
      const r = await simulate.mutateAsync({ company_id: companyId, requested_cents: cents });
      setSim({ ...r, requested: cents });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao simular");
    }
  }

  async function confirmar() {
    if (!sim) return;
    try {
      const r = await create.mutateAsync({ company_id: companyId, requested_cents: sim.requested });
      toast.success(
        r.fee_borne_by === "movepark"
          ? "Antecipação pedida. A taxa volta ao estacionamento como crédito na próxima venda."
          : "Antecipação pedida.",
      );
      setSim(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao antecipar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Antecipar agora</DialogTitle>
          <DialogDescription>
            Adianta o que o estacionamento tem a receber no cartão. A Pagar.me aprova uma vez por dia, às 11h.
          </DialogDescription>
        </DialogHeader>

        {limits.isLoading ? (
          <p className="text-body-sm text-muted">Consultando a Pagar.me…</p>
        ) : max <= 0 ? (
          <p className="text-body-sm text-ink">Nada para antecipar agora.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-body-sm text-ink">Dá para antecipar até {formatBRL(max / 100)}.</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="anticipation-amount">Valor a antecipar (R$)</Label>
              <Input
                id="anticipation-amount"
                type="number"
                min={0.01}
                step={0.01}
                max={max / 100}
                value={valor}
                onChange={(e) => {
                  setValor(e.target.value);
                  setSim(null);
                }}
              />
            </div>
            {sim ? (
              <div className="rounded-md border border-hairline bg-surface-soft p-3 text-body-sm text-ink">
                <p>
                  Taxa de {formatBRL((sim.anticipation_fee_cents ?? 0) / 100)}, cai em {diaMes(sim.payment_date)}.
                </p>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={simular} disabled={!valido || simulate.isPending}>
                {simulate.isPending ? "Simulando…" : "Simular"}
              </Button>
              {sim ? (
                <Button onClick={confirmar} disabled={create.isPending}>
                  {create.isPending ? "Pedindo…" : "Confirmar antecipação"}
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {(list.data?.length ?? 0) > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
            <span className="text-body-sm font-semibold text-ink">Antecipações pedidas</span>
            <ul className="flex flex-col gap-1">
              {list.data!.map((a) => (
                <li key={a.id} className="flex justify-between text-body-sm text-ink">
                  <span>
                    {formatBRL(a.requested_cents / 100)} · {STATUS[a.status] ?? a.status}
                  </span>
                  <span className="text-muted">
                    taxa {a.anticipation_fee_cents == null ? "a confirmar" : formatBRL(a.anticipation_fee_cents / 100)} ·{" "}
                    {a.fee_borne_by === "movepark" ? "Movepark" : "estacionamento"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
