import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneField } from "@/components/ui/phone-field";
import { StateSelect } from "@/components/shared/StateSelect";
import { cnpjMask } from "@/lib/masks";
import { useSubmitLead, type LeadResult } from "./leadApi";

type Props = {
  onSuccess: (result: LeadResult) => void;
};

type FieldErrors = { phone?: string; terms?: string };

/** Mensagem de erro inline, persistente e associada ao campo (não usa toast). */
function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-body-sm text-error">
      {children}
    </p>
  );
}

export function LeadForm({ onSuccess }: Props) {
  const submit = useSubmitLead();
  const [params] = useSearchParams();

  const [companyName, setCompanyName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactRole, setContactRole] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState<string | undefined>(undefined);
  const [taxId, setTaxId] = React.useState("");
  const [city, setCity] = React.useState("");
  const [uf, setUf] = React.useState("");
  const [estimatedSpots, setEstimatedSpots] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [hpField, setHpField] = React.useState(""); // honeypot
  const [errors, setErrors] = React.useState<FieldErrors>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Validação dos campos que o HTML nativo não cobre — erros inline e persistentes,
    // no mesmo lugar (abaixo do campo) que a validação nativa dos demais.
    const next: FieldErrors = {};
    if (!contactPhone) next.phone = "Informe um telefone para contato.";
    if (!acceptTerms) next.terms = "É necessário aceitar os termos para continuar.";
    if (next.phone || next.terms) {
      setErrors(next);
      return;
    }
    setErrors({});
    if (!contactPhone) return; // já validado acima; garante o narrowing do tipo pro TS
    try {
      const result = await submit.mutateAsync({
        company_name: companyName,
        contact_name: contactName,
        contact_role: contactRole || null,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        tax_id: taxId.replace(/\D/g, "") || null,
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
      // Falha de rede/servidor (não validação) — toast é apropriado aqui.
      toast.error(err instanceof Error ? err.message : "Erro ao enviar cadastro");
    }
  }

  return (
    <form className="flex flex-col gap-8" onSubmit={handleSubmit}>
      <fieldset className="flex flex-col gap-4">
        <legend className="text-label font-medium text-muted">Sobre o estacionamento</legend>
        <div className="grid grid-cols-1 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company_name">Nome do estacionamento *</Label>
            <Input
              id="company_name"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex: Estacionamento Centro"
            />
          </div>

          {/* Cidade + Estado é o único par: o UF é estreito e cabe em qualquer largura. */}
          <div className="grid grid-cols-[1fr_6rem] gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">Cidade *</Label>
              <Input id="city" required value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-uf">Estado *</Label>
              <StateSelect id="lead-uf" value={uf} onValueChange={setUf} required />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estimated_spots">Quantidade estimada de vagas</Label>
            <Input
              id="estimated_spots"
              type="number"
              inputMode="numeric"
              min={0}
              value={estimatedSpots}
              onChange={(e) => setEstimatedSpots(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-label font-medium text-muted">Seu contato</legend>
        <div className="grid grid-cols-1 gap-5">
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
            <Label htmlFor="contact_role">Cargo</Label>
            <Input
              id="contact_role"
              value={contactRole}
              onChange={(e) => setContactRole(e.target.value)}
              placeholder="Ex: Proprietário, Gerente"
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
            <PhoneField
              id="contact_phone"
              value={contactPhone}
              onChange={(v) => {
                setContactPhone(v);
                if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
              }}
              required
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "contact_phone-error" : undefined}
            />
            <FieldError id="contact_phone-error">{errors.phone}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax_id">CNPJ</Label>
            <Input
              id="tax_id"
              value={taxId}
              onChange={(e) => setTaxId(cnpjMask(e.target.value))}
              placeholder="Opcional neste momento"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Conte um pouco sobre seu estacionamento (opcional)"
            />
          </div>
        </div>
      </fieldset>

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

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-2">
          <Checkbox
            checked={acceptTerms}
            onCheckedChange={(v) => {
              setAcceptTerms(v === true);
              if (errors.terms) setErrors((p) => ({ ...p, terms: undefined }));
            }}
            aria-invalid={!!errors.terms}
            aria-describedby={errors.terms ? "accept_terms-error" : undefined}
          />
          <span className="text-body-sm text-muted">
            Concordo em ser contatado pela Movepark e com o tratamento dos meus dados conforme os{" "}
            <Link to="/termos" target="_blank" className="text-mp-primary underline">
              termos de uso
            </Link>{" "}
            e a{" "}
            <Link to="/privacidade" target="_blank" className="text-mp-primary underline">
              política de privacidade
            </Link>
            .
          </span>
        </label>
        <FieldError id="accept_terms-error">{errors.terms}</FieldError>
      </div>

      <Button type="submit" className="w-full tablet:w-auto" disabled={submit.isPending}>
        {submit.isPending ? "Enviando…" : "Quero cadastrar meu estacionamento"}
      </Button>
    </form>
  );
}
