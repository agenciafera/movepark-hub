import * as React from "react";
import { toast } from "sonner";
import { Mail, Phone, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIdentities, useLinkGoogle, useUnlinkProvider, type Channel } from "./api";
import { AttachIdentifierDialog } from "./AttachIdentifierDialog";

/**
 * "Meus logins" (E0.10 · ADR-006): mostra as credenciais/identidades da conta e permite
 * anexar/alterar telefone e e-mail (verificados) e conectar/remover o Google. Guarda: nunca
 * remover o último método de login.
 */
export function MyLoginsSection() {
  const identitiesQ = useIdentities();
  const linkGoogle = useLinkGoogle();
  const unlink = useUnlinkProvider();
  const [dialog, setDialog] = React.useState<Channel | null>(null);

  if (identitiesQ.isLoading) return <Skeleton className="h-40 w-full" />;
  const id = identitiesQ.data;
  if (!id) return null;

  const hasGoogle = id.providers.some((p) => p.provider === "google");
  const loginMethods =
    (id.email ? 1 : 0) + (id.phone ? 1 : 0) + id.providers.filter((p) => p.provider !== "email").length;

  async function handleUnlinkGoogle() {
    if (loginMethods <= 1) {
      toast.error("Você não pode remover seu único jeito de entrar.");
      return;
    }
    try {
      await unlink.mutateAsync("google");
      toast.success("Google desconectado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desconectar");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-title-md text-ink">Meus logins</h2>
      <p className="text-body-sm text-muted">
        Seu e-mail e telefone verificados são a forma de entrar. Mantê-los na mesma conta evita
        contas duplicadas.
      </p>

      <div className="divide-y divide-hairline rounded-md border border-hairline bg-canvas">
        {/* E-mail */}
        <Row
          icon={<Mail className="h-5 w-5" />}
          title="E-mail"
          value={id.email}
          verified={id.email_verified}
          action={
            <Button variant="secondary" size="sm" onClick={() => setDialog("email")}>
              {id.email ? "Alterar" : "Adicionar"}
            </Button>
          }
        />
        {/* Telefone */}
        <Row
          icon={<Phone className="h-5 w-5" />}
          title="Telefone (WhatsApp)"
          value={id.phone}
          verified={id.phone_verified}
          action={
            <Button variant="secondary" size="sm" onClick={() => setDialog("phone")}>
              {id.phone ? "Alterar" : "Adicionar"}
            </Button>
          }
        />
        {/* Google */}
        <Row
          icon={<LogIn className="h-5 w-5" />}
          title="Google"
          value={hasGoogle ? "Conectado" : null}
          verified={hasGoogle}
          action={
            hasGoogle ? (
              <Button variant="ghost" size="sm" onClick={handleUnlinkGoogle} disabled={unlink.isPending}>
                Remover
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => linkGoogle.mutate()}
                disabled={linkGoogle.isPending}
              >
                Conectar
              </Button>
            )
          }
        />
      </div>

      {dialog && (
        <AttachIdentifierDialog
          channel={dialog}
          open={!!dialog}
          onOpenChange={(o) => setDialog(o ? dialog : null)}
        />
      )}
    </section>
  );
}

function Row({
  icon,
  title,
  value,
  verified,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | null;
  verified: boolean;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
          {icon}
        </span>
        <div>
          <div className="text-body-md text-ink">{title}</div>
          <div className="text-body-sm text-muted">
            {value ?? "Não adicionado"}
            {value && verified && <span className="ml-2 text-success">✓ verificado</span>}
          </div>
        </div>
      </div>
      {action}
    </div>
  );
}
