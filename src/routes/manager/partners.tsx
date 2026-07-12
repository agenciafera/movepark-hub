import * as React from "react";
import { Handshake, List, SquareKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePartnerApplications } from "@/features/onboarding/managerApi";
import { ApplicationDrawer } from "@/features/onboarding/ApplicationDrawer";
import { RejectDialog } from "@/features/onboarding/RejectDialog";
import { PartnersKanban } from "@/features/onboarding/PartnersKanban";
import { onboardingStatusLabel, onboardingStatusTone } from "@/features/onboarding/status";
import type { OnboardingStatus, PartnerApplication } from "@/types/domain";

type PartnersView = "kanban" | "list";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "pending_review", label: "Pendentes" },
  { value: "approved", label: "Aprovados" },
  { value: "in_progress", label: "Em cadastro" },
  { value: "active", label: "Ativos" },
  { value: "rejected", label: "Recusados" },
];

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
  const [view, setView] = React.useState<PartnersView>("kanban");
  const [status, setStatus] = React.useState("all");
  const [selected, setSelected] = React.useState<PartnerApplication | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);

  const apps = data ?? [];
  const rows = apps.filter(
    (a) => status === "all" || a.company?.onboarding_status === status,
  );

  function openDrawer(app: PartnerApplication) {
    setSelected(app);
    setDrawerOpen(true);
  }

  function openReject(app: PartnerApplication) {
    setSelected(app);
    setDrawerOpen(false);
    setRejectOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Parceiros"
        description="Solicitações de cadastro de estacionamentos."
      />

      <div className="flex flex-wrap items-center gap-3">
        <ViewToggle view={view} onChange={setView} />
        {view === "list" && (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      ) : view === "kanban" ? (
        <PartnersKanban applications={apps} onSelect={openDrawer} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-10 w-10" />}
          title="Nenhuma solicitação nesse status"
          description="Ajuste o filtro para ver outras solicitações."
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
              {rows.map((a) => (
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
