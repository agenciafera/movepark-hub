import { Link, useNavigate } from "react-router-dom";
import { RefreshCw, Clock, Trophy, Zap, Rocket, Flag, Car } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/auth/context";
import { useMembership, useWallet, useLastCompletedBooking } from "./api";
import { brlFromCents, daysUntil, tierProgress, cashbackPctLabel } from "./growth.logic";

/**
 * Motor de Crescimento: Clube (níveis), carteira (dinheiro de volta) e a chamada
 * pro Indique e Ganhe, ligados aos dados reais do cliente logado. O programa de
 * indicação completo mora na página dedicada (`/account/indicar`); aqui fica só a
 * chamada, pra não duplicar link/compartilhamento. Ver `./api.ts`.
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
  const lastBooking = useLastCompletedBooking(session?.userId);

  // Não logado: motor exige identidade real.
  if (!enabled) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Movepark Clube" title="Seu motor de crescimento" />
        <div className="flex flex-col items-center gap-4 rounded-lg border border-hairline bg-canvas p-10 text-center">
          {/* Ilustração de gente (Direção B): momento de "entrar e se conectar", mais
              caloroso que um cadeado. Ver docs/design-system/illustrations.md §10.1. */}
          <img
            src="/illustrations/il-people-reserva-app.webp"
            alt=""
            className="h-40 w-auto"
          />
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

  function repetirReserva() {
    const url = lastBooking.data?.listingUrl;
    if (url) {
      navigate(url);
    } else {
      navigate("/search");
    }
  }

  const m = membership.data;
  const cashbackPct = m ? cashbackPctLabel(m.cashback_bps) : "-";
  const next = m?.next_tier ?? null;
  const progress = m ? tierProgress(m.window_bookings, next?.min_bookings ?? null) : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Movepark Clube"
        title="Seu motor de crescimento"
        description="Cada reserva concluída te dá mais dinheiro de volta e te aproxima do próximo nível."
      />

      {/* Nível (hero navy) */}
      <section className="overflow-hidden rounded-lg bg-mp-navy text-white">
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

      {/* Carteira + recompra */}
      <section className="grid gap-4 tablet:grid-cols-2">
        {/* Carteira Movepark */}
        <div className="flex flex-col justify-between rounded-md border border-hairline bg-canvas p-6">
          <div>
            <div className="mb-4 text-muted-steel">
              <span className="text-micro-label uppercase tracking-wide">Dinheiro de volta</span>
            </div>
            {wallet.isLoading || !wallet.data ? (
              <Skeleton className="h-10 w-40 rounded-md" />
            ) : wallet.data.balance_cents === 0 ? (
              // Carteira zerada: a ilustração de "dinheiro de volta" aquece o R$ 0,00,
              // que sozinho fica sem graça pra quem ainda não completou uma reserva.
              <>
                <img
                  src="/illustrations/il-clube-cashback.webp"
                  alt=""
                  className="mb-3 h-24 w-auto"
                />
                <p className="text-display-2xl leading-none text-ink">
                  {brlFromCents(0)}
                </p>
              </>
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
            Crédito em reais que cai na sua conta a cada reserva concluída. Sem pontos, sem conversão.
          </p>
        </div>

        {/* Recompra em 1 toque */}
        <div className="flex flex-col justify-between rounded-md border border-hairline bg-canvas p-6">
          <div>
            <div className="mb-4 text-muted-steel">
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

      {/* Escada de níveis */}
      <section className="space-y-3">
        <h2 className="text-display-sm text-ink">Seu caminho no Clube</h2>
        <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
          {LADDER.map((nivel) => {
            const atual = nivel.code === m?.tier_code;
            return (
              <div
                key={nivel.code}
                className={cn(
                  "rounded-md border p-4",
                  atual ? "border-mp-primary bg-surface-pale" : "border-hairline bg-canvas",
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

      {/* Indique e ganhe: só a chamada. O programa completo (link, compartilhar, FAQ)
          mora em /account/indicar, pra não duplicar. */}
      <section className="rounded-lg border border-hairline bg-surface-pale p-6 tablet:p-8">
        <div className="flex flex-col items-start gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
          <div className="space-y-1">
            <h2 className="text-display-sm text-ink">Indique e ganhe R$ 25</h2>
            <p className="max-w-md text-body-sm text-muted">
              Cada amigo que fizer a 1ª reserva te dá R$ 25 de volta, e ainda conta pra você subir de
              nível.
            </p>
          </div>
          <Button asChild variant="primary" className="shrink-0">
            <Link to="/account/indicar">Indique e ganhe</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
