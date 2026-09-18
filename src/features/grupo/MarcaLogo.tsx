import { cn } from "@/lib/utils";
import { MARCAS } from "./marcas";
import { Go2MedWordmark, CooparkWordmark } from "./Wordmark";

/**
 * O logo de cada marca, na mesma altura óptica.
 *
 * Duas marcas têm arquivo oficial (Movepark e Go2Park) e duas têm wordmark provisório
 * inline (ver `Wordmark.tsx`). A altura é diferente por marca de propósito, pelo mesmo
 * motivo do mural de parceiros: logo mais quadrado precisa entrar mais alto para pesar
 * igual ao lado de um logo deitado.
 */
export function MarcaLogo({ id, className }: { id: string; className?: string }) {
  // O texto alternativo é o nome da MARCA, não o do arquivo: no cartão do produto o
  // logo da casa representa o "Movepark Hub", e quem usa leitor de tela precisa ouvir
  // o nome do produto que está sendo apresentado ali.
  const nome = MARCAS.find((m) => m.id === id)?.nome ?? "";

  switch (id) {
    case "movepark-hub":
      return (
        <img
          src="/brand/logo-movepark.svg"
          alt={nome}
          className={cn("h-6 w-auto desktop:h-7", className)}
          loading="lazy"
          decoding="async"
        />
      );
    case "go2park":
      return (
        <img
          src="/brand/logo-go2park.png"
          alt={nome}
          className={cn("h-5 w-auto desktop:h-6", className)}
          loading="lazy"
          decoding="async"
        />
      );
    case "go2med":
      return <Go2MedWordmark className={cn("h-6 desktop:h-7", className)} />;
    case "coopark":
      return <CooparkWordmark className={cn("h-6 desktop:h-7", className)} />;
    default:
      return null;
  }
}
