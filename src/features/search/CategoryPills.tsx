import { Car, CloudRain, KeyRound, Star, Bike, Container } from "@/lib/icons";
import { useParkingTypeCatalog } from "./api";
import { cn } from "@/lib/utils";

const iconByCode: Record<string, React.ComponentType<{ className?: string }>> = {
  covered: Car,
  uncovered: CloudRain,
  valet: KeyRound,
  premium: Star,
  motorcycle: Bike,
  garage: Container,
};

type Props = {
  selected: string[];
  onToggle: (code: string) => void;
};

export function CategoryPills({ selected, onToggle }: Props) {
  const { data } = useParkingTypeCatalog();
  return (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {data?.map((pt) => {
        const Icon = iconByCode[pt.code] ?? Car;
        const active = selected.includes(pt.code);
        return (
          <button
            key={pt.id}
            type="button"
            onClick={() => onToggle(pt.code)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-button-sm transition-colors",
              active
                ? "border-mp-navy bg-mp-navy !text-white"
                : "border-hairline bg-canvas text-ink hover:bg-surface-soft",
            )}
          >
            <Icon className="h-4 w-4" />
            {pt.name}
          </button>
        );
      })}
    </div>
  );
}
