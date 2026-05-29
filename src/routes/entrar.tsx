import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Mail, MessageCircle } from "lucide-react";
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
import { OtpInput } from "@/components/ui/otp-input";
import { Monogram, Wordmark } from "@/components/shared/Brand";
import { GoogleButton } from "@/auth/GoogleButton";
import { useAuth } from "@/auth/context";
import { maskPhoneBR, toE164BR } from "@/lib/phone";

type Mode = "choice" | "email" | "email-code" | "phone" | "phone-code";

const RESEND_SECONDS = 30;

export default function EntrarPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  const {
    session,
    effectiveRole,
    sendEmailOtp,
    verifyEmailOtp,
    sendWhatsappOtp,
    verifyPhoneOtp,
  } = useAuth();

  const [mode, setMode] = React.useState<Mode>("choice");
  const [email, setEmail] = React.useState("");
  const [phoneRaw, setPhoneRaw] = React.useState("");
  const [code, setCode] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);

  React.useEffect(() => {
    if (!session || !effectiveRole) return;
    // Redireciona segundo o role
    if (effectiveRole === "hub_admin") navigate("/manager", { replace: true });
    else if (effectiveRole === "company_operator")
      navigate("/operator", { replace: true });
    else navigate(next ?? "/", { replace: true });
  }, [session, effectiveRole, navigate, next]);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  function backToChoice() {
    setMode("choice");
    setCode("");
  }

  async function handleSendEmail() {
    if (!email.includes("@")) {
      toast.error("E-mail inválido");
      return;
    }
    setSubmitting(true);
    try {
      await sendEmailOtp(email.trim().toLowerCase());
      setMode("email-code");
      setResendIn(RESEND_SECONDS);
      setCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar código");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyEmail(token: string) {
    setSubmitting(true);
    try {
      await verifyEmailOtp(email.trim().toLowerCase(), token);
      toast.success("Tudo certo, entrando…");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendPhone() {
    const e164 = toE164BR(phoneRaw);
    if (!e164) {
      toast.error("Digite o número com DDD");
      return;
    }
    setSubmitting(true);
    try {
      await sendWhatsappOtp(e164);
      setMode("phone-code");
      setResendIn(RESEND_SECONDS);
      setCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar código");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyPhone(token: string) {
    const e164 = toE164BR(phoneRaw);
    if (!e164) return;
    setSubmitting(true);
    try {
      await verifyPhoneOtp(e164, token);
      toast.success("Tudo certo, entrando…");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (mode === "email-code") await handleSendEmail();
    if (mode === "phone-code") await handleSendPhone();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-soft-gradient px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Monogram size={44} />
        <div className="flex flex-col items-center gap-1">
          <Wordmark height={22} />
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
            Hub
          </span>
        </div>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          {mode !== "choice" && (
            <button
              type="button"
              onClick={backToChoice}
              className="mb-2 inline-flex items-center gap-1 text-body-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          )}
          <CardTitle className="text-display-md">
            {mode === "choice" && "Entre na Movepark"}
            {mode === "email" && "Entrar com e-mail"}
            {mode === "email-code" && "Confirme o código"}
            {mode === "phone" && "Entrar com WhatsApp"}
            {mode === "phone-code" && "Confirme o código"}
          </CardTitle>
          <CardDescription>
            {mode === "choice" && "Reserve em segundos. Sem senha."}
            {mode === "email" && "Mandamos um código de 6 dígitos pro e-mail."}
            {mode === "email-code" && (
              <>
                Digite o código que enviamos pra{" "}
                <span className="text-ink">{email}</span>.
              </>
            )}
            {mode === "phone" && "Mandamos o código pelo WhatsApp."}
            {mode === "phone-code" && (
              <>
                Código enviado pelo WhatsApp pra{" "}
                <span className="text-ink">{maskPhoneBR(phoneRaw)}</span>.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "choice" && (
            <div className="space-y-3">
              <GoogleButton />
              <div className="flex items-center gap-3 text-caption-sm text-muted">
                <span className="h-px flex-1 bg-hairline" />
                <span>ou</span>
                <span className="h-px flex-1 bg-hairline" />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-center gap-2"
                onClick={() => setMode("email")}
              >
                <Mail className="h-4 w-4" />
                Entrar com e-mail
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-center gap-2"
                onClick={() => setMode("phone")}
              >
                <MessageCircle className="h-4 w-4" />
                Entrar com WhatsApp
              </Button>
              <p className="pt-2 text-center text-caption-sm text-muted">
                Ao continuar você aceita os Termos e a Política de privacidade.
              </p>
            </div>
          )}

          {mode === "email" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendEmail();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Enviando…" : "Enviar código"}
              </Button>
            </form>
          )}

          {mode === "phone" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPhone();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">WhatsApp</Label>
                <div className="flex gap-2">
                  <div className="inline-flex h-10 items-center rounded-md border border-hairline bg-surface-soft px-3 text-body-md text-muted">
                    +55
                  </div>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    autoFocus
                    value={maskPhoneBR(phoneRaw)}
                    onChange={(e) => setPhoneRaw(e.target.value)}
                    placeholder="(11) 91234-5678"
                    required
                  />
                </div>
                <span className="text-caption-sm text-muted">
                  Você vai receber um código pelo WhatsApp.
                </span>
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Enviando…" : "Enviar código"}
              </Button>
            </form>
          )}

          {(mode === "email-code" || mode === "phone-code") && (
            <div className="space-y-5">
              <OtpInput
                value={code}
                onChange={setCode}
                disabled={submitting}
                onComplete={(v) =>
                  mode === "email-code"
                    ? handleVerifyEmail(v)
                    : handleVerifyPhone(v)
                }
              />
              <Button
                type="button"
                onClick={() =>
                  mode === "email-code"
                    ? handleVerifyEmail(code)
                    : handleVerifyPhone(code)
                }
                disabled={submitting || code.length < 6}
                className="w-full"
              >
                {submitting ? "Verificando…" : "Verificar"}
              </Button>
              <div className="text-center text-body-sm text-muted">
                {resendIn > 0 ? (
                  <>Não chegou? Reenviar em {resendIn}s</>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-ink underline hover:no-underline"
                  >
                    Reenviar código
                  </button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
