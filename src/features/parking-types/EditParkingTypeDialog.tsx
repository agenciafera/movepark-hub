import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGlobalParkingTypes, useUpdateCompanyParkingType } from "./api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** id de company_parking_type — a categoria vale pra empresa toda, não só pra esta unidade. */
  companyParkingTypeId: string;
  currentParkingTypeId: string;
};

/**
 * Reatribui QUAL tipo do catálogo uma empresa vende (não preço/capacidade, que já era
 * editável). Não existia caminho nenhum pra isso fora do onboarding — ver
 * supabase/migrations/20260819203903_vaga_avulsa_parking_type.sql, que abriu a policy de
 * escrita em company_parking_type com o mesmo escopo parking-types:write.
 */
export function EditParkingTypeDialog({
  open,
  onOpenChange,
  companyParkingTypeId,
  currentParkingTypeId,
}: Props) {
  const catalog = useGlobalParkingTypes();
  const updateCpt = useUpdateCompanyParkingType();
  const [selected, setSelected] = React.useState(currentParkingTypeId);

  React.useEffect(() => {
    if (open) setSelected(currentParkingTypeId);
  }, [open, currentParkingTypeId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || selected === currentParkingTypeId) {
      onOpenChange(false);
      return;
    }
    try {
      await updateCpt.mutateAsync({
        id: companyParkingTypeId,
        patch: { parking_type_id: selected },
      });
      toast.success("Tipo de vaga atualizado");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar tipo de vaga</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-pt-catalog">Tipo do catálogo</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="edit-pt-catalog">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(catalog.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-muted">
              Isso muda como esta vaga aparece na busca, nos filtros e nas páginas públicas
              da unidade.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!selected || updateCpt.isPending}>
              {updateCpt.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
