import { useNavigate } from "react-router-dom";
import { Plane, Bus, Building2, MapPin, ArrowRight, Image } from "lucide-react";
import { usePopularDestinations, type Destination } from "@/features/search/api";
import { Skeleton } from "@/components/ui/skeleton";

const iconByType: Record<Destination["type"], React.ComponentType<{ className?: string }>> = {
  airport: Plane,
  bus_terminal: Bus,
  city_center: Building2,
  district: MapPin,
  custom: MapPin,
};

export function PopularDestinations() {
  const navigate = useNavigate();
  const { data, isLoading } = usePopularDestinations(8);

  const [featured, ...rest] = data ?? [];
  const grid = rest.slice(0, 4);

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
        <Skeleton className="mb-2 h-4 w-32" />
        <Skeleton className="mb-8 h-9 w-72" />
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-md" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[136px] w-full rounded-md" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <p className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
        Os mais buscados
      </p>
      <h2 className="mb-8 text-[28px] font-bold tracking-tight text-ink tablet:text-[36px]">
        Destinos populares
      </h2>

      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        {/* Card featured — ocupa a coluna inteira da esquerda */}
        {featured && (
          <button
            type="button"
            onClick={() => navigate(`/search?dest=${featured.code}`)}
            className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-md bg-gradient-to-br from-mp-navy to-mp-indigo p-6 text-left transition-all hover:shadow-tier desktop:min-h-[340px]"
          >
            {/* Placeholder visual */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <Image className="h-24 w-24 text-white" aria-hidden="true" />
            </div>
            <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">placeholder</span>
            </span>

            <div className="relative z-10">
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white">
                <Plane className="h-5 w-5" />
              </span>
              <div className="mb-1 text-[22px] font-bold leading-tight text-white">
                {featured.short_name ?? featured.name}
              </div>
              <div className="mb-4 text-body-sm text-white/70">
                {featured.city}
                {featured.state ? ` · ${featured.state}` : ""}
                {featured.country === "PT" ? " · Portugal" : ""}
              </div>
              <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-white/90 transition-gap group-hover:gap-2.5">
                Ver vagas disponíveis <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </button>
        )}

        {/* Grid 2×2 de cards secundários */}
        <div className="grid grid-cols-2 gap-4">
          {grid.map((d) => {
            const Icon = iconByType[d.type] ?? MapPin;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => navigate(`/search?dest=${d.code}`)}
                className="group flex flex-col items-start gap-3 rounded-md border border-hairline bg-canvas p-4 text-left transition-all hover:border-mp-violet/30 hover:shadow-tier"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-title-md text-ink leading-snug">
                    {d.short_name ?? d.name}
                  </div>
                  <div className="mt-0.5 text-caption-sm text-muted">
                    {d.city}
                    {d.state ? ` · ${d.state}` : ""}
                    {d.country === "PT" ? " · PT" : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
