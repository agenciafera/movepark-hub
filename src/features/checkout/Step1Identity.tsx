import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneField } from "@/components/ui/phone-field";
import { useAuth } from "@/auth/context";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { useUpdateBookingCustomer } from "./api";

type Props = {
  bookingId: string;
  customerName: string | null;
  customerPhone: string | null;
  onNext: () => void;
};

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

export function Step1Identity({ bookingId, customerName, customerPhone, onNext }: Props) {
  const { session } = useAuth();
  const profileQ = useProfile(session?.userId);
  const updateProfile = useUpdateProfile();
  const updateCustomer = useUpdateBookingCustomer();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState<string | undefined>(undefined);
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [forOther, setForOther] = React.useState(!!customerName);
  const [otherName, setOtherName] = React.useState(customerName ?? "");
  const [otherPhone, setOtherPhone] = React.useState<string | undefined>(
    customerPhone ?? undefined,
  );

  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (!initialized.current && profileQ.data) {
      const [fn, ln] = splitName(profileQ.data.full_name ?? "");
      setFirstName(fn);
      setLastName(ln);
      setPhone(profileQ.data.phone ?? undefined);
      initialized.current = true;
    }
  }, [profileQ.data]);

  if (!session) return null;
  if (profileQ.isLoading) return <Skeleton className="h-64 w-full" />;

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    try {
      const tasks: Promise<unknown>[] = [];

      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
      const prevName = profileQ.data?.full_name ?? "";
      const prevPhone = profileQ.data?.phone ?? undefined;
      if (fullName !== prevName || phone !== prevPhone) {
        tasks.push(
          updateProfile.mutateAsync({
            id: session.userId,
            ...(fullName !== prevName ? { full_name: fullName } : {}),
            ...(phone !== prevPhone ? { phone: phone ?? null } : {}),
          }),
        );
      }

      const newCustomerName = forOther ? otherName.trim() || null : null;
      const newCustomerPhone = forOther ? (otherPhone ?? null) : null;
      if (newCustomerName !== customerName || newCustomerPhone !== customerPhone) {
        tasks.push(
          updateCustomer.mutateAsync({
            bookingId,
            customer_name: newCustomerName,
            customer_phone: newCustomerPhone,
          }),
        );
      }

      await Promise.all(tasks);
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar dados");
    }
  }

  const busy = updateProfile.isPending || updateCustomer.isPending;

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
          <Input id="id-email" value={session.email ?? ""} disabled />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="id-phone">Telefone</Label>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="other-name">Nome do passageiro</Label>
            <Input
              id="other-name"
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              placeholder="Nome completo"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="other-phone">Telefone do passageiro</Label>
            <PhoneField id="other-phone" value={otherPhone} onChange={setOtherPhone} />
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-hairline accent-mp-indigo"
          required
        />
        <span className="text-body-md text-ink">
          Aceito os{" "}
          <Link to="/termos" target="_blank" className="font-semibold underline hover:text-mp-primary">
            Termos e Condições
          </Link>
        </span>
      </label>

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
