import * as React from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PercentInput } from "@/components/ui/percent-input";
import {
  STRATEGIES,
  FRACTIONAL_POLICIES,
  OLD_PRICE_STRATEGIES,
  USES_TIERS,
  STRATEGY_LABEL,
  type PricingStrategy,
  type FractionalDayPolicy,
  type OldPriceStrategy,
} from "./strategies";
import {
  PricingTierEditor,
  type TierDraft,
} from "./PricingTierEditor";
import { PriceSimulator } from "./PriceSimulator";
import {
  useOperatorSetPricing,
  useLocationParkingTypesByCompany,
  type LocationParkingTypeWithRelations,
} from "./api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lpt: LocationParkingTypeWithRelations | null;
  companyId: string;
  companySlug: string;
  locationSlug: string;
  parkingTypeCode: string;
};

function tiersToDraft(tiers: { id: string; from_day: number; to_day: number | null; unit_price: number | null; total_price: number | null; is_old_price: boolean }[]): TierDraft[] {
  return tiers
    .filter((t) => !t.is_old_price)
    .sort((a, b) => a.from_day - b.from_day)
    .map((t) => ({
      id: t.id,
      from_day: t.from_day,
      to_day: t.to_day,
      unit_price: t.unit_price === null ? null : Number(t.unit_price),
      total_price: t.total_price === null ? null : Number(t.total_price),
    }));
}

