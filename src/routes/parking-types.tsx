import * as React from "react";
import { useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, Plus, SlidersHorizontal, Table2 } from "lucide-react";
import { useAuth } from "@/auth/context";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { useWlCatalog, type WlCatalog } from "@/features/availability/api";
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
import { findCurveInversions, usePricingCurve } from "@/features/parking-types/pricing-curve";
import { CurveInversionAlert } from "@/features/parking-types/CurveInversionAlert";
import { formatBRL, formatDate } from "@/lib/format";

const NO_SCOPE_HINT = "Seu perfil não pode alterar esta configuração. Fale com o dono da conta.";

const MIN_STAY_UNIT_LABEL: Record<string, string> = {
  minutes: "minutos",
  hours: "horas",
  days: "diárias",
  months: "meses",
};

function minStayUnitLabel(lpt: LocationParkingTypeWithRelations): string {
  return MIN_STAY_UNIT_LABEL[lpt.minimum_stay_unit ?? "days"] ?? "diárias";
}

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
  const [simulating, setSimulating] = React.useState<LocationParkingTypeWithRelations | null>(null);

  const companyId = params.companyId ?? location.data?.company_id;
  const company = useCompany(companyId);
  // Catálogo do WL só faz sentido no Manager (mapeamento é da Movepark, não do operador).
  const wlCatalog = useWlCatalog(isOperator ? undefined : companyId);

  // ADR-005: a UI espelha o gate do servidor. Sem o escopo, a ação vem desabilitada em vez
  // de deixar o parceiro clicar e tomar 403. hub_admin tem todos os escopos.
  const { hasScope } = useAuth();
  const canEditParkingType = hasScope("parking-types:write", companyId);
  const canEditPricing = hasScope("pricing:write", companyId);

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
        back={{ to: backHref, label: "Voltar para Localizações" }}
        title={`Tipos de vaga${location.data ? ` · ${location.data.name}` : ""}`}
        description="Configure preços, capacidade e regras de precificação dos tipos de vaga."
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={!companyId || !canEditParkingType}
              title={canEditParkingType ? undefined : NO_SCOPE_HINT}
            >
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
          existingLocationParkingTypeIds={(data ?? []).map((lpt) => lpt.company_parking_type.id)}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          Erro ao carregar tipos de vaga: {error instanceof Error ? error.message : "desconhecido"}
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
              wlCatalog={wlCatalog.data}
              onEditPricing={() => setEditing(lpt)}
              onEditRules={() => setEditingRules(lpt)}
              onOpenSimulation={() => setSimulating(lpt)}
              canEditParkingType={canEditParkingType}
              canEditPricing={canEditPricing}
              companySlug={company.data?.slug}
              locationSlug={location.data?.slug}
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
  wlCatalog?: WlCatalog;
  onEditPricing: () => void;
  onEditRules: () => void;
  onOpenSimulation: () => void;
  canEditParkingType: boolean;
  canEditPricing: boolean;
  companySlug?: string;
  locationSlug?: string;
};

