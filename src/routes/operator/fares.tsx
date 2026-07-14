import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOperatorLocations } from "@/features/locations/api";
import { useLocationParkingTypes } from "@/features/parking-types/api";
import { FareConfigCard } from "@/features/fares/FareConfigCard";
import { useAuth } from "@/auth/context";
import type { Location } from "@/types/domain";

/** Tarifas de uma localização: um card de config por tipo de vaga. */
function LocationFares({ location }: { location: Location }) {
  const { data: units, isLoading } = useLocationParkingTypes(location.id);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!units || units.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-title-md text-ink">{location.name}</h3>
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        {units.map((u) => (
          <FareConfigCard
            key={u.id}
            lptId={u.id}
            title={u.company_parking_type?.parking_type?.name ?? "Tipo de vaga"}
          />
        ))}
      </div>
    </section>
  );
}

export default function OperatorFares() {
  const { effectiveCompanyIds } = useAuth();
  const { data: locations, isLoading } = useOperatorLocations(effectiveCompanyIds);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Planos de cancelamento"
        description="Preço e disponibilidade dos planos Flex e Superflex por tipo de vaga. A Básica é sempre grátis. O preço da diária fica em Preços."
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (locations ?? []).length === 0 ? (
        <EmptyState
          title="Sem localizações vinculadas"
          description="Solicite à equipe Movepark para cadastrar suas unidades."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {locations?.map((loc) => <LocationFares key={loc.id} location={loc} />)}
        </div>
      )}
    </div>
  );
}
