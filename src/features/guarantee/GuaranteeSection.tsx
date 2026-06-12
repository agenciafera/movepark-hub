import { ShieldCheck } from "lucide-react";
import { GUARANTEE_PROMISE, GUARANTEE_POLICY } from "./copy";

/** Bloco "Sobre a garantia" para a página da unidade (promessa + regra operacional). */
export function GuaranteeSection() {
  return (
    <section className="space-y-3">
      <h2 className="text-display-sm text-ink">Sobre a garantia</h2>
      <p className="inline-flex items-center gap-2 text-body-md text-ink">
        <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
        <strong>{GUARANTEE_PROMISE}</strong>
      </p>
      <div className="space-y-2 text-body-md text-body">
        {GUARANTEE_POLICY.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}
