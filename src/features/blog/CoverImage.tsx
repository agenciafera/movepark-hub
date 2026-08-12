import { imageSrcSet, optimizedImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  /**
   * Texto alternativo da capa. Obrigatório: a capa é a única imagem do post que
   * não vem do corpo, e sem alt ela some para quem lê por leitor de tela e para
   * o buscador. No card do índice ela também é o que dá nome ao link.
   */
  alt: string;
  /** Larguras do `srcset`, na ordem em que o browser vai escolher. */
  widths: number[];
  /** Dica de tamanho do slot, para o browser não baixar mais do que precisa. */
  sizes: string;
  className?: string;
  /** A capa do post é o LCP da página; o card do índice pode esperar. */
  eager?: boolean;
};

/**
 * Capa de post, sem corte e sem tarja.
 *
 * As capas vieram do WordPress em proporções que vão de 1:1 a 2,12:1, e boa parte
 * é banner com a manchete gravada dentro da imagem. Recortar para a caixa cortava
 * o texto em 104 das 131 imagens; usar só `contain` resolvia o corte e deixava 31
 * delas com tarja chapada, as quadradas preenchendo 67% da caixa.
 *
 * A imagem entra duas vezes: uma cópia minúscula desfocada preenchendo o fundo, e
 * a imagem inteira por cima. O fundo pede as DUAS dimensões (24x16, a proporção da
 * caixa) porque o render do Supabase não preserva proporção com só a largura: com
 * `?width=16` ele devolve uma tira de 16x1067, e borrada isso vira listra em vez
 * de borrão. Custa 392 bytes contra 34 KB da imagem principal.
 *
 * **Dentro de um flex em linha, passe `self-start`.** A caixa segura a proporção
 * pelo `aspect-ratio`, e altura definida vence `aspect-ratio`: como item de flex
 * ela estica até a altura da linha e a imagem cresce junto com o texto ao lado.
 * Foi o que aconteceu na lateral do post, onde a miniatura ia de 64 para 120px
 * dependendo do tamanho do título.
 */
export function CoverImage({ src, alt, widths, sizes, className, eager }: Props) {
  return (
    <div className={cn("relative aspect-[3/2] w-full overflow-hidden bg-surface-soft", className)}>
      <img
        src={optimizedImageUrl(src, { width: 24, height: 16, quality: 30, resize: "cover" })}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
      />
      <img
        src={optimizedImageUrl(src, { width: widths[widths.length - 1], resize: "contain" })}
        srcSet={imageSrcSet(src, widths)}
        sizes={sizes}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="relative h-full w-full object-contain"
      />
    </div>
  );
}
