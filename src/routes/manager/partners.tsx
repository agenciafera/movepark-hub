import * as React from "react";
import { toast } from "sonner";
import { Handshake, List, SquareKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePartnerApplications, usePartnerAction } from "@/features/onboarding/managerApi";
import { ApplicationDrawer } from "@/features/onboarding/ApplicationDrawer";
import { RejectDialog } from "@/features/onboarding/RejectDialog";
import { PartnersKanban } from "@/features/onboarding/PartnersKanban";
import { PartnersFilters } from "@/features/onboarding/PartnersFilters";
import {
  applyPartnersFilters,
  emptyPartnersFilters,
  type PartnersFilters as Filters,
} from "@/features/onboarding/partnersFilters.logic";
import { onboardingStatusLabel, onboardingStatusTone } from "@/features/onboarding/status";
import type { OnboardingStatus, PartnerApplication } from "@/types/domain";

type PartnersView = "kanban" | "list";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ViewToggle({
  view,
  onChange,
}: {
  view: PartnersView;
  onChange: (v: PartnersView) => void;
}) {
  const options: { value: PartnersView; label: string; Icon: typeof List }[] = [
    { value: "kanban", label: "Ver em kanban", Icon: SquareKanban },
    { value: "list", label: "Ver em lista", Icon: List },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-surface-pale p-1">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={view === value}
          onClick={() => onChange(value)}
          className={cn(
            "inline-flex h-8 w-9 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1",
            view === value ? "bg-ink text-white" : "text-mp-indigo hover:text-ink",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export default function ManagerPartners() {
  const { data, isLoading } = usePartnerApplications();
  const action = usePartnerAction();
  const [view, setView] = React.useState<PartnersView>("kanban");
  const [filters, setFilters] = React.useState<Filters>(emptyPartnersFilters);
  const [selected, setSelected] = React.useState<PartnerApplication | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [movingId, setMovingId] = React.useState<string | null>(null);

  const apps = data ?? [];
  const visible = applyPartnersFilters(apps, filters);

  function patchFilters(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  function openDrawer(app: PartnerApplication) {
    setSelected(app);
    setDrawerOpen(true);
  }

  function openReject(app: PartnerApplication) {
    setSelected(app);
    setDrawerOpen(false);
    setRejectOpen(true);
  }

  // Arrastar um card para outra coluna dispara a MESMA ação da lista/drawer:
  //  - Aprovado: "approve" (cria convite e envia o e-mail de continuar cadastro).
  //  - Perdido:  abre o diálogo de motivo e faz "reject" (envia e-mail de recusa).
  async function handleMove(app: PartnerApplication, target: OnboardingStatus) {
    if (target === "rejected") {
      openReject(app);
      return;
    }
    if (target === "approved") {
      setMovingId(app.company_id);
      try {
        await action.mutateAsync({ company_id: app.company_id, action: "approve" });
        toast.success("Parceiro aprovado. Enviamos o e-mail para continuar o cadastro.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao aprovar");
      } finally {
        setMovingId(null);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Parceiros"
        description="Solicitações de cadastro de estacionamentos."
      />

      <div className="flex flex-col gap-3">
        <ViewToggle view={view} onChange={setView} />
        {!isLoading && apps.length > 0 && (
          <PartnersFilters
            apps={apps}
            filters={filters}
            onChange={patchFilters}
            resultCount={visible.length}
          />
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-10 w-10" />}
          title="Nenhuma solicitação"
          description="Quando um estacionamento se cadastrar, ele aparece aqui."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-10 w-10" />}
          title="Nada com esses filtros"
          description="Ajuste ou limpe os filtros para ver outras solicitações."
        />
      ) : view === "kanban" ? (
        <PartnersKanban
          applications={visible}
          onSelect={openDrawer}
          onMove={handleMove}
          movingId={movingId}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Vagas</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Recebido</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => (
                <TableRow
                  key={a.company_id}
                  className="cursor-pointer"
                  onClick={() => openDrawer(a)}
                >
                  <TableCell className="font-medium text-ink">{a.company?.name}</TableCell>
                  <TableCell>{a.contact_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{a.contact_email}</span>
                      <span className="text-caption text-muted">{a.contact_phone}</span>
                    </div>
                  </TableCell>
                  <TableCell>{[a.city, a.state].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell>{a.estimated_spots ?? "—"}</TableCell>
                  <TableCell>{a.utm_source ?? "—"}</TableCell>
                  <TableCell>{fmtDate(a.submitted_at)}</TableCell>
                  <TableCell>
                    <Badge tone={onboardingStatusTone[(a.company?.onboarding_status ?? "pending_review") as OnboardingStatus]}>
                      {onboardingStatusLabel[(a.company?.onboarding_status ?? "pending_review") as OnboardingStatus]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ApplicationDrawer
        application={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onReject={openReject}
      />
      <RejectDialog
        companyId={selected?.company_id ?? null}
        companyName={selected?.company?.name}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
      />
    </div>
  );
}
