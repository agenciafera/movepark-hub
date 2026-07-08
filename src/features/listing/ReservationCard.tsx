import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Info, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DateRangeField } from "@/features/search/DateRangeField";
import { useAuth } from "@/auth/context";
import { formatBRL, formatDuration } from "@/lib/format";
import { originFromSrc } from "@/lib/bookingOrigin";
import { getStoredUtm } from "@/lib/utm";
import {
  parseCouponParam,
  getStoredCoupon,
  storeCoupon,
  clearStoredCoupon,
  normalizeCouponCode,
} from "@/lib/coupon";
import {
  useSimulatePrice,
  useAvailability,
  useDebounced,
  useCreateBooking,
  useValidateCoupon,
  useLocationAddOns,
  type ListingDetail,
} from "./api";
import { availabilityUi } from "./availability.logic";
import { useUnitFares } from "@/features/fares/api";
import { fareReais } from "@/lib/fares";
import { PriceTableDialog } from "./PriceTableDialog";
import { FareComparisonDialog } from "./FareComparisonDialog";
import { couponDiscountLabel, couponErrorMessage, type CouponPreview } from "./coupon.logic";
import { addOnsTotal, bookingTotal, mergeUnitFares, selectedAddOns } from "./reservation.logic";
import { cn } from "@/lib/utils";

type Props = {
  listing: ListingDetail;
  initialFrom: Date | null;
  initialTo: Date | null;
};

type FareTier = "basic" | "flex" | "superflex";

type FareOption = {
  id: FareTier;
  label: string;
  surcharge: number;
  tagline: string;
  tooltip: string[];
  badgeText: string;
  cancellationLine: string;
  guaranteeContext: string;
};

const FARE_OPTIONS: FareOption[] = [
  {
    id: "basic",
    label: "Básica",
    surcharge: 0,
    tagline: "Grátis",
    tooltip: ["Cancele grátis até 24h", "Confirmação por e-mail", "Vaga garantida"],
    badgeText: "Cancelamento grátis até 24h",
    cancellationLine: "Cancelamento grátis até 24h antes",
    guaranteeContext: "cancele grátis até 24h",
  },
  {
    id: "flex",
    label: "Flex",
    surcharge: 12.9,
    tagline: "+ R$ 12,90",
    tooltip: ["Tudo da Básica", "Troca de placa e data", "SMS/WhatsApp na chegada"],
    badgeText: "Cancelamento grátis até 24h",
    cancellationLine: "Cancelamento grátis até 24h antes · troca de placa liberada",
    guaranteeContext: "cancele grátis até 24h · troca de placa liberada",
  },
  {
    id: "superflex",
    label: "Superflex",
    surcharge: 24.9,
    tagline: "+ R$ 24,90",
    tooltip: ["Tudo da Flex", "Cancele até 1 min antes", "Proteção de voo", "Suporte prioritário"],
    badgeText: "Cancele até 1 min antes",
    cancellationLine: "Cancelamento até 1 min antes da entrada",
    guaranteeContext: "cancela até 1 min antes · proteção de voo incluída",
  },
];

