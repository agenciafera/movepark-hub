import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import {
  MAX_FEE_BPS,
  differsFromContract,
  formatBps,
  measuredAntifraudCents,
  measuredForBand,
  parseGatewayFeeSchedule,
  parseHundredths,
  validateGatewayFeeSchedule,
  type GatewayFeeSchedule,
} from "@/lib/gatewayFees";
import { useAppSettings, useGatewayFeeMeasured, useUpdateAppSettings } from "./api";

type BandRow = { from: string; to: string; pct: string };
type Form = {
  pix: string;
  antifraud: string;
  processing: string;
  anticipation: string;
  withdrawal: string;
  bands: BandRow[];
  /** Custo para receber em 30 dias, de 1x a 12x. */
  cet: string[];
};

const PARCELAS = Array.from({ length: 12 }, (_, i) => i + 1);

const DEFAULT_BANDS: BandRow[] = [
  { from: "1", to: "1", pct: "" },
  { from: "2", to: "6", pct: "" },
  { from: "7", to: "12", pct: "" },
];

const hundredths = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "" : (n / 100).toFixed(2);

function formFrom(data: Record<string, string> | undefined): Form {
  const s = parseGatewayFeeSchedule(data?.gateway_fee_schedule);
  const ant = data?.card_anticipation_rate_monthly_bps;
  const wd = data?.payout_withdrawal_fee_cents;
  return {
    pix: s ? hundredths(s.pix_bps) : "",
    antifraud: s ? hundredths(s.antifraud_cents) : "",
    processing: s?.processing_cents != null ? hundredths(s.processing_cents) : "",
    anticipation: ant ? hundredths(Number(ant)) : "",
    withdrawal: wd ? hundredths(Number(wd)) : "",
    bands: s
      ? s.card.map((b) => ({ from: String(b.from), to: String(b.to), pct: hundredths(b.bps) }))
      : DEFAULT_BANDS,
    cet: PARCELAS.map((n) => (s?.cet30_bps ? hundredths(s.cet30_bps[n - 1]) : "")),
  };
}

function toSchedule(f: Form): GatewayFeeSchedule {
  return {
    version: 1,
    pix_bps: parseHundredths(f.pix),
    card: f.bands.map((b) => ({
      from: Number(b.from),
      to: Number(b.to),
      bps: parseHundredths(b.pct),
    })),
    antifraud_cents: parseHundredths(f.antifraud),
    // Vazios ficam fora do JSON (a tabela antiga não tinha estas chaves); pela metade, a
    // validação recusa.
    processing_cents: f.processing.trim() === "" ? undefined : parseHundredths(f.processing),
    cet30_bps: f.cet.every((v) => v.trim() === "") ? undefined : f.cet.map(parseHundredths),
  };
}

/** A coluna "medido": taxa efetiva, quantas vendas e se foge do contrato. */
function Medido({
  bps,
  sales,
  contractBps,
}: {
  bps: number | null;
  sales: number;
  contractBps: number;
}) {
  if (!sales || bps == null) return <span className="text-caption text-muted">sem venda</span>;
  const foge = differsFromContract(bps, Number.isFinite(contractBps) ? contractBps : null);
  return (
    <span className={`text-caption tabular-nums ${foge ? "font-medium text-error" : "text-muted"}`}>
      {formatBps(bps)} em {sales} {sales === 1 ? "venda" : "vendas"}
      {foge ? " · diferente do contrato" : ""}
    </span>
  );
}

/**
 * Taxas do gateway (23/11/2026): a tabela contratada com a Pagar.me, ao lado do que as vendas dos
 * últimos 90 dias pagaram de fato. Mora só no banco (o repo é público). Spec:
 * docs/specs/taxas-da-reserva.md
 */
