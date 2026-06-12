import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DateRangeField } from "@/features/search/DateRangeField";
import { useAuth } from "@/auth/context";
import { formatBRL, formatDuration } from "@/lib/format";
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
import { GuaranteeBadge } from "@/features/guarantee/GuaranteeBadge";
import { couponDiscountLabel, couponErrorMessage, type CouponPreview } from "./coupon.logic";
import { addOnsTotal, bookingTotal, selectedAddOns } from "./reservation.logic";

type Props = {
  listing: ListingDetail;
  initialFrom: Date | null;
  initialTo: Date | null;
};

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

  const [from, setFrom] = React.useState<Date | null>(initialFrom);
  const [to, setTo] = React.useState<Date | null>(initialTo);
  const [passengers, setPassengers] = React.useState<number>(1);
  const [hasPcd, setHasPcd] = React.useState<boolean>(false);

  const validateCoupon = useValidateCoupon();
  const [couponInput, setCouponInput] = React.useState<string>("");
  const [applied, setApplied] = React.useState<CouponPreview | null>(null);
  const [couponMsg, setCouponMsg] = React.useState<string | null>(null);

  const addOnsQuery = useLocationAddOns(listing.location.id);
  const addOns = addOnsQuery.data ?? [];
  const [selectedAddOnIds, setSelectedAddOnIds] = React.useState<string[]>([]);

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

  // Recalcula stale flag — pricing está sendo recarregado pra novos valores
  const pricingStale = sim.isFetching && (from !== debouncedFrom || to !== debouncedTo);

  const canReserve =
    !!from && !!to && days > 0 && sim.data?.price != null && !sim.isFetching && availUi.canReserve;

  // Cupom depende de datas/preço: ao mudar o período, invalida o cupom aplicado.
  React.useEffect(() => {
    setApplied(null);
    setCouponMsg(null);
  }, [from, to]);

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code || !from || !to) return;
    if (!session) {
      toast.error("Entre para aplicar um cupom.");
      return;
    }
    setCouponMsg(null);
    try {
      const preview = await validateCoupon.mutateAsync({
        code,
        location_parking_type_id: listing.id,
        check_in_at: from.toISOString(),
        check_out_at: to.toISOString(),
      });
      if (preview.valid) {
        setApplied(preview);
      } else {
        setApplied(null);
        setCouponMsg(couponErrorMessage(preview.error_code));
      }
    } catch (err) {
      setApplied(null);
      setCouponMsg(err instanceof Error ? err.message : "Não foi possível validar o cupom");
    }
  }

  function clearCoupon() {
    setApplied(null);
    setCouponInput("");
    setCouponMsg(null);
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
        origin: "listing",
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
  const total = bookingTotal(parkingPrice, discount, addOnsSum);
  const showBreakdown = sim.data?.price != null && (applied != null || chosenAddOns.length > 0);

  return (
    <div className="rounded-md border border-hairline bg-canvas p-6 shadow-tier">
      {/* Preço */}
      <div className="space-y-1">
        {sim.data?.old_price != null && sim.data.old_price > (sim.data.price ?? 0) && (
          <div className="flex items-center gap-2">
            <span className="text-body-sm text-muted line-through tabular-nums">
              {formatBRL(sim.data.old_price)}
            </span>
            {sim.data.discount && (
              <span className="rounded-sm bg-badge-confirmed-bg px-1.5 py-0.5 text-caption font-bold text-badge-confirmed-fg">
                {sim.data.discount.label}
              </span>
            )}
          </div>
        )}
        {sim.isLoading || pricingStale ? (
          <Skeleton className="h-9 w-32" />
        ) : sim.data?.price != null ? (
          <div className="text-display-md text-ink tabular-nums">
            {formatBRL(sim.data.price)}
          </div>
        ) : (
          <div className="text-display-sm text-ink">
            A partir de {formatBRL(listing.company_parking_type.base_price)}
          </div>
        )}
        <div className="text-body-sm text-muted">
          {days > 0 ? `${days} ${days === 1 ? "diária" : "diárias"}` : "Escolha as datas"}
          {from && to ? ` · ${formatDuration(from, to)}` : ""}
        </div>
      </div>

      <div className="my-4 h-px bg-hairline" />

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

      {/* Erro do simulate_price */}
      {sim.data?.error && (
        <div className="mt-4 rounded-sm border border-error bg-badge-cancelled-bg p-2 text-caption text-error">
          {sim.data.error}
        </div>
      )}

      {/* Disponibilidade / regras de reserva (esgotado, estadia mínima, antecedência, quase-lotação) */}
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
          <div className="text-caption font-bold uppercase tracking-[0.4px] text-muted-steel">
            Serviços adicionais
          </div>
          {addOns.map((a) => (
            <label
              key={a.id}
              className="flex cursor-pointer items-start justify-between gap-3 rounded-sm border border-hairline p-2.5"
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

      {/* Cupom de desconto */}
      {canReserve && (
        <div className="mt-4">
          {applied ? (
            <div className="flex items-center justify-between gap-2 rounded-sm border border-badge-confirmed-fg/30 bg-badge-confirmed-bg p-2.5">
              <span className="text-caption font-medium text-badge-confirmed-fg">
                {applied.code} — {couponDiscountLabel(applied)}
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
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="Tem um cupom?"
                className="h-10 flex-1 uppercase"
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

      {/* Breakdown: estacionamento + add-ons + desconto */}
      {showBreakdown && (
        <div className="mt-4 space-y-1.5 border-t border-hairline pt-4">
          <div className="flex justify-between text-body-sm text-muted">
            <span>Estacionamento</span>
            <span className="tabular-nums">{formatBRL(parkingPrice)}</span>
          </div>
          {chosenAddOns.map((a) => (
            <div key={a.id} className="flex justify-between text-body-sm text-muted">
              <span>{a.name}</span>
              <span className="tabular-nums">{formatBRL(a.price)}</span>
            </div>
          ))}
          {applied && (
            <div className="flex justify-between text-body-sm text-badge-confirmed-fg">
              <span>Desconto ({applied.code})</span>
              <span className="tabular-nums">−{formatBRL(discount)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-title-sm text-ink">Total</span>
            <span className="text-title-md text-ink tabular-nums">{formatBRL(total)}</span>
          </div>
        </div>
      )}

      {/* Botão Reservar */}
      <Button
        className="mt-5 w-full"
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

      {!avail.data?.sold_out && (
        <div className="mt-3 flex justify-center">
          <GuaranteeBadge />
        </div>
      )}

      <p className="mt-3 flex items-center justify-center gap-1.5 text-caption text-muted">
        <ShieldCheck className="h-3.5 w-3.5" />
        Cancelamento grátis até 24h antes
      </p>
    </div>
  );
}
