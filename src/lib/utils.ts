import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Degraus de `fontSize` do projeto (o bloco `theme.extend.fontSize` do
 * `tailwind.config.ts`). O tailwind-merge precisa dessa lista explícita.
 *
 * Sem ela, o merge resolve `text-*` pelo default dele (t-shirt sizes: `text-sm`,
 * `text-lg`…), não reconhece `text-caption` como tamanho e, pior, trata
 * `text-badge-confirmed-fg` como se fosse do MESMO grupo de `text-badge`. O
 * resultado é apagamento silencioso: `cn("... text-caption", "text-badge-confirmed-fg")`
 * devolvia a string SEM o `text-caption`, e todo Badge do app renderizava no
 * tamanho herdado do container em vez do tamanho do token.
 *
 * Mantenha em lockstep com o `tailwind.config.ts`. O teste em `utils.test.ts`
 * cruza as duas listas e falha se divergirem.
 */
export const FONT_SIZE_TOKENS = [
  "rating-display",
  "display-3xl",
  "display-2xl",
  "display-xl",
  "display-lg",
  "display-md",
  "display-sm",
  "title-md",
  "title-sm",
  "body-md",
  "body-sm",
  "caption",
  "caption-sm",
  "badge",
  "tab-label",
  "micro-label",
  "uppercase-tag",
  "button-md",
  "button-sm",
  "link",
  "nav-link",
] as const;

// `extend` e não `override`: os degraus do projeto ENTRAM no grupo font-size,
// sem expulsar os nativos do Tailwind (`text-sm`, `text-lg`…), que o código
// ainda usa em vários pontos.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZE_TOKENS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