export function GatewayFeeScheduleSettings() {
  const { data, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const measured = useGatewayFeeMeasured(90).data;
  const [form, setForm] = React.useState<Form>(() => formFrom(undefined));
  const [ready, setReady] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (data && !ready) {
      setForm(formFrom(data));
      setReady(true);
    }
  }, [data, ready]);

  const cadastrada = parseGatewayFeeSchedule(data?.gateway_fee_schedule) != null;
  const setBand = (i: number, patch: Partial<BandRow>) =>
    setForm((f) => ({ ...f, bands: f.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const antifraudeMedio = measuredAntifraudCents(measured);

  async function save() {
    const schedule = toSchedule(form);
    const ant = parseHundredths(form.anticipation);
    const wd = parseHundredths(form.withdrawal);
    const problema =
      validateGatewayFeeSchedule(schedule) ??
      (!Number.isInteger(ant) || ant < 0 || ant > MAX_FEE_BPS
        ? "Antecipação fora de 0% a 20% ao mês."
        : null) ??
      (!Number.isInteger(wd) || wd < 0
        ? "Taxa de saque precisa ser um valor em reais não negativo."
        : null);
    setErro(problema);
    if (problema) return;
    try {
      await update.mutateAsync({
        gateway_fee_schedule: JSON.stringify(schedule),
        card_anticipation_rate_monthly_bps: String(ant),
        payout_withdrawal_fee_cents: String(wd),
      });
      toast.success("Tabela de taxas salva");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Taxas do gateway (Pagar.me)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-caption text-muted text-pretty">
          Taxas contratadas com a Pagar.me. Ficam só no banco e aparecem nas taxas de cada reserva.
          Ao lado, quanto as vendas dos últimos 90 dias pagaram.
          {!cadastrada && " Tabela ainda não cadastrada."}
        </p>

        <div className="grid gap-2 tablet:grid-cols-[1fr_8rem_1fr] tablet:items-center">
          <Label htmlFor="fee-pix">Pix (% sobre o valor)</Label>
          <Input
            id="fee-pix"
            inputMode="decimal"
            value={form.pix}
            onChange={(e) => setForm((f) => ({ ...f, pix: e.target.value }))}
            disabled={isLoading}
          />
          <Medido
            {...measuredForBand(measured, "pix", 1, 1)}
            contractBps={parseHundredths(form.pix)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink">
            Cartão por faixa de parcelas (% sobre o valor)
          </span>
          {form.bands.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-testid={`faixa-${i + 1}`}>
              <Input
                aria-label={`Faixa ${i + 1}: de`}
                className="w-16"
                inputMode="numeric"
                value={b.from}
                onChange={(e) => setBand(i, { from: e.target.value })}
              />
              <span className="text-caption text-muted">x a</span>
              <Input
                aria-label={`Faixa ${i + 1}: até`}
                className="w-16"
                inputMode="numeric"
                value={b.to}
                onChange={(e) => setBand(i, { to: e.target.value })}
              />
              <span className="text-caption text-muted">x</span>
              <Input
                aria-label={`Faixa ${i + 1}: taxa (%)`}
                className="w-24"
                inputMode="decimal"
                value={b.pct}
                onChange={(e) => setBand(i, { pct: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remover faixa ${i + 1}`}
                disabled={form.bands.length === 1}
                onClick={() => setForm((f) => ({ ...f, bands: f.bands.filter((_, j) => j !== i) }))}
              >
                <Trash />
              </Button>
              <Medido
                {...measuredForBand(measured, "card", Number(b.from), Number(b.to))}
                contractBps={parseHundredths(b.pct)}
              />
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((f) => ({ ...f, bands: [...f.bands, { from: "", to: "", pct: "" }] }))
              }
            >
              <Plus /> Adicionar faixa
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink">
            Custo para receber em 30 dias (CET), por número de parcelas
          </span>
          <span className="text-caption text-muted text-pretty">
            O que a Pagar.me cobra no total, taxa do cartão mais antecipação, para o dinheiro entrar
            em 30 dias. É a coluna da direita da tabela de condições.
          </span>
          <div className="grid grid-cols-3 gap-2 tablet:grid-cols-6">
            {PARCELAS.map((n) => (
              <label key={n} className="flex flex-col gap-1 text-caption text-muted">
                {n}x
                <Input
                  aria-label={`Custo em 30 dias ${n}x (%)`}
                  inputMode="decimal"
                  value={form.cet[n - 1]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cet: f.cet.map((v, j) => (j === n - 1 ? e.target.value : v)),
                    }))
                  }
                  disabled={isLoading}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-2 tablet:grid-cols-[1fr_8rem_1fr] tablet:items-center">
          <Label htmlFor="fee-antifraud">Antifraude (R$ por transação)</Label>
          <Input
            id="fee-antifraud"
            inputMode="decimal"
            value={form.antifraud}
            onChange={(e) => setForm((f) => ({ ...f, antifraud: e.target.value }))}
            disabled={isLoading}
          />
          <span className="text-caption text-muted tabular-nums">
            {antifraudeMedio == null ? "sem venda" : `${formatBRL(antifraudeMedio / 100)} em média`}
          </span>

          <Label htmlFor="fee-processing">Gateway (R$ por transação)</Label>
          <Input
            id="fee-processing"
            inputMode="decimal"
            value={form.processing}
            onChange={(e) => setForm((f) => ({ ...f, processing: e.target.value }))}
            disabled={isLoading}
          />
          <span className="text-caption text-muted">não aparece nos recebíveis</span>

          <Label htmlFor="fee-anticipation">Antecipação (% ao mês)</Label>
          <Input
            id="fee-anticipation"
            inputMode="decimal"
            value={form.anticipation}
            onChange={(e) => setForm((f) => ({ ...f, anticipation: e.target.value }))}
            disabled={isLoading}
          />
          <span className="text-caption text-muted tabular-nums">
            {measured?.anticipation.payables
              ? `${formatBps(measured.anticipation.monthly_bps)} ao mês em ${measured.anticipation.payables} parcelas`
              : "sem antecipação"}
          </span>

          <Label htmlFor="fee-withdrawal">Saque para o banco (R$)</Label>
          <Input
            id="fee-withdrawal"
            inputMode="decimal"
            value={form.withdrawal}
            onChange={(e) => setForm((f) => ({ ...f, withdrawal: e.target.value }))}
            disabled={isLoading}
          />
          <span className="text-caption text-muted">não medido</span>
        </div>

        <p className="text-caption text-muted text-pretty">
          Quando a Movepark paga a antecipação do estacionamento, o split usa esta taxa para estimar
          quanto mandar a mais.
        </p>

        {erro && (
          <p className="text-body-sm text-error" role="alert">
            {erro}
          </p>
        )}
        <div>
          <Button onClick={save} disabled={update.isPending || isLoading}>
            {update.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
