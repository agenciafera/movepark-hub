import * as React from "react";
import { toast } from "sonner";
import { Handshake, List, SquareKanban, Maximize2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePartnerApplications, usePartnerAction } from "@/features/onboarding/managerApi";
import { partnerApproveMessage } from "@/features/onboarding/partnerActionMessages";
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
  if (!iso) return "-";
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
  // Tela cheia: o quadro ocupa a tela toda (esconde o menu) pra caber mais colunas/cards.
  const [fullscreen, setFullscreen] = React.useState(false);

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

  // Arrastar um card dispara a MESMA ação da lista/drawer. O manager só tem duas:
  //  - Aprovado: "approve" (cria convite e envia o e-mail de continuar cadastro).
  //    O status vira `approved`, como ao clicar em "Aprovar e enviar convite".
  //  - Perdido: abre o diálogo de motivo e faz "reject" (envia e-mail de recusa).
  // "Em cadastro" e "Ativo" não entram aqui: canMoveToColumn não os aceita como
  // destino (o parceiro é quem chega neles ao preencher/publicar o wizard).
  async function handleMove(app: PartnerApplication, target: OnboardingStatus) {
    if (target === "rejected") {
      openReject(app);
      return;
    }
    if (target === "approved") {
      setMovingId(app.company_id);
      try {
        const res = await action.mutateAsync({ company_id: app.company_id, action: "approve" });
        const msg = partnerApproveMessage(res);
        if (msg.ok) toast.success(msg.text);
        else toast.warning(msg.text);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao aprovar");
      } finally {
        setMovingId(null);
      }
    }
  }

  const filtersEl =
    !isLoading && apps.length > 0 ? (
      <PartnersFilters
        apps={apps}
        filters={filters}
        onChange={patchFilters}
        resultCount={visible.length}
      />
    ) : null;

  const content = isLoading ? (
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
            <TableRow key={a.company_id} className="cursor-pointer" onClick={() => openDrawer(a)}>
              <TableCell className="font-medium text-ink">{a.company?.name}</TableCell>
              <TableCell>{a.contact_name}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span>{a.contact_email}</span>
                  <span className="text-caption text-muted">{a.contact_phone}</span>
                </div>
              </TableCell>
              <TableCell>{[a.city, a.state].filter(Boolean).join(" / ") || "-"}</TableCell>
              <TableCell>{a.estimated_spots ?? "-"}</TableCell>
              <TableCell>{a.utm_source ?? "-"}</TableCell>
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
  );

  const drawers = (
    <>
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
    </>
  );

  // Tela cheia: quadro canto a canto por cima do menu, com "Voltar" no topo.
  if (fullscreen) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
          <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setFullscreen(false)}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <span className="text-title-md text-ink">Parceiros</span>
            {filtersEl && <div className="ml-auto min-w-0 overflow-x-auto">{filtersEl}</div>}
          </div>
          <div className="flex-1 overflow-auto p-4">{content}</div>
        </div>
        {drawers}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Parceiros" description="Solicitações de cadastro de estacionamentos." />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {view === "kanban" && apps.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setFullscreen(true)}>
              <Maximize2 className="h-4 w-4" /> Tela cheia
            </Button>
          )}
        </div>
        {filtersEl}
      </div>

      {content}
      {drawers}
    </div>
  );
}
