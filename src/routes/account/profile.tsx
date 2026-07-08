import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/auth/context";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { documentMask, onlyDigits } from "@/lib/masks";
import { isValidCnpj, isValidCpf } from "@/lib/documents";

export default function ProfilePage() {
  const { session } = useAuth();
  const profileQ = useProfile(session?.userId);
  const update = useUpdateProfile();

  const [fullName, setFullName] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [birthDate, setBirthDate] = React.useState<string>("");
  const [language, setLanguage] = React.useState<string>("pt-BR");
  const [dirty, setDirty] = React.useState(false);

  // Sync ao carregar
  React.useEffect(() => {
    if (!profileQ.data) return;
    setFullName(profileQ.data.full_name ?? "");
    setTaxId(documentMask(profileQ.data.tax_id ?? ""));
    setBirthDate(profileQ.data.birth_date ?? "");
    setLanguage(profileQ.data.preferences.language ?? "pt-BR");
    setDirty(false);
  }, [profileQ.data]);

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
        full_name: fullName.trim() || null,
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

  if (profileQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Perfil" description="Suas informações pessoais." />

      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        <div className="flex flex-col gap-1.5 tablet:col-span-2">
          <Label htmlFor="name">Nome completo</Label>
          <Input
            id="name"
            value={fullName}
            onChange={(e) => markDirty(setFullName)(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            value={session?.email ?? ""}
            disabled
            className="cursor-not-allowed bg-surface-soft"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            value={session?.phone ?? "Não adicionado"}
            disabled
            className="cursor-not-allowed bg-surface-soft"
          />
          <span className="text-caption-sm text-muted">
            Telefone e e-mail ficam em{" "}
            <Link to="/account/security" className="text-info underline">
              Segurança › Meus logins
            </Link>
            .
          </span>
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
          <Label>Idioma preferido</Label>
          <Select value={language} onValueChange={markDirty(setLanguage)}>
            <SelectTrigger>
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

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!dirty || update.isPending}
        >
          {update.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
