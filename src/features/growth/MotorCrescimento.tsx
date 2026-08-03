import { Link, useNavigate } from "react-router-dom";
import { RefreshCw, Clock, Trophy, Zap, Rocket, Flag, Car, Gift } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCard } from "@/components/shared/AccountCard";
import { useAuth } from "@/auth/context";
import { useMembership, useWallet, useLastCompletedBooking, useReferrals } from "./api";
import { brlFromCents, brlShort, daysUntil, tierProgress, cashbackPctLabel } from "./growth.logic";

/**
 * Movepark Clube: nível, carteira e a escada, em blocos (design "Minha Conta
 * Cliente"). Antes a página era uma coluna de seções soltas; agora o que o cliente
 * pergunta primeiro ("quanto eu recebo" e "quanto eu tenho") fica lado a lado no
 * topo. O programa de indicação completo mora em `/account/indicar`.
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
  const referrals = useReferrals(enabled);

  if (!enabled) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-hairline bg-canvas p-10 text-center">
        {/* Ilustração de gente (Direção B): momento de "entrar e se conectar", mais
            caloroso que um cadeado. Ver docs/design-system/illustrations.md §10.1. */}
        <img src="/illustrations/il-people-reserva-app.webp" alt="" className="h-40 w-auto" />
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
    );
  }

  function repetirReserva() {
    const url = lastBooking.data?.listingUrl;
    navigate(url || "/search");
  }

  const m = membership.data;
  const cashbackPct = m ? cashbackPctLabel(m.cashback_bps) : "-";
  const next = m?.next_tier ?? null;
  const progress = m ? tierProgress(m.window_bookings, next?.min_bookings ?? null) : 0;
  // O percentual do próximo nível vem do catálogo do produto, casado pelo código.
  const nextCashback = LADDER.find((t) => t.code === next?.code)?.cashback ?? null;
  const premio = referrals.data ? brlShort(referrals.data.reward_amount) : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-display-xl text-ink">Movepark Clube</h1>
        <p className="mt-2 text-body-md text-muted">
          Você recebe dinheiro de volta em cada reserva concluída.
        </p>
      </header>

      {/* Bloco 1: o nível e a carteira lado a lado. São as duas perguntas que o
          cliente abre a página pra responder. */}
      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="bg-brand-mesh flex flex-col rounded-lg p-6 text-white desktop:p-7">
          {membership.isLoading || !m ? (
            <Skeleton className="h-48 w-full rounded-md bg-white/10" />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-badge uppercase text-white">
                  <Rocket className="h-3.5 w-3.5" aria-hidden />
                  {m.tier_name}
                </span>
                <div className="text-right">
                  <p className="text-badge uppercase tracking-[0.4px] text-white/60">Você recebe</p>
                  <p className="text-display-2xl leading-none text-white">{cashbackPct}</p>
                  <p className="text-caption-sm text-white/60">de volta</p>
                </div>
              </div>

              <p className="mt-auto pt-8 text-display-md leading-tight text-white">
                Você sobe de nível a cada reserva, e o percentual cresce com você.
              </p>

              {next && (
                <>
                  <div
                    className="mt-5 h-2 overflow-hidden rounded-full bg-white/20"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progresso para o nível ${next.name}`}
                  >
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-slow motion-reduce:transition-none"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-3 text-body-sm text-white/80">
                    Faltam{" "}
                    <span className="font-semibold text-white">
                      {next.bookings_needed} reserva{next.bookings_needed === 1 ? "" : "s"}
                    </span>{" "}
                    para o {next.name}
                    {nextCashback ? `, com ${nextCashback} de volta` : ""}.
                  </p>
                </>
              )}
              {!next && (
                <p className="mt-5 text-body-sm text-white/80">Você chegou ao topo do Clube.</p>
              )}
            </>
          )}
        </section>

        <AccountCard title="Dinheiro de volta">
          {wallet.isLoading || !wallet.data ? (
            <Skeleton className="h-12 w-40 rounded-md" />
          ) : (
            <>
              <p className="text-display-2xl leading-none tabular-nums text-ink">
                {brlFromCents(wallet.data.balance_cents)}
              </p>
              {wallet.data.expiring_cents > 0 && wallet.data.expiring_at && (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-mp-pale px-3 py-1.5 text-caption-sm text-mp-indigo">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {brlFromCents(wallet.data.expiring_cents)} expiram em{" "}
                  {daysUntil(wallet.data.expiring_at)} dias
                </span>
              )}
              {wallet.data.balance_cents === 0 && (
                <img
                  src="/illustrations/il-clube-cashback.webp"
                  alt=""
                  className="mt-4 h-24 w-auto"
                />
              )}
            </>
          )}
          <p className="mt-5 text-body-sm leading-relaxed text-muted">
            Crédito em reais que cai na sua conta a cada reserva concluída. Sem pontos, sem
            conversão: usa direto no checkout.
          </p>
        </AccountCard>
      </div>

      {/* Bloco 2: a escada, com o nível atual marcado. */}
      <AccountCard title="Seu caminho no Clube">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-4">
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
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-sm",
                      atual ? "bg-mp-primary text-white" : "bg-surface-soft text-muted",
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
      </AccountCard>

      {/* Bloco 3: as duas ações que fazem o cliente voltar. */}
      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-2">
        <AccountCard title="Repetir reserva" className="flex flex-col">
          {lastBooking.isLoading ? (
            <Skeleton className="h-12 w-full rounded-md" />
          ) : lastBooking.data ? (
            <div className="flex flex-1 items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mp-pale">
                <Car className="h-5 w-5 text-mp-indigo" aria-hidden />
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
            <p className="flex-1 text-body-sm text-muted">
              Você ainda não tem uma reserva concluída para repetir.
            </p>
          )}
          <Button variant="primary" className="mt-5 w-full" onClick={repetirReserva}>
            <RefreshCw className="h-4 w-4" />
            {lastBooking.data ? "Repetir última reserva" : "Buscar estacionamento"}
          </Button>
        </AccountCard>

        <AccountCard
          title={premio ? `Indique e ganhe ${premio}` : "Indique e ganhe"}
          className="flex flex-col"
        >
          <div className="flex flex-1 items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mp-pale">
              <Gift className="h-5 w-5 text-mp-indigo" aria-hidden />
            </span>
            <p className="text-body-sm leading-relaxed text-muted">
              {premio
                ? `Cada amigo que fizer a 1ª reserva te dá ${premio} de volta, e ainda conta pra você subir de nível.`
                : "Cada amigo que fizer a 1ª reserva vira crédito na sua conta, e ainda conta pra você subir de nível."}
            </p>
          </div>
          <Button asChild variant="secondary" className="mt-5 w-full">
            <Link to="/account/indicar">Ver meu link</Link>
          </Button>
        </AccountCard>
      </div>
    </div>
  );
}