function ParkingTypeCard({
  lpt,
  onToggleActive,
  onUpdateCapacity,
  onUpdateWlMapping,
  showWlMapping,
  wlCatalog,
  onEditPricing,
  onEditRules,
  onOpenSimulation,
  canEditParkingType,
  canEditPricing,
  companySlug,
  locationSlug,
}: CardProps) {
  const [capacity, setCapacity] = React.useState(lpt.capacity);

  // Curva atual pelo motor (RPC). Serve pra flagrar no card, sem abrir o simulador,
  // a tabela em que ficar mais dias sai mais barato.
  const curve = usePricingCurve(
    companySlug,
    locationSlug,
    lpt.company_parking_type.parking_type.code,
    !!lpt.pricing_rule,
  );
  const inversion = findCurveInversions(curve.data ?? [])[0];
  const [wlCat, setWlCat] = React.useState(lpt.wl_category_slug ?? "");
  const [wlProd, setWlProd] = React.useState(lpt.wl_product_slug ?? "");

  React.useEffect(() => {
    setCapacity(lpt.capacity);
    setWlCat(lpt.wl_category_slug ?? "");
    setWlProd(lpt.wl_product_slug ?? "");
  }, [lpt.capacity, lpt.wl_category_slug, lpt.wl_product_slug]);

  const wlDirty = wlCat !== (lpt.wl_category_slug ?? "") || wlProd !== (lpt.wl_product_slug ?? "");

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
              {lpt.has_minimum_stay && lpt.minimum_stay_value != null && (
                <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption text-muted">
                  Mínimo de {lpt.minimum_stay_value} {minStayUnitLabel(lpt)}
                </span>
              )}
              {lpt.has_minimum_date && lpt.minimum_date && (
                <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption text-muted">
                  A partir de {formatDate(lpt.minimum_date)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`active-${lpt.id}`} className="text-caption">
              {lpt.is_active ? "Ativo" : "Inativo"}
            </Label>
            <Switch
              id={`active-${lpt.id}`}
              checked={lpt.is_active}
              onCheckedChange={onToggleActive}
              disabled={!canEditParkingType}
              title={canEditParkingType ? undefined : NO_SCOPE_HINT}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PricingSummary lpt={lpt} />

        {inversion && (
          <CurveInversionAlert inversion={inversion} onOpenSimulation={onOpenSimulation} />
        )}

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
                disabled={!canEditParkingType}
                title={canEditParkingType ? undefined : NO_SCOPE_HINT}
                className="h-10 w-32 text-center tabular-nums"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={capacity === lpt.capacity || !canEditParkingType}
                title={canEditParkingType ? undefined : NO_SCOPE_HINT}
                onClick={() => onUpdateCapacity(capacity)}
              >
                Salvar
              </Button>
            </div>
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="secondary"
            onClick={onEditRules}
            disabled={!canEditParkingType}
            title={canEditParkingType ? undefined : NO_SCOPE_HINT}
          >
            <CalendarClock className="h-4 w-4" />
            Regras de reserva
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenSimulation}
            disabled={!lpt.pricing_rule}
            title={
              lpt.pricing_rule ? undefined : "Configure uma estratégia primeiro pra simular preços"
            }
          >
            <Table2 className="h-4 w-4" />
            Simular preços
          </Button>
          <Button
            size="sm"
            onClick={onEditPricing}
            disabled={!canEditPricing}
            title={canEditPricing ? undefined : NO_SCOPE_HINT}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Configurar precificação
          </Button>
        </div>

        {/* Mapeamento com o white-label (E2.5.1): só Manager (Movepark), nunca o operador. */}
        {showWlMapping && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-hairline p-3">
            <div className="flex w-full flex-col">
              <span className="text-body-sm font-medium text-ink">Mapeamento White-label</span>
              <span className="text-caption text-muted">
                Slugs deste tipo de vaga no sistema legado (category = unidade, product = tipo).
                Usado pra casar disponibilidade.
              </span>
            </div>
            {wlCatalog?.ready && wlCatalog.categories.length > 0 ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`wlcat-select-${lpt.id}`}>Unidade (category)</Label>
                  <Select
                    value={wlCat || undefined}
                    onValueChange={(v) => {
                      setWlCat(v);
                      setWlProd(""); // troca de categoria zera o produto
                    }}
                  >
                    <SelectTrigger id={`wlcat-select-${lpt.id}`} className="w-56">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {wlCatalog.categories.map((c) => (
                        <SelectItem key={c.slug} value={c.slug}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`wlprod-select-${lpt.id}`}>Tipo de vaga (product)</Label>
                  <Select value={wlProd || undefined} onValueChange={setWlProd} disabled={!wlCat}>
                    <SelectTrigger id={`wlprod-select-${lpt.id}`} className="w-56">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {wlCatalog.products
                        .filter((p) => p.category_slug === wlCat)
                        .map((p) => (
                          <SelectItem key={p.slug} value={p.slug}>
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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
