import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Monogram, Wordmark } from "@/components/shared/Brand";
import { useAuth } from "@/auth/context";

export default function LoginPage() {
  const { signIn, session, effectiveRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!session || !effectiveRole) return;
    // Se veio com ?next= preserva o destino original (qualquer role)
    if (next) {
      navigate(next, { replace: true });
      return;
    }
    if (effectiveRole === "hub_admin") navigate("/manager", { replace: true });
    else if (effectiveRole === "company_operator") navigate("/operator", { replace: true });
    else navigate("/", { replace: true }); // customer
  }, [session, effectiveRole, next, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao entrar";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
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
          <CardTitle className="text-display-md">Acesso ao painel</CardTitle>
          <CardDescription>
            Login operacional (manager / operator). Clientes entram em{" "}
            <Link to="/entrar" className="text-ink underline">
              /entrar
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span />
              <Link
                to="/forgot-password"
                className="text-body-sm text-muted no-underline hover:text-ink"
              >
                Esqueci a senha
              </Link>
            </div>
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <a
        href="/design-system"
        className="mt-6 text-body-sm text-muted no-underline hover:text-ink"
      >
        Ver design system →
      </a>
    </div>
  );
}
