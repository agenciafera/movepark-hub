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
import { useUpdateBookingCustomer } from "./api";
import { validateStep1Identity } from "./checkout.logic";

type Props = {
  bookingId: string;
  bookingCode: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  onNext: () => void;
};

export function Step1Identity({
  bookingId,
  bookingCode,
  customerFirstName,
  customerLastName,
  customerPhone,
  customerEmail,
  onNext,
}: Props) {
  const { session } = useAuth();
  const profileQ = useProfile(session?.userId);
  const updateProfile = useUpdateProfile();
  const updateCustomer = useUpdateBookingCustomer();
  const acceptTerms = useAcceptTerms();

  // Identidade verificada = o canal usado no login. Quem entrou por e-mail (OTP/Google) tem
  // `session.email` e não edita o e-mail; quem entrou por telefone não tem e-mail na conta e
  // precisa informá-lo aqui (e o telefone, que é a identidade, fica travado).
  const loggedInWithEmail = !!session?.email;

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState<string | undefined>(undefined);
  const [email, setEmail] = React.useState(customerEmail ?? "");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [forOther, setForOther] = React.useState(!!(customerFirstName || customerLastName));
  const [otherFirstName, setOtherFirstName] = React.useState(customerFirstName ?? "");
  const [otherLastName, setOtherLastName] = React.useState(customerLastName ?? "");
  const [otherPhone, setOtherPhone] = React.useState<string | undefined>(
    customerPhone ?? undefined,
  );

  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (!initialized.current && profileQ.data) {
      setFirstName(profileQ.data.first_name ?? "");
      setLastName(profileQ.data.last_name ?? "");
      setPhone(session?.phone ?? undefined);
      initialized.current = true;
    }
  }, [profileQ.data, session?.phone]);

  if (!session) return null;
  if (profileQ.isLoading) return <Skeleton className="h-64 w-full" />;

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;

    // Contato obrigatório: telefone válido sempre; e-mail quando a conta não tem (login por
    // telefone); telefone do passageiro quando é pra outra pessoa. Continua sendo só contato do
    // pedido (snapshot da booking) — não vira credencial aqui (ADR-006 / E0.10).
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

      const nextFirst = firstName.trim();
      const nextLast = lastName.trim();
      // ADR-006: o telefone da conta é credencial (auth.users) — não é escrito no profiles aqui.
      if (nextFirst !== (profileQ.data?.first_name ?? "") || nextLast !== (profileQ.data?.last_name ?? "")) {
        tasks.push(
          updateProfile.mutateAsync({
            id: session.userId,
            first_name: nextFirst,
            last_name: nextLast,
          }),
        );
      }

      const newCustomerFirst = forOther ? otherFirstName.trim() || null : null;
      const newCustomerLast = forOther ? otherLastName.trim() || null : null;
      // Snapshot de contato do pedido: outra pessoa → telefone dela; senão o telefone informado.
      const newCustomerPhone = forOther ? (otherPhone ?? null) : (phone ?? null);
      // E-mail de contato da reserva: quem entrou por telefone informa aqui (a conta não tem
      // e-mail); quem entrou por e-mail já é atendido pelo e-mail da conta.
      const newCustomerEmail = loggedInWithEmail ? customerEmail : email.trim() || null;
      if (
        newCustomerFirst !== customerFirstName ||
        newCustomerLast !== customerLastName ||
        newCustomerPhone !== customerPhone ||
        newCustomerEmail !== customerEmail
      ) {
        tasks.push(
          updateCustomer.mutateAsync({
            bookingId,
            customer_first_name: newCustomerFirst,
            customer_last_name: newCustomerLast,
            customer_phone: newCustomerPhone,
            customer_email: newCustomerEmail,
          }),
        );
      }

      await Promise.all(tasks);
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
          <Label htmlFor="id-phone">Telefone de contato</Label>
          {/* Contato do pedido (snapshot). O telefone da CONTA fica em Segurança › Meus logins. */}
          <PhoneField id="id-phone" value={phone} onChange={setPhone} required />
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
          <p className="text-body-sm text-muted">Dados de quem vai usar a vaga.</p>
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
