import * as React from "react";
import { Handshake } from "@/lib/icons";
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
import { onboardingStatusLabel, onboardingStatusTone } from "@/features/onboarding/status";
import type { OnboardingStatus, PartnerApplication } from "@/types/domain";

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

export default function ManagerPartners() {
  const { data, isLoading } = usePartnerApplications();
  const [status, setStatus] = React.useState("all");
  const [selected, setSelected] = React.useState<PartnerApplication | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);

  const rows = (data ?? []).filter(
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

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-10 w-10" />}
          title="Nenhuma solicitação"
          description="Quando um estacionamento se cadastrar, ele aparece aqui."
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
