import { formatBRL } from "@/lib/format";
import type { LocationParkingTypeWithRelations } from "./api";
import { STRATEGY_LABEL, type PricingStrategy } from "./strategies";

export function StrategyChip({ strategy }: { strategy: PricingStrategy | string | null }) {
  const label = strategy ? STRATEGY_LABEL[strategy as PricingStrategy] ?? strategy : "Sem estratégia";
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-mp-pale px-3 text-caption text-mp-indigo">
      {label}
    </span>
  );
}

/** Resumo compacto da regra de preço: uma linha por estratégia */
export function PricingSummary({ lpt }: { lpt: LocationParkingTypeWithRelations }) {
  const rule = lpt.pricing_rule;
  if (!rule) {
    return (
      <p className="text-body-sm text-muted">
        Sem regra de precificação. Clique em <strong>Configurar precificação</strong>.
      </p>
    );
  }

  const tiers = (rule.tiers ?? [])
    .filter((t) => !t.is_old_price)
    .sort((a, b) => a.from_day - b.from_day);
  const strategy = rule.strategy as PricingStrategy;

  if (strategy === "tiered_progressive" || strategy === "uniform_by_duration") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-body">
        {tiers.map((t) => (
          <span key={t.id} className="tabular-nums">
            <strong className="text-ink">
              {t.from_day}
              {t.to_day && t.to_day !== t.from_day ? `a ${t.to_day}` : ""}
              {!t.to_day ? "+" : ""}d
            </strong>
            : {formatBRL(Number(t.unit_price ?? 0))}/dia
          </span>
        ))}
      </div>
    );
  }

  if (strategy === "fixed_bracket") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-body">
        {tiers.map((t) => (
          <span key={t.id} className="tabular-nums">
            <strong className="text-ink">
              {t.from_day}
              {t.to_day && t.to_day !== t.from_day ? `a ${t.to_day}` : ""}
              {!t.to_day ? "+" : ""}d
            </strong>
            :{" "}
            {t.total_price != null
              ? formatBRL(Number(t.total_price))
              : `${formatBRL(Number(t.unit_price ?? 0))}/dia`}
          </span>
        ))}
      </div>
    );
  }

  if (strategy === "incremental_formula") {
    return (
      <div className="space-y-0.5 text-body-sm text-body tabular-nums">
        <div>
          <strong className="text-ink">1d</strong>:{" "}
          {formatBRL(Number(rule.incremental_one_day_price ?? 0))} ·{" "}
          <strong className="text-ink">2d</strong>:{" "}
          {formatBRL(Number(rule.incremental_two_days_price ?? 0))}
        </div>
        <div>
          <strong className="text-ink">3+d</strong>:{" "}
          {formatBRL(Number(rule.incremental_base ?? 0))} + dias ×{" "}
          {formatBRL(Number(rule.incremental_multiplier ?? 0))}
        </div>
      </div>
    );
  }

  if (strategy === "monthly_remainder") {
    return (
      <div className="text-body-sm text-body tabular-nums">
        Pacote 30d: <strong>{formatBRL(Number(rule.monthly_fixed_price ?? 0))}</strong> ·
        diária extra: <strong>{formatBRL(Number(rule.monthly_daily_rate ?? 0))}</strong>
      </div>
    );
  }

  if (strategy === "hourly_capped") {
    return (
      <div className="space-y-0.5 text-body-sm text-body tabular-nums">
        <div>
          0 a 30min: {formatBRL(Number(rule.hourly_initial_rate ?? 0))} · 31 a 60min:{" "}
          {formatBRL(Number(rule.hourly_one_hour_rate ?? 0))}
        </div>
        <div>
          hora extra: {formatBRL(Number(rule.hourly_fraction_rate ?? 0))} · teto:{" "}
          <strong>{formatBRL(Number(rule.hourly_daily_rate ?? 0))}</strong>
        </div>
      </div>
    );
  }

  if (strategy === "surcharge") {
    const pct = rule.surcharge_multiplier ? Number(rule.surcharge_multiplier) * 100 : 0;
    return (
      <div className="text-body-sm text-body">
        Herda outro tipo · multiplicador <strong>{pct.toFixed(0)}%</strong>
      </div>
    );
  }

  return <p className="text-body-sm text-muted">Estratégia sem resumo disponível.</p>;
}
