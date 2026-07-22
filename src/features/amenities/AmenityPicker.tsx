import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useAmenityCatalog, CATEGORY_LABEL, CATEGORY_ORDER, type Amenity } from "./api";

/**
 * Escolha das comodidades da unidade sobre o catálogo da Movepark.
 *
 * Checklist, e não texto livre: `amenity` é catálogo fechado (o RLS só deixa
 * hub_admin escrever nele), e é o que a busca usa para filtrar. Texto livre
 * viraria benefício que ninguém consegue procurar.
 */
export function AmenityPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const { data: catalogo, isLoading } = useAmenityCatalog();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const porCategoria = (catalogo ?? []).reduce<Record<string, Amenity[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});

  const grupos = CATEGORY_ORDER.filter((c) => porCategoria[c]?.length).concat(
    // Categoria nova no catálogo não some da tela só porque a ordem não a conhece.
    Object.keys(porCategoria).filter((c) => !CATEGORY_ORDER.includes(c)),
  );

  function alternar(code: string, marcado: boolean) {
    onChange(marcado ? [...selected, code] : selected.filter((c) => c !== code));
  }

  return (
    <div className="flex flex-col gap-5">
      {grupos.map((categoria) => (
        <fieldset key={categoria} className="flex flex-col gap-2">
          <legend className="text-caption font-medium text-muted">
            {CATEGORY_LABEL[categoria] ?? categoria}
          </legend>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 tablet:grid-cols-2">
            {porCategoria[categoria].map((a) => {
              const id = `amenity-${a.code}`;
              const marcado = selected.includes(a.code);
              return (
                <label
                  key={a.code}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-sm py-1.5 transition-colors hover:bg-surface-soft"
                >
                  <Checkbox
                    id={id}
                    checked={marcado}
                    onCheckedChange={(v) => alternar(a.code, v === true)}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col">
                    <span className="text-body-sm text-ink">{a.name}</span>
                    {a.description && (
                      <span className="text-caption-sm text-muted">{a.description}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <p className="text-caption-sm text-muted">
        {selected.length === 0
          ? "Nenhuma marcada. O card da busca fica sem benefícios."
          : `${selected.length} marcada${selected.length > 1 ? "s" : ""}.`}
      </p>
    </div>
  );
}
