import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCompanyParkingTypes,
  useGlobalParkingTypes,
  useEnableCompanyParkingType,
  useCreateLocationParkingType,
} from "./api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  companyId: string;
  existingLocationParkingTypeIds: string[];
};

export function ParkingTypeForm({
  open,
  onOpenChange,
  locationId,
  companyId,
  existingLocationParkingTypeIds,
}: Props) {
  const companyTypes = useCompanyParkingTypes(companyId);
  const catalog = useGlobalParkingTypes();
  const enableForCompany = useEnableCompanyParkingType();
  const createForLocation = useCreateLocationParkingType();

  // Aba 1: habilitar tipo já cadastrado na empresa
  const available = (companyTypes.data ?? []).filter(
    (cpt) => !existingLocationParkingTypeIds.includes(cpt.id),
  );
  const [selectedCpt, setSelectedCpt] = React.useState<string>("");
  const [capacity, setCapacity] = React.useState<number>(10);

  // Aba 2: adicionar tipo novo do catálogo à empresa
  const enabledCodes = (companyTypes.data ?? []).map((c) => c.parking_type.code);
  const catalogAvailable = (catalog.data ?? []).filter((p) => !enabledCodes.includes(p.code));
  const [selectedCatalog, setSelectedCatalog] = React.useState<string>("");
  const [basePrice, setBasePrice] = React.useState<string>("0");
  const [defaultCapacity, setDefaultCapacity] = React.useState<number>(10);
  const [newCapacity, setNewCapacity] = React.useState<number>(10);

  React.useEffect(() => {
    if (open) {
      setSelectedCpt("");
      setCapacity(10);
      setSelectedCatalog("");
      setBasePrice("0");
      setDefaultCapacity(10);
      setNewCapacity(10);
    }
  }, [open]);

  async function handleAddExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCpt) return;
    try {
      await createForLocation.mutateAsync({
        location_id: locationId,
        company_parking_type_id: selectedCpt,
        capacity,
      });
      toast.success("Tipo de vaga adicionado");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  async function handleAddFromCatalog(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCatalog) return;
    try {
      const price = Number(basePrice.replace(",", "."));
      const cpt = await enableForCompany.mutateAsync({
        company_id: companyId,
        parking_type_id: selectedCatalog,
        base_price: Number.isNaN(price) ? 0 : price,
        default_capacity: defaultCapacity,
      });
      await createForLocation.mutateAsync({
        location_id: locationId,
        company_parking_type_id: cpt.id,
        capacity: newCapacity,
      });
      toast.success("Tipo habilitado e adicionado à localização");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const submittingExisting = createForLocation.isPending;
  const submittingNew = enableForCompany.isPending || createForLocation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Adicionar tipo de vaga</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="existing">
          <TabsList>
            <TabsTrigger value="existing">Da empresa</TabsTrigger>
            <TabsTrigger value="catalog">Novo do catálogo</TabsTrigger>
          </TabsList>

          <TabsContent value="existing">
            {companyTypes.isLoading ? (
              <p className="text-body-sm text-muted">Carregando…</p>
            ) : available.length === 0 ? (
              <p className="text-body-sm text-muted">
                Todos os tipos da empresa já foram adicionados a esta localização. Use a aba
                "Novo do catálogo" para habilitar um novo.
              </p>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={handleAddExisting}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pt-kind">Tipo de vaga</Label>
                  <Select value={selectedCpt} onValueChange={setSelectedCpt}>
                    <SelectTrigger id="pt-kind">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((cpt) => (
                        <SelectItem key={cpt.id} value={cpt.id}>
                          {cpt.parking_type.name} ({cpt.parking_type.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cap">Capacidade nesta localização</Label>
                  <Input
                    id="cap"
                    type="number"
                    min={0}
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!selectedCpt || submittingExisting}>
                    {submittingExisting ? "Salvando…" : "Adicionar"}
                  </Button>
                </div>
              </form>
            )}
          </TabsContent>

          <TabsContent value="catalog">
            {catalog.isLoading ? (
              <p className="text-body-sm text-muted">Carregando…</p>
            ) : catalogAvailable.length === 0 ? (
              <p className="text-body-sm text-muted">
                A empresa já tem todos os tipos do catálogo habilitados.
              </p>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={handleAddFromCatalog}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pt-catalog">Tipo do catálogo</Label>
                  <Select value={selectedCatalog} onValueChange={setSelectedCatalog}>
                    <SelectTrigger id="pt-catalog">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogAvailable.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="bp">Preço base da empresa (R$)</Label>
                    <Input
                      id="bp"
                      type="number"
                      step="0.01"
                      min={0}
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="dc">Capacidade padrão</Label>
                    <Input
                      id="dc"
                      type="number"
                      min={0}
                      value={defaultCapacity}
                      onChange={(e) => setDefaultCapacity(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 tablet:col-span-2">
                    <Label htmlFor="nc">Capacidade nesta localização</Label>
                    <Input
                      id="nc"
                      type="number"
                      min={0}
                      value={newCapacity}
                      onChange={(e) => setNewCapacity(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!selectedCatalog || submittingNew}>
                    {submittingNew ? "Salvando…" : "Habilitar e adicionar"}
                  </Button>
                </div>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
