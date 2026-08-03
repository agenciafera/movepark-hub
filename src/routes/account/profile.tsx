import * as React from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { BadgeCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/auth/context";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { useMyBookings } from "@/features/bookings/customerApi";
import { useMyVehicles } from "@/features/vehicles/api";
import { useMyPaymentMethods } from "@/features/payment-methods/api";
import { useMembership, useWallet } from "@/features/growth/api";
import { cashbackPctLabel, tierProgress } from "@/features/growth/growth.logic";
import {
  accountSubline,
  daysUntil,
  profileCompletion,
} from "@/features/account/profileCompletion.logic";
import { nightsOf } from "@/features/account/accountSummary.logic";
import { documentMask, onlyDigits } from "@/lib/masks";
import { isValidCnpj, isValidCpf } from "@/lib/documents";
import { formatBRL, formatDayTimeInline } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Card branco da área. O fundo da página virou painel, então o card leva a borda. */
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-hairline bg-canvas p-5 desktop:p-7", className)}>
      {children}
    </section>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-title-md text-ink">{children}</h2>;
}

export default function ProfilePage() {
  const { session } = useAuth();
  const profileId = session?.userId;
  const profileQ = useProfile(profileId);
  const update = useUpdateProfile();

  const upcoming = useMyBookings(profileId, "upcoming");
  const vehicles = useMyVehicles(profileId);
  const cards = useMyPaymentMethods(profileId);
  const membership = useMembership(!!profileId);
  const wallet = useWallet(!!profileId);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [birthDate, setBirthDate] = React.useState<string>("");
  const [language, setLanguage] = React.useState<string>("pt-BR");
  const [dirty, setDirty] = React.useState(false);

  /** Devolve os campos ao que está gravado. Serve pro sync inicial e pro Descartar. */
  const resetForm = React.useCallback(() => {
    const p = profileQ.data;
    if (!p) return;
    setFirstName(p.first_name ?? "");
    setLastName(p.last_name ?? "");
    setTaxId(documentMask(p.tax_id ?? ""));
    setBirthDate(p.birth_date ?? "");
    setLanguage(p.preferences.language ?? "pt-BR");
    setDirty(false);
  }, [profileQ.data]);

  React.useEffect(() => resetForm(), [resetForm]);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  async function handleSave() {
    if (!session) return;
    const taxDigits = onlyDigits(taxId);
    if (taxDigits && !isValidCpf(taxId) && !isValidCnpj(taxId)) {
      toast.error("CPF ou CNPJ inválido");
      return;
    }
    try {
      const nextPrefs = {
        ...(profileQ.data?.preferences ?? {}),
        language: language as "pt-BR" | "pt-PT" | "en",
      };
      await update.mutateAsync({
        id: session.userId,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        tax_id: taxDigits || null,
        birth_date: birthDate || null,
        preferences: nextPrefs,
      });
      toast.success("Perfil atualizado");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  // A próxima reserva é a de check-in mais próximo. `useMyBookings` ordena
  // decrescente, então dentro do balde "upcoming" a primeira a acontecer é a última.
  const nextBooking = upcoming.data?.length ? upcoming.data[upcoming.data.length - 1] : null;
  const trip = nextBooking ? daysUntil(nextBooking.check_in_at) : null;

  // O medidor lê a conta como ela é. E-mail e telefone vêm do JWT (ADR-006:
  // identidade verificada mora no auth.users, não numa cópia editável no profiles).
  const completion = profileCompletion({
    emailVerified: !!session?.email,
    phoneVerified: !!session?.phone,
    hasTaxId: !!profileQ.data?.tax_id,
    hasPaymentMethod: (cards.data?.length ?? 0) > 0,
    hasVehicle: (vehicles.data?.length ?? 0) > 0,
  });
  const subline = accountSubline(trip, completion);

  if (profileQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const greetName = firstName || session?.firstName || "";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-display-sm text-ink">
          {greetName ? `Olá, ${greetName}` : "Minha conta"}
        </h1>
        {subline && <p className="mt-1 text-body-sm text-muted">{subline}</p>}
      </header>

      {/* Linha 1: o que já está contratado (viagem, clube) e o que ainda falta. */}
      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-3">
        <NextTripCard booking={nextBooking} days={trip?.days ?? null} today={!!trip?.today} />
        <ClubCard
          tierName={membership.data?.tier_name ?? null}
          cashbackBps={membership.data?.cashback_bps ?? null}
          windowBookings={membership.data?.window_bookings ?? 0}
          nextMinBookings={membership.data?.next_tier?.min_bookings ?? null}
          bookingsNeeded={membership.data?.next_tier?.bookings_needed ?? null}
          nextTierName={membership.data?.next_tier?.name ?? null}
          balanceCents={wallet.data?.balance_cents ?? null}
        />
        <CompletionCard completion={completion} />
      </div>

      {/* Linha 2: o formulário, com o contato ao lado porque ele é só leitura. */}
      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardTitle>Informações pessoais</CardTitle>
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="first-name">Nome</Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => markDirty(setFirstName)(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="last-name">Sobrenome</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => markDirty(setLastName)(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpf">CPF ou CNPJ</Label>
              <Input
                id="cpf"
                value={taxId}
                disabled={!!profileQ.data?.tax_id}
                placeholder="CPF ou CNPJ"
                inputMode="numeric"
                maxLength={18}
                onChange={(e) => markDirty(setTaxId)(documentMask(e.target.value))}
              />
              {profileQ.data?.tax_id && (
                <span className="text-caption-sm text-muted">
                  Pra alterar o documento, fale com o suporte.
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birth">Data de nascimento</Label>
              <Input
                id="birth"
                type="date"
                value={birthDate}
                onChange={(e) => markDirty(setBirthDate)(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 tablet:col-span-2">
              <Label htmlFor="profile-lang">Idioma preferido</Label>
              <Select value={language} onValueChange={markDirty(setLanguage)}>
                <SelectTrigger id="profile-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                  <SelectItem value="pt-PT">Português (Portugal)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-caption-sm text-muted">
                Tradução completa entra em uma fase futura. Por enquanto só PT-BR.
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {dirty && (
              <span className="mr-auto text-caption-sm text-muted">
                Você mudou algo e ainda não salvou.
              </span>
            )}
            <Button variant="outline" onClick={resetForm} disabled={!dirty || update.isPending}>
              Descartar
            </Button>
            <Button onClick={handleSave} disabled={!dirty || update.isPending}>
              {update.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Contato e acesso</CardTitle>
          <dl className="space-y-4">
            <ContactRow label="E-mail" value={session?.email ?? null} />
            <ContactRow label="Telefone" value={session?.phone ?? null} />
          </dl>
          <p className="mt-4 text-caption-sm leading-relaxed text-muted">
            Você entra sem senha, com um código enviado no e-mail ou no WhatsApp.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link to="/account/security">Gerenciar meus logins</Link>
          </Button>
        </Card>
      </div>

    </div>
  );
}

/**
 * Linha de contato. O selo diz "verificado" porque o valor vem do JWT, e o que está
 * no JWT já passou por OTP (ADR-006): o `profiles` nem guarda esses campos.
 */
function ContactRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="break-all text-body-sm text-ink">{value ?? "Não adicionado"}</span>
        {value ? (
          <span className="inline-flex items-center gap-1 text-caption-sm font-medium text-success">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            verificado
          </span>
        ) : (
          <Link to="/account/security" className="text-caption-sm font-semibold text-mp-primary">
            Adicionar
          </Link>
        )}
      </dd>
    </div>
  );
}

/**
 * A viagem que vem. O conteúdo desce pro rodapé do card e o eyebrow vira pílula:
 * o mesh tem o brilho no canto inferior, e texto colado no topo brigava com ele.
 */
function NextTripCard({
  booking,
  days,
  today,
}: {
  booking: {
    code: string;
    check_in_at: string;
    check_out_at: string;
    location: {
      name: string;
      company: { name: string };
      destination?: { city: string; short_name: string | null } | null;
    };
  } | null;
  days: number | null;
  today: boolean;
}) {
  if (!booking) {
    return (
      <Card className="flex flex-col">
        <CardTitle>Próxima reserva</CardTitle>
        <p className="flex-1 text-body-sm text-muted">Você não tem nenhuma reserva a caminho.</p>
        <Button asChild size="sm" className="mt-4 self-start">
          <Link to="/search">Reservar uma vaga</Link>
        </Button>
      </Card>
    );
  }

  const dest = booking.location.destination;
  const lugar = dest?.short_name || dest?.city || booking.location.name;
  const noites = nightsOf(booking);
  const quando = today ? "hoje" : days === 1 ? "amanhã" : null;

  return (
    <section className="bg-brand-mesh flex min-h-[280px] flex-col rounded-lg p-5 text-white desktop:p-7">
      <span className="inline-flex self-start rounded-full bg-white/15 px-3 py-1.5 text-caption font-semibold text-white">
        Próxima reserva
      </span>

      <div className="mt-auto pt-8">
        <h2 className="text-display-md leading-tight text-white">
          {booking.location.company.name} · {lugar}
        </h2>
        <p className="mt-2 text-body-sm text-white/70">
          {[
            `Check-in ${formatDayTimeInline(booking.check_in_at)}`,
            `${noites} ${noites === 1 ? "diária" : "diárias"}`,
            booking.code,
          ].join(" · ")}
          {quando ? ` · ${quando}` : ""}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to={`/account/reservas/${booking.code}`}
            className="inline-flex h-11 items-center rounded-full bg-white px-5 text-body-sm font-semibold text-mp-navy no-underline transition-colors hover:bg-white/90"
          >
            Ver voucher
          </Link>
          <Link
            to={`/account/reservas/${booking.code}`}
            className="inline-flex h-11 items-center rounded-full bg-white/15 px-5 text-body-sm font-semibold text-white no-underline transition-colors hover:bg-white/25"
          >
            Alterar
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * O Clube lidera pelo dinheiro, não pelo nome do programa: o que o cliente quer
 * saber é quanto tem pra usar. O nível vira linha de apoio.
 */
function ClubCard({
  tierName,
  cashbackBps,
  windowBookings,
  nextMinBookings,
  bookingsNeeded,
  nextTierName,
  balanceCents,
}: {
  tierName: string | null;
  cashbackBps: number | null;
  windowBookings: number;
  nextMinBookings: number | null;
  bookingsNeeded: number | null;
  nextTierName: string | null;
  balanceCents: number | null;
}) {
  const progresso = tierProgress(windowBookings, nextMinBookings);
  const apoio = [tierName && `nível ${tierName}`, cashbackBps ? `${cashbackPctLabel(cashbackBps)} por reserva` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="flex flex-col rounded-lg bg-mp-primary p-5 text-white desktop:p-7">
      <h2 className="text-title-md text-white">Dinheiro de volta</h2>
      {apoio && <p className="mt-1 text-body-sm text-white/70">{apoio}</p>}

      <p className="mt-4 text-display-xl leading-none tabular-nums text-white">
        {formatBRL((balanceCents ?? 0) / 100)}
      </p>
      <p className="mt-2 text-body-sm text-white/75">crédito disponível na carteira</p>

      {/* A barra só existe enquanto há um degrau acima. */}
      {nextMinBookings !== null && (
        <>
          <div
            className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/25"
            role="progressbar"
            aria-valuenow={progresso}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso para o nível ${nextTierName ?? "seguinte"}`}
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${progresso}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-body-sm font-semibold text-white">
              {windowBookings} de {nextMinBookings} reservas
            </span>
            {nextTierName && (
              <span className="text-body-sm text-white/70">próximo: {nextTierName}</span>
            )}
          </div>
        </>
      )}

      <p className="mt-auto pt-6 text-body-sm text-white/85">
        {bookingsNeeded && nextTierName
          ? `Faltam ${bookingsNeeded} ${bookingsNeeded === 1 ? "reserva" : "reservas"} para o ${nextTierName}. `
          : "Cada reserva concluída vira cashback na sua carteira. "}
        <Link to="/account/clube" className="font-semibold text-white underline underline-offset-2">
          Ver o Clube
        </Link>
      </p>
    </section>
  );
}

/** Medidor do cadastro: arco grande, número dentro, e a etapa pendente com sua ação. */
function CompletionCard({ completion }: { completion: ReturnType<typeof profileCompletion> }) {
  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-title-md text-ink">Cadastro completo</h2>
        <span className="text-caption-sm text-muted">check-in mais rápido</span>
      </div>

      <div className="relative mx-auto mt-5 w-[220px] max-w-full">
        <svg viewBox="0 0 100 56" className="w-full" aria-hidden>
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="currentColor"
            className="text-surface-strong"
            strokeWidth={9}
            strokeLinecap="round"
          />
          {/* Só desenha o traço quando há progresso: com `strokeLinecap="round"`
              um traço de comprimento zero ainda pinta uma bolinha. */}
          {completion.done > 0 && (
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="currentColor"
              className="text-mp-primary"
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={completion.dash}
            />
          )}
        </svg>
        {/* O número mora dentro do arco, ancorado na base pra nunca tocar o traço. */}
        <div className="absolute inset-x-0 bottom-0 text-center">
          <span className="block text-display-xl leading-none tabular-nums text-ink">
            {completion.pct}%
          </span>
          <span className="mt-1 block text-caption-sm text-muted">
            {completion.done} de {completion.total} etapas
          </span>
        </div>
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {completion.steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3">
            <CheckCircle2
              className={cn(
                "h-5 w-5 shrink-0",
                step.done ? "fill-mp-primary text-white" : "text-muted/30",
              )}
              aria-hidden
            />
            <span className={cn("flex-1 text-body-sm", step.done ? "text-ink" : "text-muted")}>
              {step.label}
            </span>
            {step.to && (
              <Link
                to={step.to}
                className="shrink-0 text-body-sm font-semibold text-mp-primary no-underline hover:underline"
              >
                {step.action}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
