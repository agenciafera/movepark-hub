import { cn } from "@/lib/utils";

/**
 * Ícone de acessibilidade do projeto. É a figura que a marca usa em qualquer lugar
 * que fale de vaga PCD, no lugar do `Accessibility` do lucide.
 *
 * Três ajustes em cima do arquivo original:
 *
 * - `fill="currentColor"` no lugar do `#000000` cravado, pra ele herdar a cor do
 *   texto como os outros ícones e funcionar no tema escuro.
 * - Sem `width`/`height` fixos (o original vinha em 800px): o tamanho vem da classe,
 *   igual ao lucide (`h-5 w-5`).
 * - Sem `<title>`: título dentro do SVG vira tooltip e nome acessível fora de hora.
 *   Por padrão o ícone é decorativo (`aria-hidden`); quando ele for a única coisa que
 *   comunica o sentido, passe `label` e ele vira `img` com nome.
 *
 * O `viewBox` original (`-7.5 0 32 32`) fica como está: é ele que centraliza o
 * desenho, que foi traçado fora da origem.
 */
type Props = {
  className?: string;
  /** Passe quando o ícone carregar sentido sozinho, sem texto ao lado. */
  label?: string;
};

export function AccessibilityIcon({ className, label }: Props) {
  return (
    <svg
      viewBox="-7.5 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-5 w-5 shrink-0", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path d="M10.64 21.2c-0.44-0.12-0.88 0.16-1 0.6-0.48 1.76-2.080 3-3.92 3-2.24 0-4.040-1.8-4.040-4.040 0-1.56 0.88-2.96 2.28-3.64 0.4-0.2 0.6-0.72 0.4-1.12s-0.72-0.6-1.12-0.4c-1.96 0.96-3.2 2.92-3.2 5.12 0 3.16 2.56 5.72 5.72 5.72 2.6 0 4.88-1.76 5.52-4.28 0.080-0.4-0.2-0.84-0.64-0.96zM16.64 22.040c-0.2-0.4-0.72-0.56-1.12-0.36l-1 0.52-2.32-4c-0.16-0.24-0.44-0.4-0.72-0.4h-3.88l-0.12-1.040h3.080c0.44 0 0.84-0.36 0.84-0.84s-0.36-0.84-0.84-0.84h-3.24l-0.32-3.12c-0.040-0.44-0.44-0.8-0.92-0.76-0.44 0.040-0.8 0.44-0.76 0.92l0.68 6.6c0.040 0.44 0.4 0.76 0.84 0.76h4.16l2.48 4.28c0.16 0.28 0.44 0.4 0.72 0.4 0.12 0 0.24-0.040 0.4-0.080l1.72-0.88c0.36-0.24 0.52-0.76 0.32-1.16zM5.84 10.36c1.32 0 2.4-1.080 2.4-2.4s-1.080-2.4-2.4-2.4c-1.32 0-2.4 1.080-2.4 2.4s1.080 2.4 2.4 2.4zM5.84 7.2c0.4 0 0.72 0.32 0.72 0.72s-0.32 0.72-0.72 0.72c-0.4 0-0.72-0.32-0.72-0.72s0.32-0.72 0.72-0.72z" />
    </svg>
  );
}
