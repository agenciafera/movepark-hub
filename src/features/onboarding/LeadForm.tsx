import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneField } from "@/components/ui/phone-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSubmitLead, type LeadResult } from "./leadApi";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

type Props = {
  onSuccess: (result: LeadResult) => void;
};

export function LeadForm({ onSuccess }: Props) {
  const submit = useSubmitLead();
  const [params] = useSearchParams();

  const [companyName, setCompanyName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState<string | undefined>(undefined);
  const [taxId, setTaxId] = React.useState("");
  const [city, setCity] = React.useState("");
  const [uf, setUf] = React.useState("");
  const [estimatedSpots, setEstimatedSpots] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [hpField, setHpField] = React.useState(""); // honeypot

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactPhone) {
      toast.error("Informe um telefone para contato.");
      return;
    }
    if (!acceptTerms) {
      toast.error("É necessário aceitar os termos.");
      return;
    }
    try {
      const result = await submit.mutateAsync({
        company_name: companyName,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        tax_id: taxId || null,
        city: city || null,
        state: uf || null,
        estimated_spots: estimatedSpots ? Number(estimatedSpots) : null,
        message: message || null,
        accept_terms: acceptTerms,
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        referrer: typeof document !== "undefined" ? document.referrer || null : null,
        hp_field: hpField,
      });
      onSuccess(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar cadastro");
    }
  }

  return (
    <form className="grid grid-cols-1 gap-4 tablet:grid-cols-2" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5 tablet:col-span-2">
        <Label htmlFor="company_name">Nome do estacionamento *</Label>
        <Input
          id="company_name"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Ex: Estacionamento Centro"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact_name">Seu nome *</Label>
        <Input
          id="contact_name"
          required
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact_email">E-mail *</Label>
        <Input
          id="contact_email"
          type="email"
          required
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="voce@empresa.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact_phone">Telefone / WhatsApp *</Label>
        <PhoneField id="contact_phone" value={contactPhone} onChange={setContactPhone} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tax_id">CNPJ</Label>
        <Input
          id="tax_id"
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          placeholder="Opcional neste momento"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="city">Cidade *</Label>
        <Input id="city" required value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Estado *</Label>
        <Select value={uf} onValueChange={setUf} required>
          <SelectTrigger>
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            {UFS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5 tablet:col-span-2">
        <Label htmlFor="estimated_spots">Quantidade estimada de vagas</Label>
        <Input
          id="estimated_spots"
          type="number"
          min={0}
          value={estimatedSpots}
          onChange={(e) => setEstimatedSpots(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      <div className="flex flex-col gap-1.5 tablet:col-span-2">
        <Label htmlFor="message">Mensagem</Label>
        <Textarea
          id="message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Conte um pouco sobre seu estacionamento (opcional)"
        />
      </div>

      {/* honeypot anti-spam — invisível para humanos */}
      <div className="hidden" aria-hidden>
        <label>
          Não preencha
          <input
            tabIndex={-1}
            autoComplete="off"
            value={hpField}
            onChange={(e) => setHpField(e.target.value)}
          />
        </label>
      </div>

      <label className="flex items-start gap-2 tablet:col-span-2">
        <Checkbox checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(v === true)} />
        <span className="text-body-sm text-muted">
          Concordo em ser contatado pela MovePark e com o tratamento dos meus dados conforme a
          política de privacidade.
        </span>
      </label>

      <div className="tablet:col-span-2">
        <Button type="submit" className="w-full tablet:w-auto" disabled={submit.isPending}>
          {submit.isPending ? "Enviando…" : "Quero cadastrar meu estacionamento"}
        </Button>
      </div>
    </form>
  );
}
