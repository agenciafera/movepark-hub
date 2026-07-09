import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Sparkles,
  Gift,
  RefreshCw,
  Clock,
  ArrowRight,
  Trophy,
  Zap,
  Rocket,
  Flag,
  Share2,
  Copy,
  Check,
  Car,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/auth/context";
import {
  useMembership,
  useWallet,
  useReferrals,
  useLastCompletedBooking,
} from "./api";
import {
  brlFromCents,
  daysUntil,
  tierProgress,
  cashbackPctLabel,
  firstNameOf,
} from "./growth.logic";

/**
 * Motor de Crescimento — Clube (níveis), MoveCoins (dinheiro de volta) e
 * Indique e Ganhe, ligados aos dados reais do cliente logado. Ver `./api.ts`.
 */

type LadderTier = {
  code: string;
  nome: string;
  criterio: string;
  cashback: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Catálogo fixo dos 4 níveis (espelha membership_tier). O nível ATUAL e o
// progresso vêm do banco; a escada em si é o catálogo do produto.
const LADDER: LadderTier[] = [
  { code: "ignicao", nome: "Ignição", criterio: "no cadastro", cashback: "2%", icon: Zap },
  { code: "turbo", nome: "Turbo", criterio: "2 reservas", cashback: "3%", icon: Rocket },
  { code: "nitro", nome: "Nitro", criterio: "6 reservas / 12m", cashback: "5%", icon: Trophy },
  { code: "podio", nome: "Pódio", criterio: "por convite", cashback: "máx.", icon: Flag },
];

export function MotorCrescimento() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const enabled = !!session?.userId;

  const membership = useMembership(enabled);
  const wallet = useWallet(enabled);
  const referrals = useReferrals(enabled);
  const lastBooking = useLastCompletedBooking(session?.userId);

  const [copiado, setCopiado] = React.useState(false);
  const firstName = firstNameOf(session?.fullName);

  // ── Não logado: motor exige identidade real ──────────────────────────────
  if (!enabled) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Movepark Clube" title="Seu motor de crescimento" />
        <div className="flex flex-col items-center gap-4 rounded-lg border border-hairline bg-canvas p-10 text-center shadow-tier">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-soft">
            <Lock className="h-5 w-5 text-mp-indigo" />
          </span>
          <div className="space-y-1">
            <h2 className="text-title-md text-ink">Entre para ver seu Clube</h2>
            <p className="max-w-sm text-body-sm text-muted">
              Seu nível, seu dinheiro de volta e seu link de indicação ficam na sua conta.
            </p>
          </div>
          <Link to="/login?next=/account/clube">
            <Button variant="primary">Entrar</Button>
          </Link>
        </div>
      </div>
    );
  }

  const link = referrals.data?.link.replace(/^https?:\/\//, "") ?? "";
  const referralCount =
    (referrals.data?.counts.pending ?? 0) +
    (referrals.data?.counts.qualified ?? 0) +
    (referrals.data?.counts.rewarded ?? 0);

  function copiar() {
    if (!referrals.data) return;
    void navigator.clipboard?.writeText(referrals.data.link);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
    toast.success("Link de indicação copiado.", { position: "top-center" });
  }

  function compartilharWhatsapp() {
    if (!referrals.data) return;
    const msg =
      `Ganhei um presente pra você no Movepark: R$ 25 de desconto na sua 1ª reserva. ` +
      `É só usar meu link: ${referrals.data.link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  function repetirReserva() {
    const url = lastBooking.data?.listingUrl;
    if (url) {
      navigate(url);
    } else {
      navigate("/search");
    }
  }

  const m = membership.data;
  const cashbackPct = m ? cashbackPctLabel(m.cashback_bps) : "—";
  const next = m?.next_tier ?? null;
  const progress = m ? tierProgress(m.window_bookings, next?.min_bookings ?? null) : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Movepark Clube"
        title={`Olá, ${firstName}`}
        description="Cada reserva concluída te dá mais dinheiro de volta e te aproxima do próximo nível."
      />

      {/* Engrenagem 1 — nível (hero navy) */}
      <section className="overflow-hidden rounded-lg bg-mp-navy text-white shadow-tier">
        {membership.isLoading || !m ? (
          <div className="p-6 tablet:p-8">
            <Skeleton className="h-24 w-full rounded-md bg-white/10" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-6 tablet:flex-row tablet:items-center tablet:justify-between tablet:p-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-mp-violet px-3 py-1 text-badge uppercase text-white">
                  <Rocket className="h-3.5 w-3.5" />
                  {m.tier_name}
                </span>
                <span className="text-body-sm text-white/70">
                  {next ? (
                    <>
                      Faltam {next.bookings_needed} reserva{next.bookings_needed === 1 ? "" : "s"} para
                      o <span className="text-white">{next.name}</span>
                    </>
                  ) : (
                    "Você chegou ao topo do Clube"
                  )}
                </span>
              </div>

              <div className="max-w-md space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-mp-teal transition-all duration-slow"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-caption-sm text-white/60">
                  {m.window_bookings} reserva{m.window_bookings === 1 ? "" : "s"} nos últimos 12 meses
                  {m.perks?.length ? ` · ${m.perks[0]}` : ""}
                </p>
              </div>
            </div>

            <div className="shrink-0 rounded-md bg-white/10 px-5 py-4 text-center backdrop-blur">
              <p className="text-caption-sm uppercase tracking-wide text-white/60">Você recebe</p>
              <p className="text-display-2xl leading-none text-white">{cashbackPct}</p>
              <p className="text-caption-sm text-white/70">de volta em cada reserva</p>
            </div>
          </div>
        )}
      </section>

      {/* Engrenagem 2 + recompra */}
      <section className="grid gap-4 tablet:grid-cols-2">
        {/* MoveCoins */}
        <div className="flex flex-col justify-between rounded-md border border-hairline bg-canvas p-6 shadow-tier">
          <div>
            <div className="mb-4 flex items-center gap-2 text-muted-steel">
              <Sparkles className="h-4 w-4 text-mp-violet" />
              <span className="text-micro-label uppercase tracking-wide">Dinheiro de volta</span>
            </div>
            {wallet.isLoading || !wallet.data ? (
              <Skeleton className="h-10 w-40 rounded-md" />
            ) : (
              <>
                <p className="text-display-2xl leading-none text-ink">
                  {brlFromCents(wallet.data.balance_cents)}
                </p>
                {wallet.data.expiring_cents > 0 && wallet.data.expiring_at && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-mp-pale px-3 py-1 text-caption-sm text-mp-indigo">
                    <Clock className="h-3.5 w-3.5" />
                    {brlFromCents(wallet.data.expiring_cents)} expiram em{" "}
                    {daysUntil(wallet.data.expiring_at)} dias
                  </div>
                )}
              </>
            )}
          </div>
          <p className="mt-5 text-body-sm text-muted">
            Crédito em reais que cai na sua conta a cada reserva concluída — sem pontos, sem conversão.
          </p>
        </div>

        {/* Recompra em 1 toque */}
        <div className="flex flex-col justify-between rounded-md border border-hairline bg-canvas p-6 shadow-tier">
          <div>
            <div className="mb-4 flex items-center gap-2 text-muted-steel">
              <RefreshCw className="h-4 w-4 text-mp-violet" />
              <span className="text-micro-label uppercase tracking-wide">Repetir reserva</span>
            </div>
            {lastBooking.isLoading ? (
              <Skeleton className="h-12 w-full rounded-md" />
            ) : lastBooking.data ? (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-soft">
                  <Car className="h-5 w-5 text-mp-indigo" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-title-sm text-ink">
                    {lastBooking.data.locationName || lastBooking.data.companyName}
                  </p>
                  <p className="truncate text-body-sm text-muted">
                    {[lastBooking.data.parkingTypeName, lastBooking.data.vehicleLabel]
                      .filter(Boolean)
                      .join(" · ") || "Sua última reserva concluída"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-body-sm text-muted">
                Você ainda não tem uma reserva concluída para repetir.
              </p>
            )}
          </div>
          <Button variant="primary" className="mt-5 w-full" onClick={repetirReserva}>
            <RefreshCw className="h-4 w-4" />
            {lastBooking.data ? "Repetir última reserva" : "Buscar estacionamento"}
          </Button>
        </div>
      </section>

      {/* Engrenagem 1 — escada de níveis */}
      <section className="space-y-3">
        <h2 className="text-display-sm text-ink">Seu caminho no Clube</h2>
        <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
          {LADDER.map((nivel) => {
            const atual = nivel.code === m?.tier_code;
            return (
              <div
                key={nivel.code}
                className={cn(
                  "rounded-md border p-4 transition-shadow",
                  atual
                    ? "border-mp-primary bg-surface-pale shadow-tier"
                    : "border-hairline bg-canvas",
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-sm",
                      atual ? "bg-mp-primary text-white" : "bg-surface-soft text-muted-steel",
                    )}
                  >
                    <nivel.icon className="h-4 w-4" />
                  </span>
                  {atual && (
                    <span className="text-badge uppercase text-mp-primary">Você está aqui</span>
                  )}
                </div>
                <p className="text-title-md text-ink">{nivel.nome}</p>
                <p className="text-caption-sm text-muted">{nivel.criterio}</p>
                <p className="mt-2 text-title-sm text-mp-indigo">{nivel.cashback} de volta</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Engrenagem 3 — Indique e Ganhe */}
      <section className="overflow-hidden rounded-lg border border-hairline bg-surface-pale shadow-tier">
        <div className="grid gap-6 p-6 tablet:grid-cols-[1.4fr_1fr] tablet:p-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-mp-indigo">
              <Gift className="h-5 w-5" />
              <span className="text-micro-label uppercase tracking-wide">Indique e ganhe</span>
            </div>
            <h2 className="text-display-lg text-ink">Dê R$ 25, ganhe R$ 25</h2>
            <p className="max-w-md text-body-sm text-muted">
              Mande seu link para quem dirige. Quando a 1ª reserva do amigo for concluída, vocês dois
              recebem — e a indicação ainda conta para você subir de nível.
              {referralCount > 0 && (
                <>
                  {" "}
                  <span className="text-ink">
                    Você já indicou {referralCount} pessoa{referralCount === 1 ? "" : "s"}.
                  </span>
                </>
              )}
            </p>

            {referrals.isLoading || !referrals.data ? (
              <Skeleton className="h-10 w-full rounded-sm" />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex flex-1 items-center gap-2 rounded-sm border border-hairline bg-canvas px-3 py-2.5">
                  <span className="truncate text-body-sm text-body">{link}</span>
                </div>
                <Button variant="outline" onClick={copiar} className="shrink-0">
                  {copiado ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
                <Button variant="primary" className="shrink-0" onClick={compartilharWhatsapp}>
                  <Share2 className="h-4 w-4" />
                  WhatsApp
                </Button>
              </div>
            )}
          </div>

          {/* Card "presente" (lado de quem é indicado) */}
          <div className="flex flex-col justify-center rounded-md bg-mp-navy p-6 text-white">
            <p className="text-caption-sm text-white/60">Presente do {firstName}</p>
            <p className="mt-1 text-display-md text-white">R$ 25 de desconto</p>
            <p className="text-body-sm text-white/70">na sua 1ª reserva</p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-caption-sm text-white/60">
              <ArrowRight className="h-4 w-4" />
              Vaga garantida, preço travado
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
