import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAYS, type BusinessHours, type DayHours } from "./businessHours";

/** Horário padrão ao abrir um dia que estava fechado. */
const DEFAULT_DAY: DayHours = { open: "08:00", close: "18:00" };

/**
 * Editor do horário de funcionamento. Um interruptor de 24h (o caso comum) e,
 * quando desligado, uma linha por dia da semana com abrir/fechar e os horários.
 * Não valida aqui: a normalização acontece no save (parseBusinessHours).
 */
export function BusinessHoursField({
  is24h,
  onIs24hChange,
  hours,
  onHoursChange,
}: {
  is24h: boolean;
  onIs24hChange: (value: boolean) => void;
  hours: BusinessHours;
  onHoursChange: (next: BusinessHours) => void;
}) {
  const setDay = (key: (typeof WEEKDAYS)[number]["key"], value: DayHours) =>
    onHoursChange({ ...hours, [key]: value });

  return (
    <div className="flex flex-col gap-4 tablet:col-span-2">
      <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-canvas p-4">
        <div className="flex flex-col">
          <Label htmlFor="is-24h">Funciona 24 horas</Label>
          <p className="text-caption text-muted">
            A maioria das unidades abre 24h, todos os dias. Desligue para definir um horário.
          </p>
        </div>
        <Switch id="is-24h" checked={is24h} onCheckedChange={onIs24hChange} />
      </div>

      {!is24h && (
        <div className="flex flex-col gap-2 rounded-md border border-hairline bg-canvas p-4">
          {WEEKDAYS.map((d) => {
            const day = hours[d.key];
            const open = day !== null;
            const checkboxId = `hours-${d.key}`;
            return (
              <div
                key={d.key}
                className="grid grid-cols-1 items-center gap-2 tablet:grid-cols-[9rem_1fr]"
              >
                <label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2.5">
                  <Checkbox
                    id={checkboxId}
                    checked={open}
                    onCheckedChange={(v) => setDay(d.key, v === true ? DEFAULT_DAY : null)}
                  />
                  <span className="text-body-sm text-ink">{d.label}</span>
                </label>
                {open ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`Abre ${d.label}`}
                      value={day.open}
                      onChange={(e) => setDay(d.key, { ...day, open: e.target.value })}
                      className="w-32"
                    />
                    <span className="text-body-sm text-muted">às</span>
                    <Input
                      type="time"
                      aria-label={`Fecha ${d.label}`}
                      value={day.close}
                      onChange={(e) => setDay(d.key, { ...day, close: e.target.value })}
                      className="w-32"
                    />
                  </div>
                ) : (
                  <span className="text-body-sm text-muted">Fechado</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
