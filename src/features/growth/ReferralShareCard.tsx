import * as React from "react";
import { toast } from "sonner";
import { Gift, Share2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { useReferrals } from "./api";

/**
 * Card compacto e fixo do Indique e Ganhe — pensado pra viver na sidebar da
 * conta (e no menu mobile), sempre visível, pra o cliente achar fácil o
 * compartilhamento. Versão enxuta do bloco completo em MotorCrescimento.
 */
export function ReferralShareCard({ className }: { className?: string }) {
  const { session } = useAuth();
  const { data, isLoading } = useReferrals(!!session?.userId);
  const [copiado, setCopiado] = React.useState(false);

  if (!session?.userId) return null;

  function copiar() {
    if (!data) return;
    void navigator.clipboard?.writeText(data.link);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
    toast.success("Link de indicação copiado.", { position: "top-center" });
  }

  function compartilhar() {
    if (!data) return;
    const msg =
      `Ganhei um presente pra você no Movepark: R$ 25 de desconto na sua 1ª reserva. ` +
      `É só usar meu link: ${data.link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  return (
    <div
      className={cn(
        "rounded-md border border-hairline bg-surface-pale p-4",
        className,
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-mp-indigo">
        <Gift className="h-4 w-4" />
        <span className="text-micro-label uppercase tracking-wide">Indique e ganhe</span>
      </div>
      <p className="text-title-sm text-ink">Dê R$ 25, ganhe R$ 25</p>
      <p className="mt-0.5 text-caption-sm text-muted">
        Compartilhe o Movepark com quem dirige.
      </p>

      {isLoading || !data ? (
        <div className="mt-3 h-9 animate-pulse rounded-sm bg-surface-soft" />
      ) : (
        <>
          <button
            type="button"
            onClick={compartilhar}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-sm bg-mp-primary text-button-sm font-medium text-white transition-colors hover:bg-mp-primary-active"
          >
            <Share2 className="h-4 w-4" />
            Compartilhar
          </button>
          <button
            type="button"
            onClick={copiar}
            className="mt-2 flex w-full items-center justify-center gap-1.5 text-caption-sm text-muted transition-colors hover:text-ink"
          >
            {copiado ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="font-mono">{data.code}</span>
            <span>· {copiado ? "copiado" : "copiar link"}</span>
          </button>
        </>
      )}
    </div>
  );
}
