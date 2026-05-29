import { ArrowRight, Mail, Phone, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";

type Props = {
  onNext: () => void;
};

export function Step1Identity({ onNext }: Props) {
  const { session } = useAuth();
  if (!session) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-display-sm text-ink">Identificação</h2>
        <p className="text-body-md text-muted">
          Confirme seus dados antes de seguir pra escolha do veículo.
        </p>
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-5">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
              <UserIcon className="h-5 w-5" />
            </span>
            <div>
              <div className="text-caption text-muted">Nome</div>
              <div className="text-body-md text-ink">
                {session.fullName ?? "—"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <div className="text-caption text-muted">E-mail</div>
              <div className="text-body-md text-ink">{session.email ?? "—"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
              <Phone className="h-5 w-5" />
            </span>
            <div>
              <div className="text-caption text-muted">Telefone</div>
              <div className="text-body-md text-ink">Cadastre em "Conta"</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext}>
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
