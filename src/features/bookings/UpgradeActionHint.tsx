import { ArrowUpRight } from "lucide-react";

type Props = {
  /** Rótulo da ação bloqueada, ex.: "Alterar datas". */
  action: string;
  onUpgrade: () => void;
};

/**
 * Convite discreto de upgrade no lugar de uma ação que a Tarifa Básica não inclui (E2.8-j).
 * Materializa o valor no ponto da necessidade: em vez de sumir o botão, mostra "disponível na Flex".
 */
export function UpgradeActionHint({ action, onUpgrade }: Props) {
  return (
    <button
      type="button"
      onClick={onUpgrade}
      className="mt-4 flex w-full items-center justify-between gap-3 rounded-md border border-dashed border-hairline p-3 text-left transition-colors hover:border-mp-indigo/50"
    >
      <span className="text-body-sm text-muted">
        {action} <span className="text-ink">disponível na Flex</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-caption font-medium text-mp-indigo">
        Fazer upgrade
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </button>
  );
}
