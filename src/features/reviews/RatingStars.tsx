import { Star } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ratingLabel } from "./reviews.logic";

const SIZE = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-7 w-7" };

/** 5 estrelas. Com `onChange` vira seletor; sem, é só exibição. Estrela em ink. */
export function RatingStars({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: keyof typeof SIZE;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Star className={cn(SIZE[size], filled ? "fill-ink text-ink" : "text-hairline")} />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
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
