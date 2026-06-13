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
import { groupFaqsByScope } from "./FaqList.logic";

type Props = {
  items: FaqCombinedItem[] | undefined;
  isLoading?: boolean;
  /** Quando true, agrupa por camada: unidade, destino e perguntas gerais. */
  groupByScope?: boolean;
  /** Rótulo do grupo de destino (ex.: "Sobre Viracopos"). Default: "Sobre o destino". */
  destinationLabel?: string;
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
  destinationLabel,
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

  const groups = groupFaqsByScope(items);

  return (
    <div className="space-y-6">
      {groups.location.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-title-md text-ink">Sobre este estacionamento</h3>
          <RenderAccordion items={groups.location} query={query} idPrefix="loc" />
        </div>
      )}
      {groups.destination.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-title-md text-ink">{destinationLabel ?? "Sobre o destino"}</h3>
          <RenderAccordion items={groups.destination} query={query} idPrefix="dest" />
        </div>
      )}
      {groups.global.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-title-md text-ink">Perguntas gerais</h3>
          <RenderAccordion items={groups.global} query={query} idPrefix="gen" />
        </div>
      )}
    </div>
  );
}