function daysBetween(a: Date | null, b: Date | null): number {
  if (!a || !b || b <= a) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function ReservationCard({ listing, initialFrom, initialTo }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, effectiveRole } = useAuth();
  const createBooking = useCreateBooking();

  const [openTooltip, setOpenTooltip] = React.useState<FareTier | null>(null);
  const [from, setFrom] = React.useState<Date | null>(initialFrom);
  const [to, setTo] = React.useState<Date | null>(initialTo);
  const [passengers, setPassengers] = React.useState<number>(1);
  const [hasPcd, setHasPcd] = React.useState<boolean>(false);
  const [priceTableOpen, setPriceTableOpen] = React.useState<boolean>(false);
  const [fareComparisonOpen, setFareComparisonOpen] = React.useState<boolean>(false);
  const [selectedFare, setSelectedFare] = React.useState<FareTier>("flex");

  const validateCoupon = useValidateCoupon();
  // Cupom de campanha: da query string (?cupom=/?coupon=) ou guardado na sessão (sobrevive ao
  // round-trip de login). O `couponCode` é o código pretendido; o effect re-valida (o desconto
  // depende dos dias) e produz o `applied`. Sem gate de login (validação anônima server-side).
  const initialCoupon = parseCouponParam(location.search) ?? getStoredCoupon() ?? "";
  const [couponInput, setCouponInput] = React.useState<string>(initialCoupon);
  const [couponCode, setCouponCode] = React.useState<string | null>(initialCoupon || null);
  const [applied, setApplied] = React.useState<CouponPreview | null>(null);
  const [couponMsg, setCouponMsg] = React.useState<string | null>(null);

  const addOnsQuery = useLocationAddOns(listing.location.id);
  const addOns = addOnsQuery.data ?? [];
  const [selectedAddOnIds, setSelectedAddOnIds] = React.useState<string[]>([]);

  // Tarifas com preço/on-off REAIS da unidade (E2.8-f); cai nos defaults se o catálogo não carregar.
  const unitFaresQuery = useUnitFares(listing.id);
  const pricedFares: FareOption[] = React.useMemo(
    () =>
      mergeUnitFares(FARE_OPTIONS, unitFaresQuery.data ?? [], {
        reais: fareReais,
        brl: formatBRL,
      }),
    [unitFaresQuery.data],
  );

  function toggleAddOn(id: string) {
    setSelectedAddOnIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const days = daysBetween(from, to);
  const debouncedDays = useDebounced(days, 300);
  const debouncedFrom = useDebounced(from, 300);
  const debouncedTo = useDebounced(to, 300);

  const sim = useSimulatePrice({
    companySlug: listing.company.slug,
    locationSlug: listing.location.slug,
    parkingTypeCode: listing.parking_type.code,
    days: debouncedDays,
  });

  const avail = useAvailability({
    companySlug: listing.company.slug,
    locationSlug: listing.location.slug,
    parkingTypeCode: listing.parking_type.code,
    from: debouncedFrom,
    to: debouncedTo,
  });
  const availUi = availabilityUi(avail.data);

  const pricingStale = sim.isFetching && (from !== debouncedFrom || to !== debouncedTo);

  const canReserve =
    !!from && !!to && days > 0 && sim.data?.price != null && !sim.isFetching && availUi.canReserve;

  // Re-valida o cupom pretendido sempre que ele ou as datas mudarem (o desconto depende dos dias).
  // Cobre: aplicar manual, auto-aplicar da URL/sessão, e recalcular ao trocar as datas.
  React.useEffect(() => {
    if (!couponCode || !from || !to || days <= 0) {
      setApplied(null);
      setCouponMsg(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const preview = await validateCoupon.mutateAsync({
          code: couponCode,
          location_parking_type_id: listing.id,
          check_in_at: from.toISOString(),
          check_out_at: to.toISOString(),
        });
        if (cancelled) return;
        if (preview.valid) {
          setApplied(preview);
          setCouponMsg(null);
          storeCoupon(couponCode); // sobrevive ao round-trip de login
        } else {
          setApplied(null);
          setCouponMsg(couponErrorMessage(preview.error_code));
        }
      } catch (err) {
        if (cancelled) return;
        setApplied(null);
        setCouponMsg(err instanceof Error ? err.message : "Não foi possível validar o cupom");
      }
    })();
    return () => {
      cancelled = true;
    };
    // validateCoupon é uma mutation estável; re-validar só quando código/datas/unidade mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponCode, from, to, listing.id]);

  // Se a Tarifa selecionada não existe nesta unidade, cai pra "popular" (flex) ou a primeira válida.
  React.useEffect(() => {
    if (pricedFares.length > 0 && !pricedFares.some((f) => f.id === selectedFare)) {
      setSelectedFare(pricedFares.some((f) => f.id === "flex") ? "flex" : pricedFares[0].id);
    }
  }, [pricedFares, selectedFare]);

  // Aplicar = definir o código pretendido; o effect valida (server-side, sem exigir login).
  function applyCoupon() {
    const code = normalizeCouponCode(couponInput);
    if (!code) return;
    setCouponMsg(null);
    setCouponCode(code);
  }

  function clearCoupon() {
    setApplied(null);
    setCouponInput("");
    setCouponCode(null);
    setCouponMsg(null);
    clearStoredCoupon();
  }

  async function handleReserve() {
    if (!from || !to) return;
    if (!session) {
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(`/login?next=${next}`);
      return;
    }
    if (effectiveRole !== "customer") {
      toast.error("Faça login com uma conta de cliente pra reservar.");
      return;
    }
    try {
      const result = await createBooking.mutateAsync({
        location_parking_type_id: listing.id,
        check_in_at: from.toISOString(),
        check_out_at: to.toISOString(),
        passenger_count: listing.location.has_passenger_quantity ? passengers : null,
        has_pcd: listing.location.has_pcd_config ? hasPcd : false,
        add_on_service_ids: selectedAddOnIds,
        coupon_code: applied?.code ?? null,
        // Tarifa escolhida (E2.8): o id "basic" da UI mapeia pro enum "basica" do banco.
        fare_tier: selectedFare === "basic" ? "basica" : selectedFare,
        origin: originFromSrc(new URLSearchParams(location.search).get("src")),
        ...getStoredUtm(),
      });
      navigate(`/checkout/${result.code}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar reserva");
    }
  }

  const parkingPrice = sim.data?.price ?? 0;
  const chosenAddOns = selectedAddOns(addOns, selectedAddOnIds);
  const addOnsSum = addOnsTotal(addOns, selectedAddOnIds);
  const discount = applied?.discount ?? 0;
  const parkingBase = bookingTotal(parkingPrice, discount, addOnsSum);

  const fareOption =
    pricedFares.find((f) => f.id === selectedFare) ?? pricedFares[0] ?? FARE_OPTIONS[1];
  const fareSurcharge = canReserve ? fareOption.surcharge : 0;
  const displayTotal = parkingBase + fareSurcharge;

  const hasFareOrAddOns = canReserve && (fareSurcharge > 0 || chosenAddOns.length > 0 || applied);

  return (
    <TooltipProvider>
      <div className="rounded-2xl border border-hairline bg-canvas p-6 shadow-tier">
        {/* Preço */}
        <div className="space-y-1">
          {sim.data?.old_price != null && sim.data.old_price > (sim.data.price ?? 0) && (
            <div className="flex items-center gap-2">
              <span className="text-body-sm text-muted line-through tabular-nums">
                {formatBRL(sim.data.old_price)}
              </span>
              {sim.data.discount && (
                <span className="rounded-sm bg-badge-confirmed-bg px-2 py-1 text-caption font-bold text-badge-confirmed-fg">
                  {sim.data.discount.label}
                </span>
              )}
            </div>
          )}
          {sim.isLoading || pricingStale ? (
            <Skeleton className="h-9 w-32" />
          ) : sim.data?.price != null ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-display-md text-ink tabular-nums">
                {formatBRL(sim.data.price)}
              </span>
              <span className="text-body-sm text-muted">/ diária</span>
            </div>
          ) : (
            <div className="text-display-sm text-ink">
              A partir de {formatBRL(listing.company_parking_type.base_price)}
            </div>
          )}
          <div className="text-body-sm text-muted">
            {days > 0
              ? `${days} ${days === 1 ? "diária" : "diárias"} · ${formatDuration(from!, to!)}`
              : "Escolha as datas"}
          </div>
          <button
            type="button"
            onClick={() => setPriceTableOpen(true)}
            className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
          >
            Ver preços por duração
          </button>
        </div>

        <PriceTableDialog
          open={priceTableOpen}
          onOpenChange={setPriceTableOpen}
          companySlug={listing.company.slug}
          locationSlug={listing.location.slug}
          parkingTypeCode={listing.parking_type.code}
          selectedDays={days}
          title={listing.parking_type.name}
        />

        <FareComparisonDialog
          open={fareComparisonOpen}
          onOpenChange={setFareComparisonOpen}
          selectedFare={selectedFare}
          onSelect={setSelectedFare}
          priceLabelByTier={Object.fromEntries(pricedFares.map((f) => [f.id, f.tagline]))}
          availableTiers={pricedFares.map((f) => f.id)}
        />

        <div className="my-5 h-px bg-hairline" />

        {/* Datas */}
        <div className="rounded-md border border-hairline">
          <div className="grid grid-cols-2 divide-x divide-hairline">
            <DateRangeField mode="check-in" date={from} onChange={setFrom} />
            <DateRangeField
              mode="check-out"
              date={to}
              onChange={setTo}
              minDate={from ?? undefined}
            />
          </div>
        </div>

        {/* Passageiros */}
        {listing.location.has_passenger_quantity && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <Label htmlFor="pax">Passageiros</Label>
            <Input
              id="pax"
              type="number"
              min={1}
              max={9}
              value={passengers}
              onChange={(e) => setPassengers(Math.max(1, Number(e.target.value || 1)))}
              className="h-10 w-20 text-center tabular-nums"
            />
          </div>
        )}

        {/* PCD */}
        {listing.location.has_pcd_config && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <Label htmlFor="pcd">Vaga acessível PCD</Label>
            <Switch checked={hasPcd} onCheckedChange={setHasPcd} />
          </div>
        )}

        {/* Seletor de tarifa */}
        <div className="mt-5">
          <div className="mb-2 text-body-sm font-semibold text-ink">Escolha sua tarifa</div>
          <div className="divide-y divide-hairline overflow-hidden rounded-md border border-hairline">
            {pricedFares.map((fare) => {
              const isSelected = selectedFare === fare.id;
              return (
                <button
                  key={fare.id}
                  type="button"
                  onClick={() => setSelectedFare(fare.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    isSelected ? "bg-mp-pale/40" : "bg-canvas hover:bg-surface-soft",
                  )}
                >
                  {/* Radio */}
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      isSelected
                        ? "border-mp-primary bg-mp-primary"
                        : "border-muted-soft bg-canvas",
                    )}
                  >
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>

                  {/* Nome */}
                  <span
                    className={cn(
                      "text-body-sm font-semibold",
                      isSelected ? "text-mp-primary" : "text-ink",
                    )}
                  >
                    {fare.label}
                  </span>

                  {/* Info tooltip — controlado para funcionar no toque mobile */}
                  <Tooltip
                    open={openTooltip === fare.id}
                    onOpenChange={(v) => setOpenTooltip(v ? fare.id : null)}
                  >
                    <TooltipTrigger asChild>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenTooltip(openTooltip === fare.id ? null : fare.id);
                        }}
                        className="flex items-center text-muted hover:text-ink"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-48">
                      <ul className="space-y-0.5">
                        {fare.tooltip.map((line) => (
                          <li key={line} className="text-caption">{line}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>

                  <span className="flex-1" />

                  {/* Preço */}
                  <span
                    className={cn(
                      "shrink-0 text-body-sm font-semibold tabular-nums",
                      fare.surcharge === 0
                        ? "text-badge-confirmed-fg"
                        : isSelected
                          ? "text-mp-primary"
                          : "text-ink",
                    )}
                  >
                    {fare.tagline}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setFareComparisonOpen(true)}
            className="mt-2 flex items-center gap-1 text-caption text-mp-indigo hover:underline"
          >
            Ver o que cada tarifa inclui
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {/* Erro do simulate_price */}
        {sim.data?.error && (
          <div className="mt-4 rounded-sm border border-error bg-badge-cancelled-bg p-2 text-caption text-error">
            {sim.data.error}
          </div>
        )}

        {/* Disponibilidade */}
        {availUi.message && (
          <div
            className={
              availUi.tone === "error"
                ? "mt-4 rounded-sm border border-error bg-badge-cancelled-bg p-2 text-caption text-error"
                : "mt-4 rounded-sm border border-hairline bg-badge-pending-bg p-2 text-caption text-badge-pending-fg"
            }
            role="status"
          >
            {availUi.message}
          </div>
        )}

        {/* Serviços adicionais */}
        {addOns.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-caption font-semibold text-muted-steel">Serviços adicionais</div>
            {addOns.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-start justify-between gap-3 rounded-sm border border-hairline p-3"
              >
                <span className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedAddOnIds.includes(a.id)}
                    onChange={() => toggleAddOn(a.id)}
                  />
                  <span>
                    <span className="block text-body-sm text-ink">{a.name}</span>
                    {a.description && (
                      <span className="block text-caption text-muted">{a.description}</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-body-sm text-ink tabular-nums">
                  {formatBRL(a.price)}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Cupom */}
        {canReserve && (
          <div className="mt-4">
            {applied ? (
              <div className="flex items-center justify-between gap-2 rounded-sm border border-badge-confirmed-fg/30 bg-badge-confirmed-bg p-3">
                <span className="text-caption font-medium text-badge-confirmed-fg">
                  {applied.code}: {couponDiscountLabel(applied)}
                </span>
                <button
                  type="button"
                  onClick={clearCoupon}
                  className="inline-flex items-center gap-1 text-caption text-badge-confirmed-fg hover:underline"
                >
                  <X className="h-3 w-3" /> Remover
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Cupom de desconto"
                  className="h-10 flex-1"
                  aria-label="Código do cupom"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyCoupon}
                  disabled={!couponInput.trim() || validateCoupon.isPending}
                >
                  {validateCoupon.isPending ? "…" : "Aplicar"}
                </Button>
              </div>
            )}
            {couponMsg && <p className="mt-1.5 text-caption text-error">{couponMsg}</p>}
          </div>
        )}

        {/* Total */}
        <div className="mt-5 border-t border-hairline pt-4">
          {hasFareOrAddOns && (
            <div className="mb-3 space-y-1.5">
              {parkingPrice > 0 && (
                <div className="flex justify-between">
                  <span className="text-body-sm text-muted">Estacionamento</span>
                  <span className="text-body-sm text-muted tabular-nums">{formatBRL(parkingPrice)}</span>
                </div>
              )}
              {fareSurcharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-body-sm text-muted">Tarifa {fareOption.label}</span>
                  <span className="text-body-sm text-muted tabular-nums">{formatBRL(fareSurcharge)}</span>
                </div>
              )}
              {chosenAddOns.map((a) => (
                <div key={a.id} className="flex justify-between">
                  <span className="text-body-sm text-muted">{a.name}</span>
                  <span className="text-body-sm text-muted tabular-nums">{formatBRL(a.price)}</span>
                </div>
              ))}
              {applied && (
                <div className="flex justify-between">
                  <span className="text-body-sm text-badge-confirmed-fg">Desconto</span>
                  <span className="text-body-sm text-badge-confirmed-fg tabular-nums">−{formatBRL(discount)}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-title-sm text-ink">Total</span>
            <span className="text-display-md text-ink tabular-nums">
              {canReserve
                ? formatBRL(displayTotal)
                : formatBRL(listing.company_parking_type.base_price)}
            </span>
          </div>
        </div>

        {/* CTA */}
        <Button
          className="mt-4 w-full"
          size="default"
          onClick={handleReserve}
          disabled={!canReserve || createBooking.isPending}
        >
          {createBooking.isPending
            ? "Reservando…"
            : !from || !to
              ? "Escolher datas"
              : "Reservar agora"}
        </Button>

        {/* Trust badge */}
        {!avail.data?.sold_out && (
          <div className="mt-4 flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-badge-confirmed-bg px-3 py-1">
              <ShieldCheck className="h-4 w-4 text-badge-confirmed-fg" />
              <span className="text-body-sm font-semibold text-badge-confirmed-fg">
                {fareOption.badgeText}
              </span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
