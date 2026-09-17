import { Link } from "react-router-dom";
import { formatDate } from "@/lib/format";
import { caminhoPrecos } from "@/lib/urls";

type Props = {
  /** Dia do carimbo em `YYYY-MM-DD`, já cortado por `diaDoCarimbo`. */
  dia: string;
  /** `public_slug` do destino, quando a página de preços existe. */
  destinoSlug?: string | null;
};

/**
 * A linha de frescor do post que publica preço.
 *
 * Fica no cabeçalho, junto da data de publicação, e não no rodapé: é acima da dobra que o
 * leitor decide se confia no número, e é o primeiro bloco que o motor generativo extrai.
 *
 * O texto e o `dateModified` do schema saem do MESMO valor, por decisão: carimbo visível que
 * diverge do schema é a forma mais fácil de o site parecer mais fresco do que é.
 */
export function PriceFreshness({ dia, destinoSlug }: Props) {
  return (
    <p className="mt-2 text-caption-sm text-muted">
      Preços conferidos no motor de reservas em <time dateTime={dia}>{formatDate(dia)}</time>
      {destinoSlug && (
        <>
          {" · "}
          <Link to={caminhoPrecos(destinoSlug)} className="hover:underline">
            ver a tabela de hoje
          </Link>
        </>
      )}
    </p>
  );
}
