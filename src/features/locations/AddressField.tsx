import * as React from "react";
import { MapPin, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GooglePlacesAutocomplete,
  isGooglePlacesEnabled,
} from "@/components/shared/GooglePlacesAutocomplete";
import { LocationMapPreview } from "@/components/shared/LocationMapPreview";

export type AddressValue = {
  address: string;
  complement: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Endereço da unidade em dois estados: DISPLAY read-only (o que está salvo, com
 * o mapa) e um MODAL que isola a captura sensível (Places + complemento + geo).
 *
 * Por que o modal: o `PlaceAutocompleteElement` do Google renderiza como um
 * campo de busca vazio, então mostrar o autocomplete inline fazia o endereço
 * atual "sumir" da tela, e uma tecla no lugar errado zerava lat/lng. Aqui o
 * endereço fica visível como texto, e editar é um ato explícito.
 *
 * O modal NÃO grava no banco: ao salvar, devolve o valor pro formulário-pai via
 * `onChange`, e o "Salvar alterações" da página persiste tudo junto (um caminho
 * de save só, preserva a guarda de saída da página).
 */
export function AddressField({
  value,
  onChange,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const hasAddress = value.address.trim() !== "";

  return (
    <div className="flex flex-col gap-2 tablet:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Endereço</Label>
        {hasAddress && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar endereço
          </Button>
        )}
      </div>

      {hasAddress ? (
        <div className="flex flex-col gap-3 rounded-md border border-hairline bg-canvas p-4">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <div className="flex flex-col">
              <p className="text-body-sm text-ink">{value.address}</p>
              {value.complement.trim() && (
                <p className="text-caption text-muted">{value.complement}</p>
              )}
              {value.latitude == null && (
                <p className="text-caption text-warning">
                  Sem ponto no mapa. Edite e escolha o endereço na busca.
                </p>
              )}
            </div>
          </div>
          <LocationMapPreview latitude={value.latitude} longitude={value.longitude} />
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-hairline bg-surface-soft p-4">
          <p className="text-body-sm text-muted">
            Nenhum endereço cadastrado. Sem endereço, a unidade não aparece direito na busca.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <MapPin className="h-4 w-4" />
            Adicionar endereço
          </Button>
        </div>
      )}

      <AddressEditDialog
        open={open}
        initial={value}
        onCancel={() => setOpen(false)}
        onSave={(next) => {
          onChange(next);
          setOpen(false);
        }}
      />
    </div>
  );
}

/**
 * Modal de captura. Trabalha num RASCUNHO próprio, semeado do valor atual ao
 * abrir: cancelar descarta, salvar devolve. Assim a busca do Places começa
 * limpa (você procura um endereço novo) sem apagar o que já estava no form.
 */
function AddressEditDialog({
  open,
  initial,
  onCancel,
  onSave,
}: {
  open: boolean;
  initial: AddressValue;
  onCancel: () => void;
  onSave: (next: AddressValue) => void;
}) {
  const [draft, setDraft] = React.useState<AddressValue>(initial);

  // Reseta o rascunho a cada abertura (só por `open`, não por identidade de
  // `initial`, pra não sobrescrever o que a pessoa digita no modal aberto).
  React.useEffect(() => {
    if (open) setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch: Partial<AddressValue>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Endereço da unidade</DialogTitle>
          <DialogDescription>
            Busque o endereço para fixar o ponto no mapa. O complemento é o que o mapa não sabe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr-search">Buscar endereço</Label>
            <GooglePlacesAutocomplete
              id="addr-search"
              value={draft.address}
              onChange={(a) => set({ address: a })}
              onSelect={(p) =>
                set({ address: p.address, latitude: p.latitude, longitude: p.longitude })
              }
            />
            {isGooglePlacesEnabled && (
              <p className="text-caption text-muted">
                Escolha um resultado na lista. Você pode ajustar o texto depois, sem perder o ponto.
              </p>
            )}
          </div>

          {/* Texto do endereço editável: lotes "s/n", "km 12" etc. o Places
              formata errado. Ajustar o texto NÃO mexe no pin, que já veio da
              busca. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr-text">Endereço (como aparece pro cliente)</Label>
            <Input
              id="addr-text"
              value={draft.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="Rua, número, bairro, cidade - UF"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr-complement">Complemento / ponto de referência (opcional)</Label>
            <Input
              id="addr-complement"
              value={draft.complement}
              onChange={(e) => set({ complement: e.target.value })}
              placeholder="Ex.: entrada pela rua lateral, portão azul"
            />
          </div>

          {!isGooglePlacesEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addr-lat">Latitude</Label>
                <Input
                  id="addr-lat"
                  inputMode="decimal"
                  value={draft.latitude ?? ""}
                  onChange={(e) =>
                    set({ latitude: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="-23.5505"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addr-lng">Longitude</Label>
                <Input
                  id="addr-lng"
                  inputMode="decimal"
                  value={draft.longitude ?? ""}
                  onChange={(e) =>
                    set({ longitude: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="-46.6333"
                />
              </div>
            </div>
          )}

          <LocationMapPreview latitude={draft.latitude} longitude={draft.longitude} />

          <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => onSave(draft)}
              disabled={draft.address.trim() === ""}
            >
              Usar este endereço
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
