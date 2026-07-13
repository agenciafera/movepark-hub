import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
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
import { Wordmark } from "@/components/shared/Brand";
import { useAuth } from "@/auth/context";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { documentMask, onlyDigits } from "@/lib/masks";
import { isValidCnpj, isValidCpf } from "@/lib/documents";

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";
  const { session } = useAuth();
  const profileQ = useProfile(session?.userId);
  const update = useUpdateProfile();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!profileQ.data) return;
    setFirstName(profileQ.data.first_name ?? "");
    setLastName(profileQ.data.last_name ?? "");
    setTaxId(documentMask(profileQ.data.tax_id ?? ""));
    // Se já está completo, manda pra next
    if (profileQ.data.first_name && profileQ.data.tax_id) {
      navigate(next, { replace: true });
    }
  }, [profileQ.data, navigate, next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Conta seu nome e sobrenome");
      return;
    }
    if (!isValidCpf(taxId) && !isValidCnpj(taxId)) {
      toast.error("CPF ou CNPJ inválido");
      return;
    }
    setSubmitting(true);
    try {
      await update.mutateAsync({
        id: session.userId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        tax_id: onlyDigits(taxId),
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
      <Link
        to="/"
        aria-label="Ir para a página inicial da Movepark"
        className="mb-8 flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
      >
        <Wordmark height={22} />
        <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
          Hub
        </span>
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-display-md">Falta pouco</CardTitle>
          <CardDescription>
            Conta seu nome e CPF ou CNPJ pra emitir notas das suas reservas.
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
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="first-name">Nome</Label>
                  <Input
                    id="first-name"
                    autoFocus
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="last-name">Sobrenome</Label>
                  <Input
                    id="last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cpf">CPF ou CNPJ</Label>
                <Input
                  id="cpf"
                  value={taxId}
                  onChange={(e) => setTaxId(documentMask(e.target.value))}
                  placeholder="CPF ou CNPJ"
                  inputMode="numeric"
                  maxLength={18}
                  required
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Salvando…" : "Continuar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-1 text-body-sm text-muted no-underline hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para o início
      </Link>
    </div>
  );
}
