import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/context";
import { FaqAdminTable } from "@/features/faqs/FaqAdminTable";
import { FaqForm } from "@/features/faqs/FaqForm";
import { useFaqs } from "@/features/faqs/api";
import type { Faq } from "@/features/faqs/types";

function useOperatorLocations(companyId: string | undefined) {
  return useQuery({
    queryKey: ["operator-locations-faq", companyId ?? "none"],
    queryFn: async () => {
      if (!companyId) return [] as { id: string; name: string }[];
      const { data, error } = await supabase
        .from("location")
        .select("id, name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

export default function OperatorFaq() {
  const { effectiveCompanyIds } = useAuth();
  const companyId = effectiveCompanyIds[0];
  const locations = useOperatorLocations(companyId);

  const [locationFilter, setLocationFilter] = React.useState<string>("all");
  const [showGlobal, setShowGlobal] = React.useState(false);

  const myFaqs = useFaqs({
    scope: "location",
    companyId,
    locationId:
      locationFilter !== "all" ? locationFilter : undefined,
    includeUnpublished: true,
  });
  const globalFaqs = useFaqs({ scope: "global" });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Faq | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(faq: Faq) {
    setEditing(faq);
    setFormOpen(true);
  }

  const locationNames = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of locations.data ?? []) map[l.id] = l.name;
    return map;
  }, [locations.data]);

  const hasManyLocations = (locations.data ?? []).length > 1;
  const noLocations = !locations.isLoading && (locations.data ?? []).length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="FAQ"
        description="Perguntas e respostas específicas dos seus estacionamentos."
        actions={
          <Button onClick={openCreate} size="sm" disabled={noLocations}>
            <Plus className="h-4 w-4" />
            Nova pergunta
          </Button>
        }
      />

      {hasManyLocations && (
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="tablet:w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as unidades</SelectItem>
            {(locations.data ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {noLocations ? (
        <EmptyState
          title="Sem unidades vinculadas"
          description="Solicite à equipe Movepark a vinculação das suas unidades antes de cadastrar FAQs."
        />
      ) : (
        <FaqAdminTable
          rows={myFaqs.data}
          isLoading={myFaqs.isLoading}
          onEdit={openEdit}
          showLocation={hasManyLocations}
          locationNames={locationNames}
        />
      )}

      <section className="rounded-md border border-hairline bg-canvas">
        <button
          type="button"
          onClick={() => setShowGlobal((s) => !s)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          aria-expanded={showGlobal}
        >
          <div>
            <div className="text-title-md text-ink">FAQs gerais da Movepark</div>
            <div className="text-body-sm text-muted">
              Aparecem em todos os estacionamentos. Só a equipe Movepark edita.
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted transition-transform ${
              showGlobal ? "rotate-180" : ""
            }`}
          />
        </button>
        {showGlobal && (
          <div className="border-t border-hairline px-4 py-3">
            <FaqAdminTable
              rows={globalFaqs.data}
              isLoading={globalFaqs.isLoading}
              readOnly
              emptyTitle="Sem FAQs gerais"
            />
          </div>
        )}
      </section>

      <FaqForm
        open={formOpen}
        onOpenChange={setFormOpen}
        faq={editing}
        scope="location"
        lockCompanyId={companyId}
        defaultLocationId={
          locationFilter !== "all" ? locationFilter : undefined
        }
      />
    </div>
  );
}
