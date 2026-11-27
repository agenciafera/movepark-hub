import { Button } from "@/components/ui/button";

/** Os próximos passos que o agente sugeriu. O clique manda o texto como se o admin tivesse escrito. */
export function ProximosPassos({
  passos,
  onPedir,
  desligado,
}: {
  passos: string[];
  onPedir: (texto: string) => void;
  desligado: boolean;
}) {
  if (passos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Próximos passos">
      {passos.map((p) => (
        <Button key={p} type="button" variant="outline" size="sm" className="rounded-full" disabled={desligado} onClick={() => onPedir(p)}>
          {p}
        </Button>
      ))}
    </div>
  );
}
