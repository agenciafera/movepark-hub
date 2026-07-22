import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { formatBRL } from "@/lib/format";
import type { UpgradeTarget } from "./upgrade.logic";

type Props = {
  target: UpgradeTarget;
  /** Link para a página do tipo alvo, com as datas preservadas. */
  to: string;
};

/**
 * Indução de upgrade de tipo de vaga (E2.1.4). Só sobe: quem já está no tipo mais caro não vê nada
 * (quem monta o `target` garante isso via pickUpgradeTarget). Pré-pagamento, então é só um link.
 */
export function UpgradeVagaNudge({ target, to }: Props) {
  return (
    <Link
      to={to}
      data-testid="listing-upgrade-offer"
      className="flex items-center gap-3 rounded-md border border-mp-primary/30 bg-mp-pale px-4 py-3 transition-colors hover:bg-mp-primary/10"
    >
      <Sparkles className="h-5 w-5 shrink-0 text-mp-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body-md font-semibold text-ink">
          Por mais{" "}
          <span data-testid="listing-upgrade-price-delta">{formatBRL(target.delta)}</span>, garanta a{" "}
          {target.name}
        </p>
        <p className="text-caption text-mp-primary">Ver {target.name}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-mp-primary" aria-hidden />
    </Link>
  );
}
