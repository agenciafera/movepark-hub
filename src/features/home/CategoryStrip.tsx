import { useNavigate } from "react-router-dom";
import { Car, CloudRain, KeyRound, Star, Bike, Container } from "@/lib/icons";
import { useParkingTypeCatalog } from "@/features/search/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const iconByCode: Record<string, React.ComponentType<{ className?: string }>> = {
  covered: Car,
  uncovered: CloudRain,
  valet: KeyRound,
  premium: Star,
  motorcycle: Bike,
  garage: Container,
};

export function CategoryStrip() {
  const navigate = useNavigate();
  const { data, isLoading } = useParkingTypeCatalog();

  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-12 desktop:px-8">
      <h2 className="text-display-md text-ink mb-6">Categorias</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-32 shrink-0 rounded-full" />
            ))
          : data?.map((pt) => {
              const Icon = iconByCode[pt.code] ?? Car;
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => navigate(`/search?category=${pt.code}`)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border border-hairline bg-canvas px-5 py-2 text-body-sm text-ink transition-colors hover:bg-surface-soft hover:shadow-tier",
                  )}
                >
                  <Icon className="h-4 w-4 text-mp-indigo" />
                  {pt.name}
                </button>
              );
            })}
      </div>
    </section>
  );
}
