import { toast } from "sonner";
import { ShieldCheck, LogOut, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { useSignOutEverywhere } from "@/features/profile/api";

export default function SecurityPage() {
  const signOutAll = useSignOutEverywhere();

  async function handleSignOutAll() {
    if (
      !confirm(
        "Deslogar de todos os dispositivos? Você precisará entrar de novo aqui também.",
      )
    )
      return;
    try {
      await signOutAll.mutateAsync();
      toast.success("Saiu de todos os dispositivos");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Segurança"
        description="Senha, autenticação em dois fatores e sessões ativas."
      />

      <section className="space-y-3">
        <h2 className="text-title-md text-ink">Como você entra</h2>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-hairline bg-canvas p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <div className="text-body-md text-ink">
                Sem senha: só código de uso único
              </div>
              <div className="text-body-sm text-muted">
                Toda vez que você entrar, mandamos um código pelo e-mail ou
                WhatsApp. Não tem o que decorar nem o que recuperar.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-title-md text-ink">
          Autenticação em dois fatores (2FA)
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-hairline bg-canvas p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="text-body-md text-ink">App autenticador (TOTP)</div>
              <div className="text-body-sm text-muted">
                Em breve: configure um app como Google Authenticator ou 1Password
                pra reforçar sua conta.
              </div>
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled>
            Em breve
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-title-md text-ink">Sessões ativas</h2>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-hairline bg-canvas p-4">
          <div>
            <div className="text-body-md text-ink">
              Sair de todos os dispositivos
            </div>
            <div className="text-body-sm text-muted">
              Encerra todas as sessões, inclusive esta. Útil se você perdeu o
              telefone ou usou um computador público.
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSignOutAll}
            disabled={signOutAll.isPending}
          >
            <LogOut className="h-4 w-4" />
            {signOutAll.isPending ? "Saindo…" : "Sair de todos"}
          </Button>
        </div>
      </section>
    </div>
  );
}
