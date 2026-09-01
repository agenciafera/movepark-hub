import { Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatRating } from "@/lib/format";
import { ratingLabel } from "./reviews.logic";

const SIZE = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-7 w-7" };

/**
 * 5 estrelas. Com `onChange` vira seletor; sem, é só exibição. Estrela em ink.
 *
 * Quando é seletor, o grupo vira um `radiogroup` e cada estrela um `radio` com
 * `aria-checked`, para o leitor de tela anunciar "grupo, N de 5". Dê um nome ao
 * grupo via `aria-label` ou `aria-labelledby` (senão o leitor não sabe do que é
 * a nota).
 */
export function RatingStars({
  value,
  onChange,
  size = "md",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: keyof typeof SIZE;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const interactive = !!onChange;
  return (
    <div
      className="flex items-center gap-0.5"
      role={interactive ? "radiogroup" : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      aria-labelledby={interactive ? ariaLabelledby : undefined}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        // A estrela cheia é OUTRO GLIFO, não a mesma com `fill` no CSS. No Lucide o desenho
        // era um traço e `fill-current` preenchia o miolo; no Phosphor o peso `regular` já é
        // o contorno fechado, então `fill-ink` só pintava a moldura e nota 4 saía igual a
        // nota 0. Quem troca cheia por vazia aqui é o `weight`.
        const star = (
          <Star
            weight={filled ? "fill" : "regular"}
            className={cn(SIZE[size], filled ? "text-ink" : "text-hairline")}
          />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            onClick={() => onChange(n)}
            className="cursor-pointer"
            aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
          >
            {star}
          </button>
        ) : (
          <span key={n} className="pointer-events-none">
            {star}
          </span>
        );
      })}
    </div>
  );
}

/** Selo compacto "★ 4,8 · 248 avaliações" (card / topo do detalhe). Some sem avaliações. */
export function RatingBadge({
  avg,
  count,
  className,
  href,
  suffix,
}: {
  avg: number | null | undefined;
  count: number | null | undefined;
  className?: string;
  /** Quando informado, vira link-âncora (ex.: "#avaliacoes") para a seção de reviews. */
  href?: string;
  /** Rótulo da fonte, quando a nota não é da Movepark. Ex.: "no Google". */
  suffix?: string;
}) {
  const label = ratingLabel(avg, count);
  if (!label) return null;
  const base = "inline-flex items-center gap-1 tabular-nums text-ink";
  // Uma variável só para o sufixo, e não a mesma marcação repetida nos dois ramos: quando
  // cada ramo tinha a sua, o de âncora saiu com "· no Google" e o de span com "no Google"
  // colado na contagem. Mesma prop, duas saídas.
  const suffixNode = suffix ? <span className="text-muted">· {suffix}</span> : null;
  if (href) {
    return (
      <a href={href} className={cn(base, "underline-offset-2 hover:underline", className)}>
        <Star weight="fill" className="h-3.5 w-3.5 text-ink" />
        {label}
        {suffixNode}
      </a>
    );
  }
  return (
    <span className={cn(base, className)}>
      <Star weight="fill" className="h-3.5 w-3.5 text-ink" />
      {label}
      {suffixNode}
    </span>
  );
}

/**
 * Resumo do rating no topo da seção de avaliações da interna: a nota média grande,
 * as 5 estrelas e a contagem. É o único lugar que usa o token `rating-display`
 * (64/900), o momento tipográfico alto da marca reservado ao rating da listing
 * (ver skill `harmonizar-paginas`). Some sem avaliações.
 *
 * A11y: o bloco inteiro é um `img` rotulado ("Nota 4,8 de 5, 248 avaliações"); o
 * número e as estrelas ficam `aria-hidden` pra não repetir a nota no leitor de tela.
 */
export function RatingSummary({
  avg,
  count,
  className,
}: {
  avg: number | null | undefined;
  count: number | null | undefined;
  className?: string;
}) {
  if (avg == null || !count) return null;
  const countLabel = `${count} ${count === 1 ? "avaliação" : "avaliações"}`;
  return (
    <div
      className={cn("flex items-center gap-4", className)}
      role="img"
      aria-label={`Nota ${formatRating(avg)} de 5, ${countLabel}`}
    >
      <span className="text-rating-display leading-none text-ink tabular-nums" aria-hidden>
        {formatRating(avg)}
      </span>
      <div className="space-y-1" aria-hidden>
        <RatingStars value={Math.round(avg)} size="md" />
        <p className="text-body-sm text-muted">{countLabel}</p>
      </div>
    </div>
  );
}
