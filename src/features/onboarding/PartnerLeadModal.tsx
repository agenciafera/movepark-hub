import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneField } from "@/components/ui/phone-field";
import { StateSelect } from "@/components/shared/StateSelect";
import { ThankYou } from "./ThankYou";
import { useCapturePartnerLead } from "./partnerLeadApi";
import { useSubmitLead, type LeadResult } from "./leadApi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal multi-etapas do "Seja parceiro". Passo 1 (WhatsApp + e-mail) já salva via
 * capture-partner-lead — se a pessoa desistir, o contato fica pra follow-up.
 * Passos 2–3 completam e a submissão final vai pro submit-partner-lead.
 */
export function PartnerLeadModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [searchParams] = useSearchParams();
  const capture = useCapturePartnerLead();
  const submit = useSubmitLead();

  const [step, setStep] = React.useState(1);
  const [result, setResult] = React.useState<LeadResult | null>(null);

  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState<string | undefined>(undefined);
  const [companyName, setCompanyName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [uf, setUf] = React.useState("");
  const [spots, setSpots] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [accept, setAccept] = React.useState(false);
  const [hp, setHp] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const utm = React.useMemo(
    () => ({
      utm_source: searchParams.get("utm_source"),
      utm_medium: searchParams.get("utm_medium"),
      utm_campaign: searchParams.get("utm_campaign"),
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
    }),
    [searchParams],
  );

  function reset() {
    setStep(1);
    setResult(null);
    setError(null);
  }

  const spotsInt = spots.trim() ? Math.max(0, parseInt(spots, 10) || 0) : null;

  async function nextFromStep1() {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError("Informe um e-mail válido.");
    if (!phone || phone.length < 8) return setError("Informe seu WhatsApp.");
    try {
      await capture.mutateAsync({
        contact_email: email,
        contact_phone: phone,
        step: 1,
        ...utm,
        hp_field: hp,
      });
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  async function nextFromStep2() {
    setError(null);
    if (!companyName.trim()) return setError("Informe o nome do estacionamento.");
    if (!city.trim()) return setError("Informe a cidade.");
    if (!uf) return setError("Selecione o estado.");
    // Best-effort: salva o progresso, mas não trava o avanço se falhar.
    capture.mutate({
      contact_email: email,
      contact_phone: phone,
      company_name: companyName,
      city,
      state: uf,
      estimated_spots: spotsInt,
      step: 2,
      ...utm,
    });
    setStep(3);
  }

  async function finish() {
    setError(null);
    if (!contactName.trim()) return setError("Informe seu nome.");
    if (!accept) return setError("É preciso aceitar os termos para continuar.");
    try {
      const r = await submit.mutateAsync({
        company_name: companyName,
        contact_name: contactName,
        contact_email: email,
        contact_phone: phone ?? "",
        city,
        state: uf,
        estimated_spots: spotsInt,
        accept_terms: true,
        ...utm,
        hp_field: hp,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
    }
  }

  const busy = capture.isPending || submit.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) window.setTimeout(reset, 200);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        {result?.ok ? (
          <ThankYou alreadySubmitted={result.already_submitted} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Cadastre seu estacionamento</DialogTitle>
            </DialogHeader>

            {/* Progresso */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className={
                    "h-1.5 flex-1 rounded-full " +
                    (n <= step ? "bg-mp-primary" : "bg-surface-soft")
                  }
                />
              ))}
            </div>
            <p className="-mt-2 text-caption-sm text-muted">Passo {step} de 3</p>

            {/* Honeypot */}
            <input
              type="text"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
            />

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-body-sm text-muted">
                  Deixe seu contato — a gente te chama no WhatsApp pra colocar você no ar.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pl-email">E-mail</Label>
                  <Input
                    id="pl-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@estacionamento.com"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pl-phone">WhatsApp</Label>
                  <PhoneField id="pl-phone" value={phone} onChange={setPhone} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pl-company">Nome do estacionamento</Label>
                  <Input
                    id="pl-company"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Estacionamento Centro"
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pl-city">Cidade</Label>
                    <Input id="pl-city" value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div className="flex w-24 flex-col gap-1.5">
                    <Label htmlFor="pl-uf">Estado</Label>
                    <StateSelect id="pl-uf" value={uf} onValueChange={setUf} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pl-spots">Vagas (aprox.)</Label>
                  <Input
                    id="pl-spots"
                    type="number"
                    min={1}
                    value={spots}
                    onChange={(e) => setSpots(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pl-name">Seu nome</Label>
                  <Input
                    id="pl-name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Nome e sobrenome"
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} />
                  <span className="text-body-sm text-muted">
                    Autorizo a Movepark a entrar em contato sobre a parceria. Sem mensalidade, sem
                    taxa de adesão.
                  </span>
                </label>
              </div>
            )}

            {error && <p className="text-body-sm text-error">{error}</p>}

            <div className="flex items-center justify-between gap-3 pt-1">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={busy}
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </Button>
              ) : (
                <span className="flex items-center gap-1.5 text-caption-sm text-muted">
                  <Lock className="h-3.5 w-3.5" /> Seguro
                </span>
              )}

              {step === 1 && (
                <Button type="button" onClick={nextFromStep1} disabled={busy}>
                  {busy ? "Salvando…" : "Continuar"} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 2 && (
                <Button type="button" onClick={nextFromStep2} disabled={busy}>
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 3 && (
                <Button type="button" onClick={finish} disabled={busy}>
                  {busy ? "Enviando…" : "Quero ser parceiro"} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
