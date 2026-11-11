import * as React from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Columns, LockSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { useBookingColumns } from "./useBookingColumns";
import {
  columnDef,
  defaultColumnSettings,
  isDefaultSettings,
  moveColumn,
  toPref,
  toggleColumn,
  type BookingColumnId,
  type ColumnSetting,
} from "./bookingColumns.logic";

type Props = {
  settings: ColumnSetting[];
  save: ReturnType<typeof useBookingColumns>["save"];
  canSave: boolean;
  /** Nome que a coluna tem nesta tela (Unidade x Estacionamento, Diárias x Valor). */
  labelFor?: (id: BookingColumnId) => string;
};

export function BookingColumnsPicker({ settings, save, canSave, labelFor }: Props) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(settings);

  // Ao abrir, parte do que está salvo (e não do rascunho que ficou de uma vez anterior).
  React.useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const mudou = JSON.stringify(draft) !== JSON.stringify(settings);
  const visiveis = draft.filter((s) => s.visible).length;

  async function salvar(next: ColumnSetting[]) {
    try {
      // Voltar ao padrão apaga a escolha, para a pessoa receber as colunas novas que vierem.
      await save.mutateAsync(isDefaultSettings(next) ? null : toPref(next));
      toast.success("Colunas salvas.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não deu para salvar as colunas.");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" disabled={!canSave}>
          <Columns aria-hidden />
          Colunas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-hairline px-4 py-3">
          <div className="text-body-sm font-bold text-ink">Colunas da lista</div>
          <p className="mt-0.5 text-caption text-muted">
            Escolha o que aparece e a ordem. Fica salvo no seu usuário.
          </p>
        </div>
        <ol className="max-h-[360px] overflow-y-auto py-1" aria-label="Colunas">
          {draft.map((s, i) => {
            const def = columnDef(s.id);
            const label = labelFor?.(s.id) ?? def.label;
            return (
              <li key={s.id} className="flex items-center gap-2 px-4 py-1.5">
                {def.locked ? (
                  <LockSimple
                    className="h-4 w-4 shrink-0 text-muted-soft"
                    aria-label="Sempre visível"
                  />
                ) : (
                  <Checkbox
                    id={`col-${s.id}`}
                    checked={s.visible}
                    onCheckedChange={() => setDraft((d) => toggleColumn(d, s.id))}
                    aria-label={`Mostrar ${label}`}
                  />
                )}
                <label
                  htmlFor={def.locked ? undefined : `col-${s.id}`}
                  className={
                    "min-w-0 flex-1 truncate text-body-sm " +
                    (s.visible ? "text-ink" : "text-muted")
                  }
                >
                  {label}
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={i === 0}
                  onClick={() => setDraft((d) => moveColumn(d, s.id, -1))}
                  aria-label={`Subir ${label}`}
                >
                  <ArrowUp size={16} aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={i === draft.length - 1}
                  onClick={() => setDraft((d) => moveColumn(d, s.id, 1))}
                  aria-label={`Descer ${label}`}
                >
                  <ArrowDown size={16} aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={isDefaultSettings(draft) || save.isPending}
            onClick={() => setDraft(defaultColumnSettings())}
          >
            Restaurar padrão
          </Button>
          <Button
            size="sm"
            disabled={!mudou || visiveis === 0 || save.isPending}
            onClick={() => salvar(draft)}
          >
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
