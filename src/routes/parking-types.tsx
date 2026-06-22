import * as React from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, SlidersHorizontal, Table2, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { useLocation as useLocationData } from "@/features/locations/api";
import { useCompany } from "@/features/companies/api";
import {
  useLocationParkingTypes,
  useUpdateLocationParkingType,
  type LocationParkingTypeWithRelations,
} from "@/features/parking-types/api";
import { ParkingTypeForm } from "@/features/parking-types/ParkingTypeForm";
import { CapacityRulesForm } from "@/features/parking-types/CapacityRulesForm";
import { PricingRuleEditor } from "@/features/parking-types/PricingRuleEditor";
import { PricingSimulationDialog } from "@/features/parking-types/PricingSimulationTable";
import { PricingSummary, StrategyChip } from "@/features/parking-types/PricingSummary";
import { formatBRL } from "@/lib/format";

export default function ParkingTypesPage() {
  const params = useParams<{ id?: string; locationId?: string; companyId?: string }>();
  const routeLocation = useLocation();
  const isOperator = routeLocation.pathname.startsWith("/operator");
  const locationId = params.locationId ?? params.id;
  const location = useLocationData(locationId);
  const { data, isLoading, error } = useLocationParkingTypes(locationId);
  const updateLpt = useUpdateLocationParkingType();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LocationParkingTypeWithRelations | null>(null);
  const [editingRules, setEditingRules] = React.useState<LocationParkingTypeWithRelations | null>(
    null,
  );
  const [simulating, setSimulating] = React.useState<LocationParkingTypeWithRelations | null>(
    null,
  );

  const companyId = params.companyId ?? location.data?.company_id;
  const company = useCompany(companyId);

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await updateLpt.mutateAsync({ id, patch: { is_active: isActive } });
      toast.success(isActive ? "Tipo ativado" : "Tipo desativado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function updateCapacity(id: string, capacity: number) {
    try {
      await updateLpt.mutateAsync({ id, patch: { capacity } });
      toast.success("Capacidade atualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function updateWlMapping(id: string, category: string | null, product: string | null) {
    try {
      await updateLpt.mutateAsync({
        id,
        patch: { wl_category_slug: category, wl_product_slug: product },
      });
      toast.success("Mapeamento WL salvo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  const backHref = isOperator
    ? "/operator/locations"
    : `/manager/companies/${params.companyId}/locations`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Tipos de vaga${location.data ? ` — ${location.data.name}` : ""}`}
        description="Configure preços, capacidade e regras de precificação dos tipos de vaga."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" asChild>
              <Link to={backHref}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Link>
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!companyId}>
              <Plus className="h-4 w-4" /> Novo tipo
            </Button>
          </div>
        }
      />

      {locationId && companyId && (
        <ParkingTypeForm
          open={createOpen}
          onOpenChange={setCreateOpen}
          locationId={locationId}
          companyId={companyId}
          existingLocationParkingTypeIds={(data ?? []).map(
            (lpt) => lpt.company_parking_type.id,
          )}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          Erro ao carregar tipos de vaga:{" "}
          {error instanceof Error ? error.message : "desconhecido"}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum tipo de vaga configurado"
          description='Clique em "Novo tipo" para adicionar.'
        />
      ) : (
        <div className="flex flex-col gap-4">
          {data?.map((lpt) => (
            <ParkingTypeCard
              key={lpt.id}
              lpt={lpt}
              onToggleActive={(v) => toggleActive(lpt.id, v)}
              onUpdateCapacity={(c) => updateCapacity(lpt.id, c)}
              onUpdateWlMapping={(cat, prod) => updateWlMapping(lpt.id, cat, prod)}
              showWlMapping={!isOperator}
              onEditPricing={() => setEditing(lpt)}
              onEditRules={() => setEditingRules(lpt)}
              onOpenSimulation={() => setSimulating(lpt)}
            />
          ))}
        </div>
      )}

      {editing && companyId && location.data && company.data && (
        <PricingRuleEditor
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          lpt={editing}
          companyId={companyId}
          companySlug={company.data.slug}
          locationSlug={location.data.slug}
          parkingTypeCode={editing.company_parking_type.parking_type.code}
        />
      )}

      {editingRules && (
        <CapacityRulesForm
          open={!!editingRules}
          lpt={editingRules}
          onOpenChange={(open) => !open && setEditingRules(null)}
        />
      )}

      {simulating && location.data && company.data && (
        <PricingSimulationDialog
          open={!!simulating}
          onOpenChange={(open) => !open && setSimulating(null)}
          companySlug={company.data.slug}
          locationSlug={location.data.slug}
          parkingTypeCode={simulating.company_parking_type.parking_type.code}
          title={`${simulating.company_parking_type.parking_type.name} · ${location.data.name}`}
        />
      )}
    </div>
  );
}

type CardProps = {
  lpt: LocationParkingTypeWithRelations;
  onToggleActive: (v: boolean) => void;
  onUpdateCapacity: (capacity: number) => void;
  onUpdateWlMapping: (category: string | null, product: string | null) => void;
  showWlMapping: boolean;
  onEditPricing: () => void;
  onEditRules: () => void;
  onOpenSimulation: () => void;
};

function ParkingTypeCard({
  lpt,
  onToggleActive,
  onUpdateCapacity,
  onUpdateWlMapping,
  showWlMapping,
  onEditPricing,
  onEditRules,
  onOpenSimulation,
}: CardProps) {
  const [capacity, setCapacity] = React.useState(lpt.capacity);
  const [wlCat, setWlCat] = React.useState(lpt.wl_category_slug ?? "");
  const [wlProd, setWlProd] = React.useState(lpt.wl_product_slug ?? "");

  React.useEffect(() => {
    setCapacity(lpt.capacity);
    setWlCat(lpt.wl_category_slug ?? "");
    setWlProd(lpt.wl_product_slug ?? "");
  }, [lpt.capacity, lpt.wl_category_slug, lpt.wl_product_slug]);

  const wlDirty =
    wlCat !== (lpt.wl_category_slug ?? "") || wlProd !== (lpt.wl_product_slug ?? "");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>
              {lpt.company_parking_type.parking_type.name}{" "}
              <span className="text-caption text-muted">
                ({lpt.company_parking_type.parking_type.code})
              </span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <StrategyChip strategy={lpt.pricing_rule?.strategy ?? null} />
              <span className="text-caption text-muted">
                Preço base · {formatBRL(Number(lpt.company_parking_type.base_price))}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-caption">{lpt.is_active ? "Ativo" : "Inativo"}</Label>
            <Switch checked={lpt.is_active} onCheckedChange={onToggleActive} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PricingSummary lpt={lpt} />

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cap-${lpt.id}`}>Capacidade</Label>
            <div className="flex gap-2">
              <Input
                id={`cap-${lpt.id}`}
                type="number"
                min={0}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="h-10 w-32 text-center tabular-nums"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={capacity === lpt.capacity}
                onClick={() => onUpdateCapacity(capacity)}
              >
                Salvar
              </Button>
            </div>
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={onEditRules}>
            <CalendarClock className="h-4 w-4" />
            Regras de reserva
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenSimulation}
            disabled={!lpt.pricing_rule}
            title={
              lpt.pricing_rule
                ? undefined
                : "Configure uma estratégia primeiro pra simular preços"
            }
          >
            <Table2 className="h-4 w-4" />
            Simular preços
          </Button>
          <Button size="sm" onClick={onEditPricing}>
            <SlidersHorizontal className="h-4 w-4" />
            Configurar precificação
          </Button>
        </div>

        {/* Mapeamento com o white-label (E2.5.1) — só Manager (Movepark), nunca o operador. */}
        {showWlMapping && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-hairline p-3">
          <div className="flex w-full flex-col">
            <span className="text-body-sm font-medium text-ink">Mapeamento White-label</span>
            <span className="text-caption text-muted">
              Slugs deste tipo de vaga no sistema legado (category = unidade, product = tipo). Usado pra
              casar disponibilidade.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`wlcat-${lpt.id}`}>category_slug</Label>
            <Input
              id={`wlcat-${lpt.id}`}
              value={wlCat}
              onChange={(e) => setWlCat(e.target.value)}
              placeholder="unidade-aeroporto"
              className="h-10 w-48"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`wlprod-${lpt.id}`}>product_slug</Label>
            <Input
              id={`wlprod-${lpt.id}`}
              value={wlProd}
              onChange={(e) => setWlProd(e.target.value)}
              placeholder="vaga-coberta"
              className="h-10 w-48"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!wlDirty}
            onClick={() => onUpdateWlMapping(wlCat.trim() || null, wlProd.trim() || null)}
          >
            Salvar
          </Button>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