export function PricingRuleEditor({
  open,
  onOpenChange,
  lpt,
  companyId,
  companySlug,
  locationSlug,
  parkingTypeCode,
}: Props) {
  const setPricing = useOperatorSetPricing();

  const [strategy, setStrategy] = React.useState<PricingStrategy>("uniform_by_duration");
  const [fractionalPolicy, setFractionalPolicy] = React.useState<FractionalDayPolicy>("any_extra");
  const [fractionalTolerance, setFractionalTolerance] = React.useState<number | null>(null);
  const [oldPriceStrategy, setOldPriceStrategy] = React.useState<OldPriceStrategy>("none");
  const [oldPriceMultiplier, setOldPriceMultiplier] = React.useState<number | null>(null);
  const [basePrice, setBasePrice] = React.useState<number | null>(0);
  const [advanceMinutes, setAdvanceMinutes] = React.useState<number | null>(null);

  // padrão 4
  const [oneDay, setOneDay] = React.useState<number | null>(null);
  const [twoDays, setTwoDays] = React.useState<number | null>(null);
  const [incBase, setIncBase] = React.useState<number | null>(null);
  const [incMultiplier, setIncMultiplier] = React.useState<number | null>(null);

  // padrão 5
  const [monthlyFixed, setMonthlyFixed] = React.useState<number | null>(null);
  const [monthlyDaily, setMonthlyDaily] = React.useState<number | null>(null);

  // padrão 6
  const [hourlyInitial, setHourlyInitial] = React.useState<number | null>(null);
  const [hourlyOneHour, setHourlyOneHour] = React.useState<number | null>(null);
  const [hourlyFraction, setHourlyFraction] = React.useState<number | null>(null);
  const [hourlyDaily, setHourlyDaily] = React.useState<number | null>(null);
  const [hourlyHoursPerDay, setHourlyHoursPerDay] = React.useState<number | null>(null);

  // padrão 7
  const [surchargeSourceId, setSurchargeSourceId] = React.useState<string | null>(null);
  const [surchargeMultiplier, setSurchargeMultiplier] = React.useState<number | null>(null);

  // tiers
  const [tiers, setTiers] = React.useState<TierDraft[]>([]);

  // outras LPTs da empresa pra escolher como source de surcharge
  const surchargeSources = useLocationParkingTypesByCompany(companyId, lpt?.id);

  // Carrega estado inicial quando abre
  React.useEffect(() => {
    if (!open || !lpt) return;
    const r = lpt.pricing_rule;
    setBasePrice(Number(lpt.company_parking_type.base_price) || 0);
    setStrategy((r?.strategy as PricingStrategy) ?? "uniform_by_duration");
    setFractionalPolicy(((r?.fractional_day_policy as FractionalDayPolicy) ?? "any_extra"));
    setFractionalTolerance(r?.fractional_day_tolerance != null ? Number(r.fractional_day_tolerance) : null);
    setOldPriceStrategy((r?.old_price_strategy as OldPriceStrategy) ?? "none");
    setOldPriceMultiplier(r?.old_price_multiplier != null ? Number(r.old_price_multiplier) : null);
    setAdvanceMinutes(r?.advance_booking_minutes ?? null);

    setOneDay(r?.incremental_one_day_price != null ? Number(r.incremental_one_day_price) : null);
    setTwoDays(r?.incremental_two_days_price != null ? Number(r.incremental_two_days_price) : null);
    setIncBase(r?.incremental_base != null ? Number(r.incremental_base) : null);
    setIncMultiplier(r?.incremental_multiplier != null ? Number(r.incremental_multiplier) : null);

    setMonthlyFixed(r?.monthly_fixed_price != null ? Number(r.monthly_fixed_price) : null);
    setMonthlyDaily(r?.monthly_daily_rate != null ? Number(r.monthly_daily_rate) : null);

    setHourlyInitial(r?.hourly_initial_rate != null ? Number(r.hourly_initial_rate) : null);
    setHourlyOneHour(r?.hourly_one_hour_rate != null ? Number(r.hourly_one_hour_rate) : null);
    setHourlyFraction(r?.hourly_fraction_rate != null ? Number(r.hourly_fraction_rate) : null);
    setHourlyDaily(r?.hourly_daily_rate != null ? Number(r.hourly_daily_rate) : null);
    setHourlyHoursPerDay(r?.hourly_hours_per_day ?? null);

    setSurchargeSourceId(r?.surcharge_source_id ?? null);
    setSurchargeMultiplier(r?.surcharge_multiplier != null ? Number(r.surcharge_multiplier) : null);

    setTiers(tiersToDraft(r?.tiers ?? []));
  }, [open, lpt]);

  if (!lpt) return null;

  const showTiers = USES_TIERS[strategy];

  async function handleSave() {
    if (!lpt) return;
    try {
      await setPricing.mutateAsync({
        locationParkingTypeId: lpt.id,
        basePrice,
        rule: {
          strategy,
          fractional_day_policy: fractionalPolicy,
          fractional_day_tolerance: fractionalTolerance,
          old_price_strategy: oldPriceStrategy,
          old_price_multiplier: oldPriceStrategy === "multiplier" ? oldPriceMultiplier : null,
          advance_booking_minutes: advanceMinutes,
          incremental_one_day_price: strategy === "incremental_formula" ? oneDay : null,
          incremental_two_days_price: strategy === "incremental_formula" ? twoDays : null,
          incremental_base: strategy === "incremental_formula" ? incBase : null,
          incremental_multiplier: strategy === "incremental_formula" ? incMultiplier : null,
          monthly_fixed_price: strategy === "monthly_remainder" ? monthlyFixed : null,
          monthly_daily_rate: strategy === "monthly_remainder" ? monthlyDaily : null,
          hourly_initial_rate: strategy === "hourly_capped" ? hourlyInitial : null,
          hourly_one_hour_rate: strategy === "hourly_capped" ? hourlyOneHour : null,
          hourly_fraction_rate: strategy === "hourly_capped" ? hourlyFraction : null,
          hourly_daily_rate: strategy === "hourly_capped" ? hourlyDaily : null,
          hourly_hours_per_day: strategy === "hourly_capped" ? hourlyHoursPerDay : null,
          surcharge_source_id: strategy === "surcharge" ? surchargeSourceId : null,
          surcharge_multiplier: strategy === "surcharge" ? surchargeMultiplier : null,
        },
        // só envia faixas quando a estratégia as usa (senão limpa)
        tiers: showTiers
          ? tiers.map((t) => ({
              from_day: t.from_day,
              to_day: t.to_day,
              unit_price: t.unit_price,
              total_price: t.total_price,
            }))
          : [],
      });

      toast.success("Precificação salva");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const submitting = setPricing.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="desktop:!w-[640px] desktop:!max-w-none">
        <SheetHeader>
          <SheetTitle>
            Precificação: {lpt.company_parking_type.parking_type.name}
          </SheetTitle>
          <SheetDescription>
            Estratégia atual:{" "}
            <strong className="text-ink">{STRATEGY_LABEL[strategy]}</strong>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-8">
          {/* Base price */}
          <section className="space-y-3">
            <h4 className="text-title-md">Preço base da empresa</h4>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bp">Valor referência (informativo)</Label>
              <CurrencyInput value={basePrice} onChange={setBasePrice} />
              <p className="text-caption text-muted">
                Não impacta o cálculo dinâmico, mas é usado em relatórios e como fallback.
              </p>
            </div>
          </section>

          <Separator />

          {/* Strategy */}
          <section className="space-y-3">
            <h4 className="text-title-md">Estratégia</h4>
            <div className="flex flex-col gap-1.5">
              <Label>Modelo de cálculo</Label>
              <Select
                value={strategy}
                onValueChange={(v) => setStrategy(v as PricingStrategy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted">
                {STRATEGIES.find((s) => s.value === strategy)?.description}
              </p>
            </div>
          </section>

          {/* Per-strategy fields */}
          {showTiers && (
            <>
              <Separator />
              <section className="space-y-3">
                <h4 className="text-title-md">Faixas de preço</h4>
                <PricingTierEditor strategy={strategy} tiers={tiers} onChange={setTiers} />
              </section>
            </>
          )}

          {strategy === "incremental_formula" && (
            <>
              <Separator />
              <section className="space-y-3">
                <h4 className="text-title-md">Fórmula incremental</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Preço 1 dia</Label>
                    <CurrencyInput value={oneDay} onChange={setOneDay} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Preço 2 dias</Label>
                    <CurrencyInput value={twoDays} onChange={setTwoDays} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Base (3+ dias)</Label>
                    <CurrencyInput value={incBase} onChange={setIncBase} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Multiplicador por dia</Label>
                    <CurrencyInput value={incMultiplier} onChange={setIncMultiplier} />
                  </div>
                </div>
                <p className="text-caption text-muted">
                  Fórmula 3+: <code>base + (dias × multiplicador)</code>.
                </p>
              </section>
            </>
          )}

          {strategy === "monthly_remainder" && (
            <>
              <Separator />
              <section className="space-y-3">
                <h4 className="text-title-md">Mensal + diária</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Pacote mensal (30 dias)</Label>
                    <CurrencyInput value={monthlyFixed} onChange={setMonthlyFixed} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Diária dos dias avulsos</Label>
                    <CurrencyInput value={monthlyDaily} onChange={setMonthlyDaily} />
                  </div>
                </div>
                <p className="text-caption text-muted">
                  Reservas de 15 a 30 dias usam o pacote mensal diretamente.
                </p>
              </section>
            </>
          )}

          {strategy === "hourly_capped" && (
            <>
              <Separator />
              <section className="space-y-3">
                <h4 className="text-title-md">Tarifas horárias</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>0–30 min</Label>
                    <CurrencyInput value={hourlyInitial} onChange={setHourlyInitial} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>31–60 min</Label>
                    <CurrencyInput value={hourlyOneHour} onChange={setHourlyOneHour} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Cada hora extra</Label>
                    <CurrencyInput
                      value={hourlyFraction}
                      onChange={setHourlyFraction}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Teto diário</Label>
                    <CurrencyInput value={hourlyDaily} onChange={setHourlyDaily} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Horas que formam 1 diária</Label>
                    <Input
                      type="number"
                      min={1}
                      value={hourlyHoursPerDay ?? ""}
                      onChange={(e) =>
                        setHourlyHoursPerDay(
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {strategy === "surcharge" && (
            <>
              <Separator />
              <section className="space-y-3">
                <h4 className="text-title-md">Sobretaxa sobre outro tipo</h4>
                <div className="flex flex-col gap-1.5">
                  <Label>Tipo base (mesma empresa)</Label>
                  <Select
                    value={surchargeSourceId ?? ""}
                    onValueChange={(v) => setSurchargeSourceId(v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {surchargeSources.data?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Multiplicador</Label>
                  <PercentInput
                    value={surchargeMultiplier}
                    onChange={setSurchargeMultiplier}
                  />
                  <p className="text-caption text-muted">
                    Ex.: <strong>140%</strong> aplica preço do tipo base × 1,40.
                    Use <strong>100%</strong> para herdar exatamente.
                  </p>
                </div>
              </section>
            </>
          )}

          <Separator />

          {/* Cross-cutting rules */}
          <section className="space-y-3">
            <h4 className="text-title-md">Tratamento de fração de dia</h4>
            <div className="flex flex-col gap-1.5">
              <Label>Política</Label>
              <Select
                value={fractionalPolicy}
                onValueChange={(v) => setFractionalPolicy(v as FractionalDayPolicy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRACTIONAL_POLICIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(fractionalPolicy === "hour_tolerance" || fractionalPolicy === "time_of_day") && (
              <div className="flex flex-col gap-1.5">
                <Label>Tolerância (horas)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={fractionalTolerance ?? ""}
                  onChange={(e) =>
                    setFractionalTolerance(
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                />
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-3">
            <h4 className="text-title-md">Preço de balcão (riscado)</h4>
            <div className="flex flex-col gap-1.5">
              <Label>Estratégia</Label>
              <Select
                value={oldPriceStrategy}
                onValueChange={(v) => setOldPriceStrategy(v as OldPriceStrategy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OLD_PRICE_STRATEGIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {oldPriceStrategy === "multiplier" && (
              <div className="flex flex-col gap-1.5">
                <Label>Multiplicador do preço de balcão</Label>
                <PercentInput value={oldPriceMultiplier} onChange={setOldPriceMultiplier} />
                <p className="text-caption text-muted">
                  120% aumenta 20% sobre o preço calculado.
                </p>
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-3">
            <h4 className="text-title-md">Reserva antecipada</h4>
            <div className="flex flex-col gap-1.5">
              <Label>Antecedência mínima (minutos)</Label>
              <Input
                type="number"
                min={0}
                value={advanceMinutes ?? ""}
                placeholder="Ex.: 30"
                onChange={(e) =>
                  setAdvanceMinutes(e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
          </section>

          <Separator />

          <PriceSimulator
            companySlug={companySlug}
            locationSlug={locationSlug}
            parkingTypeCode={parkingTypeCode}
          />
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-hairline bg-canvas px-6 py-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            <Save className="h-4 w-4" />
            {submitting ? "Salvando…" : "Salvar precificação"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
