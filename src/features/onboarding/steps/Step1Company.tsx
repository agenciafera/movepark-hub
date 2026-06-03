import * as React from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StepShell } from "../StepShell";
import { useUpdateCompanyStep, uploadPartnerAsset, type OnboardingData } from "../wizardApi";

type Props = { data: OnboardingData; companyId: string; onNext: () => void };

export function Step1Company({ data, companyId, onNext }: Props) {
  const save = useUpdateCompanyStep(companyId);
  const [name, setName] = React.useState(data.company.name ?? "");
  const [legalName, setLegalName] = React.useState(data.company.legal_name ?? "");
  const [taxId, setTaxId] = React.useState(data.company.tax_id ?? "");
  const [logoUrl, setLogoUrl] = React.useState<string | null>(data.company.logo_url ?? null);
  const [uploading, setUploading] = React.useState(false);

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPartnerAsset(companyId, file, "logo");
      setLogoUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleNext() {
    if (!name.trim()) return toast.error("Informe o nome da empresa.");
    if (!taxId.trim()) return toast.error("Informe o CNPJ.");
    try {
      await save.mutateAsync({
        p_company_id: companyId,
        p_name: name,
        p_legal_name: legalName || null,
        p_tax_id: taxId,
        p_logo_url: logoUrl,
      });
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <StepShell
      title="Dados da empresa"
      description="Confirme as informações do seu estacionamento."
      onNext={handleNext}
      busy={save.isPending}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-hairline bg-surface-soft">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-caption text-muted">Logo</span>
          )}
        </div>
        <div>
          <input id="logo" type="file" accept="image/*" className="hidden" onChange={handleLogo} />
          <Button asChild variant="secondary" size="sm" disabled={uploading}>
            <label htmlFor="logo" className="cursor-pointer">
              {uploading ? "Enviando…" : "Enviar logo"}
            </label>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        <div className="flex flex-col gap-1.5 tablet:col-span-2">
          <Label htmlFor="name">Nome de exibição *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="legal">Razão social</Label>
          <Input id="legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tax">CNPJ *</Label>
          <Input id="tax" value={taxId} onChange={(e) => setTaxId(e.target.value)} required />
        </div>
      </div>
    </StepShell>
  );
}
