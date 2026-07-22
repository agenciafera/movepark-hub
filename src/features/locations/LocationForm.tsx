import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocationForm } from "./useLocationForm";
import { LocationSections } from "./LocationSections";
import type { Location } from "@/types/domain";

type Props = {
  open: boolean;
  companyId: string;
  location: Location | null;
  onOpenChange: (open: boolean) => void;
  editableScope?: "full" | "operator";
};

/**
 * Editor de localização em dialog.
 *
 * O painel do parceiro edita numa PÁGINA (`/operator/locations/:id/editar`):
 * são seis blocos de campos, e modal não é lugar pra isso. O dialog continua
 * aqui porque o manager também CRIA unidade a partir da empresa, e nesse fluxo
 * a sobreposição faz sentido. Os campos são os mesmos nos dois, via
 * `LocationSections`.
 */
export function LocationForm({
  open,
  companyId,
  location,
  onOpenChange,
  editableScope = "full",
}: Props) {
  const form = useLocationForm({
    companyId,
    location,
    operatorMode: editableScope === "operator",
    onSaved: () => onOpenChange(false),
  });

  const { reset } = form;
  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{form.isEdit ? "Editar localização" : "Nova localização"}</DialogTitle>
        </DialogHeader>
        <form className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto" onSubmit={form.submit}>
          <LocationSections form={form} companyId={companyId} location={location} />
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-hairline bg-canvas pt-3">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
