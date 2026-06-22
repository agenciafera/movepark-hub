import * as React from "react";
import { Link } from "react-router-dom";
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
import { Wordmark } from "@/components/shared/Brand";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Não conseguimos enviar agora";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-soft-gradient px-4 py-12">
      <div className="mb-8 flex flex-col items-center">
        <Wordmark height={28} />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-display-md">
            {sent ? "Confira sua caixa de entrada" : "Esqueceu sua senha?"}
          </CardTitle>
          <CardDescription>
            {sent
              ? "Se houver conta com esse e-mail, enviamos um link de recuperação. Confira spam também."
              : "Digite o e-mail da sua conta para receber um link de redefinição."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <Button variant="secondary" asChild className="w-full">
              <Link to="/login">Voltar para o login</Link>
            </Button>
          ) : (
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
              <Button type="submit" disabled={submitting}>
                {submitting ? "Enviando…" : "Enviar link de recuperação"}
              </Button>
              <Link
                to="/login"
                className="self-center text-body-sm text-muted underline-offset-2 hover:underline"
              >
                Voltar para o login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
