import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FaqCombinedItem } from "./api";

type Props = {
  items: FaqCombinedItem[] | undefined;
  isLoading?: boolean;
  /** Quando true, mostra dois grupos: "Sobre este estacionamento" e "Perguntas gerais". */
  groupByScope?: boolean;
  /** Quando true, filtra silenciosamente FAQs sem categoria pra agrupar por categoria. */
  groupByCategory?: boolean;
  query?: string;
};

function highlight(text: string, q: string | undefined) {
  if (!q || q.trim().length < 2) return text;
  const re = new RegExp(`(${q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-mp-pale px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

function RenderAccordion({
  items,
  query,
  idPrefix,
}: {
  items: FaqCombinedItem[];
  query?: string;
  idPrefix?: string;
}) {
  return (
    <Accordion type="multiple">
      {items.map((f) => (
        <AccordionItem key={f.id} value={f.id} id={`${idPrefix ?? "faq"}-${f.id}`}>
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              {highlight(f.question, query)}
              {f.category && (
                <Badge tone="neutral" className="hidden sm:inline-flex">
                  {f.category.label}
                </Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="whitespace-pre-wrap text-body-md text-body">
              {highlight(f.answer, query)}
            </p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function FaqList({
  items,
  isLoading,
  groupByScope = false,
  query,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <EmptyState
        title="Nada encontrado"
        description={
          query
            ? "Tenta outros termos ou outra categoria."
            : "Ainda não temos perguntas nessa categoria."
        }
      />
    );
  }

  if (!groupByScope) {
    return <RenderAccordion items={items} query={query} />;
  }

  const locationItems = items.filter(
    (i) => i.scope === "location" || i.scope === "auto",
  );
  const globalItems = items.filter((i) => i.scope === "global");

  return (
    <div className="space-y-6">
      {locationItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-title-md text-ink">Sobre este estacionamento</h3>
          <RenderAccordion items={locationItems} query={query} idPrefix="loc" />
        </div>
      )}
      {globalItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-title-md text-ink">Perguntas gerais</h3>
          <RenderAccordion items={globalItems} query={query} idPrefix="gen" />
        </div>
      )}
    </div>
  );
}
