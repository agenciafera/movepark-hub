import * as React from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FaqAdminTable } from "@/features/faqs/FaqAdminTable";
import { FaqForm } from "@/features/faqs/FaqForm";
import { useFaqs } from "@/features/faqs/api";
import type { Faq } from "@/features/faqs/types";
import type { Destination } from "@/types/domain";

type Props = { open: boolean; destination: Destination | null; onOpenChange: (open: boolean) => void };

/**
 * Aba "FAQ" do admin do destino (ADR-002): edita só as FAQs `destination` daquele
 * aeroporto, em contexto. As `global` aparecem como referência somente-leitura
 * ("já coberto pelo hub") — editar a global continua no admin central de FAQ.
 */
export function DestinationFaqDialog({ open, destination, onOpenChange }: Props) {
  const destinationId = destination?.id;
  const destFaqs = useFaqs({
    scope: "destination",
    destinationId: open ? destinationId : undefined,
    includeUnpublished: true,
  });
  const globalFaqs = useFaqs({ scope: "global" });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Faq | null>(null);

  React.useEffect(() => {
    if (!open) {
      setFormOpen(false);
      setEditing(null);
    }
  }, [open]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(faq: Faq) {
    setEditing(faq);
    setFormOpen(true);
  }

  const label = destination?.short_name ?? destination?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>FAQ{label ? ` — ${label}` : ""}</DialogTitle>
          <DialogDescription>
            Perguntas específicas deste destino. Aparecem na página do destino e nas unidades dele,
            junto das gerais da Movepark.
          </DialogDescription>
        </DialogHeader>

        {!destinationId ? (
          <p className="text-body-sm text-muted">Salve o destino antes de cadastrar FAQs.</p>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-title-sm text-ink">Deste destino</h3>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nova pergunta
                </Button>
              </div>
              <FaqAdminTable
                rows={destFaqs.data}
                isLoading={destFaqs.isLoading}
                emptyTitle="Nenhuma pergunta deste destino"
                emptyDescription="Crie a primeira clicando em “Nova pergunta”."
                onEdit={openEdit}
              />
            </div>

            <div className="space-y-2">
              <h3 className="text-title-sm text-ink">Gerais da Movepark (referência)</h3>
              <p className="text-body-sm text-muted">
                Já cobertas pelo hub e exibidas em toda página. Edite-as no admin central de FAQ.
              </p>
              <FaqAdminTable
                rows={globalFaqs.data}
                isLoading={globalFaqs.isLoading}
                emptyTitle="Sem perguntas gerais"
                readOnly
              />
            </div>
          </div>
        )}

        <FaqForm
          open={formOpen}
          onOpenChange={setFormOpen}
          faq={editing}
          scope="destination"
          defaultDestinationId={destinationId}
        />
      </DialogContent>
    </Dialog>
  );
}
