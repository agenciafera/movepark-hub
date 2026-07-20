import * as React from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneField } from "@/components/ui/phone-field";
import { useAuth } from "@/auth/context";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { useAcceptTerms } from "@/features/legal/api";
import { LegalDocumentModal } from "@/features/legal/LegalDocumentModal";
import { useAttachPhone, useUpdateBookingCustomer } from "./api";
import { validateStep1Identity } from "./checkout.logic";

type Props = {
  bookingId: string;
  bookingCode: string;
  /** Titular (pagador) já no snapshot do booking, pra pré-preencher. */
  customerEmail: string | null;
  /** Passageiro (quem usa a vaga), quando a reserva é pra outra pessoa. */
  passengerFirstName: string | null;
  passengerLastName: string | null;
  passengerPhone: string | null;
  onNext: () => void;
};

export function Step1Identity({
  bookingId,
  bookingCode,
  customerEmail,
  passengerFirstName,
  passengerLastName,
  passengerPhone,
  onNext,
}: Props) {
  const { session } = useAuth();
  const profileQ = useProfile(session?.userId);
  const updateProfile = useUpdateProfile();
  const updateCustomer = useUpdateBookingCustomer();
  const attachPhone = useAttachPhone();
  const acceptTerms = useAcceptTerms();

  // O titular é sempre a conta em sessão (o pagador). Quem entrou por e-mail (OTP/Google) tem o
  // e-mail travado; quem entrou por telefone não tem e-mail na conta e informa aqui.
  const loggedInWithEmail = !!session?.email;

  // Bloco "Seus dados" (titular = pagador).
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState<string | undefined>(undefined);
  const [email, setEmail] = React.useState(customerEmail ?? "");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [termsOpen, setTermsOpen] = React.useState(false);

  // Bloco passageiro (reserva pra outra pessoa) → só nome e telefone; ele não paga.
  const [forOther, setForOther] = React.useState(!!(passengerFirstName || passengerLastName));
  const [otherFirstName, setOtherFirstName] = React.useState(passengerFirstName ?? "");
  const [otherLastName, setOtherLastName] = React.useState(passengerLastName ?? "");
  const [otherPhone, setOtherPhone] = React.useState<string | undefined>(
    passengerPhone ?? undefined,
  );

  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (!initialized.current && profileQ.data) {
      setFirstName(profileQ.data.first_name ?? "");
      setLastName(profileQ.data.last_name ?? "");
      // Telefone da conta (auth.users), se houver; senão a dica não-verificada guardada no perfil.
      const hint = (profileQ.data.preferences as { unverified_phone_hint?: string } | null)
        ?.unverified_phone_hint;
      setPhone(session?.phone ?? hint ?? undefined);
      initialized.current = true;
    }
  }, [profileQ.data, session?.phone]);

  if (!session) return null;
  if (profileQ.isLoading) return <Skeleton className="h-64 w-full" />;

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;

    const validationError = validateStep1Identity({
      firstName,
      lastName,
      phone,
      email,
      loggedInWithEmail,
      forOther,
      otherFirstName,
      otherLastName,
      otherPhone,
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      const tasks: Promise<unknown>[] = [];

      const titularFirst = firstName.trim();
      const titularLast = lastName.trim();
      // Mantém o profiles atualizado (fonte de pré-preenchimento das próximas reservas).
      if (
        titularFirst !== (profileQ.data?.first_name ?? "") ||
        titularLast !== (profileQ.data?.last_name ?? "")
      ) {
        tasks.push(
          updateProfile.mutateAsync({
            id: session.userId,
            first_name: titularFirst,
            last_name: titularLast,
          }),
        );
      }

      // Snapshot do PAGADOR (titular) no booking: é o que o pagamento e a nota vão usar.
      const titularEmail = loggedInWithEmail ? (session.email ?? null) : email.trim() || null;
      const titularPhone = phone ?? null;
      // Passageiro (opcional): só nome e telefone, pro voucher/aviso.
      const passFirst = forOther ? otherFirstName.trim() || null : null;
      const passLast = forOther ? otherLastName.trim() || null : null;
      const passPhone = forOther ? (otherPhone ?? null) : null;
      tasks.push(
        updateCustomer.mutateAsync({
          bookingId,
          customer_first_name: titularFirst,
          customer_last_name: titularLast,
          customer_phone: titularPhone,
          customer_email: titularEmail,
          passenger_first_name: passFirst,
          passenger_last_name: passLast,
          passenger_phone: passPhone,
        }),
      );

      await Promise.all(tasks);

      // Lembrar o telefone como dica de pré-preenchimento (não credencial): se a conta ainda não tem
      // telefone verificado, guarda (best-effort). O pedido segue com o telefone no snapshot do booking.
      if (!session.phone && titularPhone) {
        try {
          await attachPhone.mutateAsync({ phone: titularPhone });
        } catch {
          // não bloqueia o checkout
        }
      }

      // Registra o aceite explícito dos Termos (server-authoritative, RFN005/LGPD) antes de avançar.
      await acceptTerms.mutateAsync({ booking_code: bookingCode });
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar dados");
    }
  }

  const busy = updateProfile.isPending || updateCustomer.isPending || acceptTerms.isPending;

  return (
    <form id="checkout-step-form" onSubmit={handleNext} className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-display-sm text-ink">Identificação</h2>
        <p className="text-body-md text-muted">Confirme seus dados antes de prosseguir.</p>
      </div>

      <div className="space-y-4 rounded-md border border-hairline bg-canvas p-5">
        <p className="text-body-sm font-semibold text-ink">Seus dados</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="id-first-name">Nome</Label>
            <Input
              id="id-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Nome"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="id-last-name">Sobrenome</Label>
            <Input
              id="id-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Sobrenome"
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="id-email">E-mail</Label>
          {loggedInWithEmail ? (
            <Input id="id-email" type="email" value={session.email ?? ""} disabled />
          ) : (
            <Input
              id="id-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              required
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="id-phone">Telefone</Label>
          <PhoneField
            id="id-phone"
            value={phone}
            onChange={setPhone}
            required
            aria-describedby="id-phone-help"
          />
          <span id="id-phone-help" className="text-caption-sm text-muted">
            Pra avisar sobre a sua reserva.
          </span>
        </div>

        <label className="flex cursor-pointer items-center gap-3 border-t border-hairline pt-4">
          <input
            type="checkbox"
            checked={forOther}
            onChange={(e) => setForOther(e.target.checked)}
            className="h-4 w-4 rounded border-hairline accent-mp-indigo"
          />
          <span className="text-body-md text-ink">A reserva é para outra pessoa</span>
        </label>
      </div>

      {forOther && (
        <div className="space-y-4 rounded-md border border-hairline bg-canvas p-5">
          <p className="text-body-sm text-muted">
            Quem vai usar a vaga. O pagamento e a nota continuam no seu nome.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="other-first-name">Nome do passageiro</Label>
              <Input
                id="other-first-name"
                value={otherFirstName}
                onChange={(e) => setOtherFirstName(e.target.value)}
                placeholder="Nome"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="other-last-name">Sobrenome do passageiro</Label>
              <Input
                id="other-last-name"
                value={otherLastName}
                onChange={(e) => setOtherLastName(e.target.value)}
                placeholder="Sobrenome"
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="other-phone">Telefone do passageiro</Label>
            <PhoneField id="other-phone" value={otherPhone} onChange={setOtherPhone} />
          </div>
        </div>
      )}

      {/* Trigger dos Termos fica FORA do label — clicar nele abre o modal
          sem marcar/desmarcar o checkbox de aceite. */}
      <div className="flex items-start gap-3">
        <input
          id="accept-terms"
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-hairline accent-mp-indigo"
          required
        />
        <span className="text-body-md text-ink">
          <label htmlFor="accept-terms" className="cursor-pointer">
            Aceito os
          </label>{" "}
          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            className="font-semibold underline hover:text-mp-primary"
          >
            Termos e Condições
          </button>
        </span>
      </div>

      <LegalDocumentModal
        slug="terms"
        title="Termos e Condições"
        open={termsOpen}
        onOpenChange={setTermsOpen}
      />

      {/* Botão desktop — no mobile a barra fixa do checkout.tsx submete o form */}
      <div className="hidden justify-end desktop:flex">
        <Button type="submit" disabled={busy || !termsAccepted}>
          {busy ? "Salvando…" : "Continuar"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
