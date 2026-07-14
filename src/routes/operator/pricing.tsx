import * as React from "react";
import { Link } from "react-router-dom";
import { SlidersHorizontal, Table2 } from "lucide-react";
import { useAuth } from "@/auth/context";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOperatorLocations } from "@/features/locations/api";
import { useCompany } from "@/features/companies/api";
import {
  useLocationParkingTypes,
  type LocationParkingTypeWithRelations,
} from "@/features/parking-types/api";
import { PricingRuleEditor } from "@/features/parking-types/PricingRuleEditor";
import { PricingSimulationDialog } from "@/features/parking-types/PricingSimulationTable";
import { PricingSummary, StrategyChip } from "@/features/parking-types/PricingSummary";
import { findCurveInversions, usePricingCurve } from "@/features/parking-types/pricing-curve";
import { CurveInversionAlert } from "@/features/parking-types/CurveInversionAlert";
import { formatBRL } from "@/lib/format";
import type { Location } from "@/types/domain";

const NO_SCOPE_HINT = "Seu perfil não pode alterar esta configuração. Fale com o dono da conta.";

/** Card de um tipo de vaga: preço vigente, alerta de inversão e atalho pro editor. */
function PricingCard({
  lpt,
  companySlug,
  locationSlug,
  canEditPricing,
  onEdit,
  onSimulate,
}: {
  lpt: LocationParkingTypeWithRelations;
  companySlug?: string;
  locationSlug?: string;
  canEditPricing: boolean;
  onEdit: () => void;
  onSimulate: () => void;
}) {
  const curve = usePricingCurve(
    companySlug,
    locationSlug,
    lpt.company_parking_type.parking_type.code,
    !!lpt.pricing_rule,
  );
  const inversion = findCurveInversions(curve.data ?? [])[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{lpt.company_parking_type.parking_type.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <StrategyChip strategy={lpt.pricing_rule?.strategy ?? null} />
              <span className="text-caption text-muted">
                Preço base · {formatBRL(Number(lpt.company_parking_type.base_price))}
              </span>
              {!lpt.is_active && (
                <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption text-muted">
                  Tipo inativo
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PricingSummary lpt={lpt} />

        {inversion && (
          <CurveInversionAlert inversion={inversion} onOpenSimulation={onSimulate} />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onSimulate}
            disabled={!lpt.pricing_rule}
            title={
              lpt.pricing_rule ? undefined : "Configure uma estratégia primeiro pra simular preços"
            }
          >
            <Table2 className="h-4 w-4" />
            Ver tabela
          </Button>
          <Button
            size="sm"
            onClick={onEdit}
            disabled={!canEditPricing}
            title={canEditPricing ? undefined : NO_SCOPE_HINT}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Editar preços
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Preços de uma unidade: um card por tipo de vaga. */
function LocationPricing({ location }: { location: Location }) {
  const { hasScope } = useAuth();
  const { data: units, isLoading } = useLocationParkingTypes(location.id);
  const company = useCompany(location.company_id);
  const [editing, setEditing] = React.useState<LocationParkingTypeWithRelations | null>(null);
  const [simulating, setSimulating] = React.useState<LocationParkingTypeWithRelations | null>(
    null,
  );

  const canEditPricing = hasScope("pricing:write", location.company_id);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-title-md text-ink">{location.name}</h2>
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/operator/locations/${location.id}/parking-types`}>
            Capacidade e regras
          </Link>
        </Button>
      </div>

      {(units ?? []).length === 0 ? (
        <p className="text-body-sm text-muted">
          Esta unidade ainda não tem tipo de vaga. Cadastre um em Capacidade e regras.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          {units?.map((lpt) => (
            <PricingCard
              key={lpt.id}
              lpt={lpt}
              companySlug={company.data?.slug}
              locationSlug={location.slug}
              canEditPricing={canEditPricing}
              onEdit={() => setEditing(lpt)}
              onSimulate={() => setSimulating(lpt)}
            />
          ))}
        </div>
      )}

      {editing && company.data && (
        <PricingRuleEditor
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          lpt={editing}
          companyId={location.company_id}
          companySlug={company.data.slug}
          locationSlug={location.slug}
          parkingTypeCode={editing.company_parking_type.parking_type.code}
        />
      )}

      {simulating && company.data && (
        <PricingSimulationDialog
          open={!!simulating}
          onOpenChange={(open) => !open && setSimulating(null)}
          companySlug={company.data.slug}
          locationSlug={location.slug}
          parkingTypeCode={simulating.company_parking_type.parking_type.code}
          title={`${simulating.company_parking_type.parking_type.name} · ${location.name}`}
        />
      )}
    </section>
  );
}

export default function OperatorPricing() {
  const { effectiveCompanyIds } = useAuth();
  const { data: locations, isLoading } = useOperatorLocations(effectiveCompanyIds);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Preços"
        description="O preço da diária que o cliente paga, por unidade e tipo de vaga."
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
          {locations?.map((loc) => <LocationPricing key={loc.id} location={loc} />)}
        </div>
      )}
    </div>
  );
}
