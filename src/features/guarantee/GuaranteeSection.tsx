import { ShieldCheck } from "lucide-react";
import { GUARANTEE_PROMISE, GUARANTEE_POLICY } from "./copy";

/** Bloco "Sobre a garantia" para a página da unidade — card destacado com promessa + política. */
export function GuaranteeSection() {
  return (
    <section>
      <div className="rounded-md border border-success/20 bg-badge-confirmed-bg p-5 desktop:p-6">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/10">
            <ShieldCheck className="h-5 w-5 text-success" />
          </div>
          <div className="space-y-2">
            <h2 className="text-title-sm text-ink">Garantia de vaga Movepark</h2>
            <p className="text-body-sm font-semibold text-badge-confirmed-fg">{GUARANTEE_PROMISE}</p>
            <div className="space-y-1.5 text-body-sm text-body">
              {GUARANTEE_POLICY.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
