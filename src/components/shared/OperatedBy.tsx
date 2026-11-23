import { cn } from "@/lib/utils";
import { LOGO_WHITE_FILTER, type ParkingLogo } from "@/lib/parkingLogo";

type Props = {
  logo: ParkingLogo | null | undefined;
  /** Nome do estacionamento: vira o `alt`, para quem não vê a imagem. */
  name: string;
  /** Fundo onde a linha aparece. Define qual arquivo vai (docs/specs/logo-do-estacionamento.md). */
  background?: "light" | "dark";
  className?: string;
};

/**
 * "Operado por [logo]": o sinal discreto de quem cuida da vaga, para o cliente não confundir o
 * estacionamento com a Movepark (caso Pare Seguro, 23/11/2026). Em fundo escuro o logo sai todo
 * branco, seja qual for o arquivo. Sem logo, não renderiza nada: a tela fica como era antes.
 */
export function OperatedBy({ logo, name, background = "light", className }: Props) {
  const src = background === "dark" ? logo?.dark : logo?.light;
  if (!src) return null;
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-caption",
        background === "dark" ? "text-white/70" : "text-muted",
        className,
      )}
    >
      <span>Operado por</span>
      <img
        src={src}
        alt={name}
        loading="lazy"
        className="h-5 w-auto max-w-[112px] object-contain"
        style={background === "dark" ? { filter: LOGO_WHITE_FILTER } : undefined}
      />
    </p>
  );
}
