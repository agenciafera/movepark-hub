import { useNavigate } from "react-router-dom";
import { Plane, Bus, Building2, MapPin } from "lucide-react";
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

  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-12 desktop:px-8">
      <h2 className="text-display-md text-ink mb-2">Destinos populares</h2>
      <p className="text-body-md text-muted mb-6">
        Comece pelos aeroportos mais buscados.
      </p>

      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-md" />
            ))
          : data?.map((d) => {
              const Icon = iconByType[d.type] ?? MapPin;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => navigate(`/search?dest=${d.code}`)}
                  className="group flex flex-col items-start gap-3 rounded-md border border-hairline bg-canvas p-5 text-left transition-shadow hover:shadow-tier"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-title-md text-ink">
                      {d.short_name ?? d.name}
                    </div>
                    <div className="text-caption text-muted">
                      {d.city}
                      {d.state ? ` · ${d.state}` : ""}
                      {d.country === "PT" ? " · Portugal" : ""}
                    </div>
                  </div>
                </button>
              );
            })}
      </div>
    </section>
  );
}
