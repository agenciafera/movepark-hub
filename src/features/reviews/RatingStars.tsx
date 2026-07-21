import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
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
        const star = (
          <Star className={cn(SIZE[size], filled ? "fill-ink text-ink" : "text-hairline")} />
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
}: {
  avg: number | null | undefined;
  count: number | null | undefined;
  className?: string;
  /** Quando informado, vira link-âncora (ex.: "#avaliacoes") para a seção de reviews. */
  href?: string;
}) {
  const label = ratingLabel(avg, count);
  if (!label) return null;
  const base = "inline-flex items-center gap-1 tabular-nums text-ink";
  if (href) {
    return (
      <a href={href} className={cn(base, "underline-offset-2 hover:underline", className)}>
        <Star className="h-3.5 w-3.5 fill-ink text-ink" />
        {label}
      </a>
    );
  }
  return (
    <span className={cn(base, className)}>
      <Star className="h-3.5 w-3.5 fill-ink text-ink" />
      {label}
    </span>
  );
}
