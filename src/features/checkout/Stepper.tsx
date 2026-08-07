import { Fragment } from "react";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { CheckoutStep } from "./checkout.logic";

const LABELS: Record<CheckoutStep, string> = {
  1: "Identificação",
  2: "Veículo",
  3: "Adicionais",
  4: "Pagamento",
  5: "Confirmação",
};

type Props = {
  current: CheckoutStep;
  /** Sequência que a unidade tem de fato, vinda de `visibleSteps(hasAddons)`. */
  steps: CheckoutStep[];
};

/**
 * Medidor de progresso do checkout.
 *
 * O conector é um item próprio da lista, não um filho do passo. Dentro do passo ele
 * só podia esticar até a borda daquele item, e como os rótulos têm larguras bem
 * diferentes ("Identificação" contra "Veículo") as linhas saíam desiguais, de 17px a
 * 55px na mesma régua. Solto, ele divide com os outros conectores a sobra da régua
 * inteira e todos ficam do mesmo tamanho. Fica `aria-hidden` porque é decoração: o
 * leitor de tela enxerga só os passos.
 *
 * Elástico também resolve o tablet, onde os rótulos aparecem e somam uns 380px:
 * com largura fixa a régua estourava o container.
 *
 * O número exibido é a posição na sequência, não o id do passo, senão a unidade sem
 * adicionais mostraria 1, 2, 4, 5.
 */
export function Stepper({ current, steps }: Props) {
  return (
    <ol className="mx-auto flex w-full max-w-[760px] items-center">
      {steps.map((id, i) => {
        const completed = id < current;
        const active = id === current;
        return (
          <Fragment key={id}>
            {i > 0 && (
              <li
                aria-hidden
                className={cn(
                  "mx-2 h-px min-w-2 flex-1",
                  // Verde quando o passo anterior já ficou pra trás.
                  steps[i - 1] < current ? "bg-success" : "bg-hairline",
                )}
              />
            )}
            <li
              className="flex shrink-0 items-center gap-2"
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
                  completed
                    ? "bg-success text-white"
                    : active
                      ? "bg-mp-primary text-white"
                      : "border border-hairline bg-canvas text-muted",
                )}
              >
                {completed ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden whitespace-nowrap text-body-sm tablet:inline",
                  active ? "font-medium text-ink" : completed ? "text-ink" : "text-muted",
                )}
              >
                {LABELS[id]}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
