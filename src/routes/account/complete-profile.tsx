import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Monogram, Wordmark } from "@/components/shared/Brand";
import { useAuth } from "@/auth/context";
import { PhoneField } from "@/components/ui/phone-field";
import { useProfile, useUpdateProfile } from "@/features/profile/api";

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";
  const { session } = useAuth();
  const profileQ = useProfile(session?.userId);
  const update = useUpdateProfile();

  const [fullName, setFullName] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!profileQ.data) return;
    setFullName(profileQ.data.full_name ?? "");
    setTaxId(profileQ.data.tax_id ?? "");
    const rawPhone = profileQ.data.phone ?? "";
    setPhone(rawPhone && !rawPhone.startsWith("+") ? `+${rawPhone}` : rawPhone);
    // Se já está completo, manda pra next
    if (profileQ.data.full_name && profileQ.data.tax_id) {
      navigate(next, { replace: true });
    }
  }, [profileQ.data, navigate, next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!fullName.trim()) {
      toast.error("Conta seu nome");
      return;
    }
    if (taxId.replace(/\D/g, "").length < 11) {
      toast.error("CPF inválido");
      return;
    }
    setSubmitting(true);
    try {
      await update.mutateAsync({
        id: session.userId,
        full_name: fullName.trim(),
        tax_id: taxId.replace(/\D/g, ""),
        phone: phone.trim() || null,
      });
      toast.success("Pronto!");
      navigate(next, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-soft-gradient px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Monogram size={44} />
        <Wordmark height={22} />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-display-md">Falta pouco</CardTitle>
          <CardDescription>
            Conta seu nome e CPF pra emitir notas das suas reservas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profileQ.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Telefone (opcional)</Label>
                <PhoneField
                  id="phone"
                  value={phone || undefined}
                  onChange={(v) => setPhone(v ?? "")}
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Salvando…" : "Continuar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
