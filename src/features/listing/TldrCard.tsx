import { Bus, CalendarX, MapPin, Star, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ListingTldr, TldrFact } from "./tldr.logic";

const ICONS: Record<TldrFact["key"], LucideIcon> = {
  price: Tag,
  terminal: MapPin,
  shuttle: Bus,
  rating: Star,
  cancel: CalendarX,
};

/**
 * TLDR-first: bloco de resumo no topo da unidade (E3.2 · agent-readiness-seo).
 * Lidera com a frase-resumo e os fatos-chave em texto real (HTML), que é o que os
 * crawlers de IA extraem — reforçado pelo mesmo conteúdo no JSON-LD `description`.
 */
export function TldrCard({ tldr }: { tldr: ListingTldr }) {
  return (
    <section
      aria-label="Em resumo"
      className="rounded-lg border border-hairline bg-surface-soft p-5 desktop:p-6"
    >
      <p className="mb-3 text-caption-sm font-bold uppercase tracking-[0.4px] text-muted-steel">
        Em resumo
      </p>
      <p className="max-w-3xl text-body-md text-body">{tldr.summary}</p>
      <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 tablet:grid-cols-2">
        {tldr.facts.map((f) => {
          const Icon = ICONS[f.key];
          return (
            <li key={f.key} className="flex items-start gap-2 text-body-sm">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-mp-primary" />
              <span>
                <span className="text-muted">{f.label}: </span>
                <span className="font-medium text-ink">{f.value}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
