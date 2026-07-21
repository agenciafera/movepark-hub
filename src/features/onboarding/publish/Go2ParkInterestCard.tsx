import * as React from "react";
import { toast } from "sonner";
import { Check, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubmitGo2ParkInterest } from "@/features/onboarding/go2parkApi";

/**
 * Oferta do produto irmão Go2Park (rastreio de vans de transfer em tempo real).
 * Aparece no passo de transfer, para quem tem van. Ao marcar interesse, dispara o
 * lead para a Go2Park e mostra o estado confirmado (ação de mão única, sem desfazer).
 */
export function Go2ParkInterestCard({ companyId }: { companyId: string }) {
  const submit = useSubmitGo2ParkInterest();
  const [done, setDone] = React.useState(false);

  async function express() {
    try {
      await submit.mutateAsync(companyId);
      setDone(true);
      toast.success("Interesse registrado. A Go2Park vai te procurar.");
    } catch {
      toast.error("Não deu pra registrar agora. Tente de novo.");
    }
  }

  return (
    <div className="rounded-md border border-mp-primary/30 bg-mp-pale p-4">
      <div className="flex items-start gap-3">
        <Radar className="mt-0.5 h-5 w-5 shrink-0 text-mp-indigo" />
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-body-sm font-medium text-ink">Rastreie suas vans em tempo real</p>
            <p className="mt-0.5 text-caption text-muted">
              A Go2Park mostra suas vans de transfer ao vivo pro cliente. É um produto irmão nosso.
              Marque interesse e a gente te apresenta.
            </p>
          </div>
          {done ? (
            <span className="flex w-fit items-center gap-1.5 rounded-sm bg-mp-primary/10 px-2.5 py-1 text-caption font-medium text-mp-indigo">
              <Check className="h-3.5 w-3.5" /> Interesse registrado
            </span>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={express}
              disabled={submit.isPending}
            >
              {submit.isPending ? "Registrando…" : "Tenho interesse"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
