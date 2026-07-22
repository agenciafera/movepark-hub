import * as React from "react";
import { cn } from "@/lib/utils";
import {
  canMoveToColumn,
  groupApplicationsByStatus,
  isDraggable,
} from "./PartnersKanban.logic";
import type { OnboardingStatus, PartnerApplication } from "@/types/domain";

type Props = {
  applications: PartnerApplication[];
  onSelect: (app: PartnerApplication) => void;
  onMove: (app: PartnerApplication, target: OnboardingStatus) => void;
  movingId?: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PartnersKanban({ applications, onSelect, onMove, movingId }: Props) {
  const columns = groupApplicationsByStatus(applications);
  const [dragging, setDragging] = React.useState<PartnerApplication | null>(null);
  const [overStatus, setOverStatus] = React.useState<OnboardingStatus | null>(null);

  const dragFrom = dragging
    ? ((dragging.company?.onboarding_status ?? "pending_review") as OnboardingStatus)
    : null;

  function handleDrop(target: OnboardingStatus) {
    const app = dragging;
    setDragging(null);
    setOverStatus(null);
    if (!app) return;
    const from = (app.company?.onboarding_status ?? "pending_review") as OnboardingStatus;
    if (canMoveToColumn(from, target)) onMove(app, target);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => {
        const totalSpots = col.applications.reduce((sum, a) => sum + (a.estimated_spots ?? 0), 0);
        const isValidTarget = dragFrom != null && canMoveToColumn(dragFrom, col.status);
        const isOver = overStatus === col.status && isValidTarget;
        return (
          <div
            key={col.status}
            data-testid={`kanban-col-${col.status}`}
            onDragOver={(e) => {
              if (!isValidTarget) return;
              e.preventDefault();
              setOverStatus(col.status);
            }}
            onDragLeave={(e) => {
              // Só limpa se saiu de fato da coluna (não ao passar sobre um filho).
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverStatus((s) => (s === col.status ? null : s));
              }
            }}
            onDrop={() => handleDrop(col.status)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-md border border-transparent bg-surface-soft transition-colors",
              isOver && "border-mp-indigo bg-surface-pale",
              isValidTarget && !isOver && "border-dashed border-hairline",
            )}
          >
            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
              <span className="truncate text-button-sm text-ink">
                {col.label} ({col.applications.length})
              </span>
              <span className="shrink-0 rounded-sm bg-canvas px-2 py-0.5 text-caption text-muted">
                {totalSpots} vagas
              </span>
            </div>

            <div className="flex min-h-[24rem] flex-col gap-2 px-2 pb-2">
              {col.applications.length === 0 ? (
                <p className="px-2 py-6 text-center text-caption text-muted">Nenhuma negociação</p>
              ) : (
                col.applications.map((a) => {
                  const from = (a.company?.onboarding_status ?? "pending_review") as OnboardingStatus;
                  const draggable = isDraggable(from);
                  const isMoving = movingId === a.company_id;
                  return (
                    <div
                      key={a.company_id}
                      data-testid={`kanban-card-${a.company_id}`}
                      draggable={draggable && !isMoving}
                      onDragStart={() => setDragging(a)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOverStatus(null);
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(a)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(a);
                        }
                      }}
                      className={cn(
                        "flex flex-col gap-1 rounded-md border border-hairline bg-canvas p-3 text-left shadow-tier transition-colors hover:border-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
                        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                        isMoving && "pointer-events-none opacity-50",
                      )}
                    >
                      <span className="text-body-sm font-medium text-ink">{a.company?.name}</span>
                      <span className="text-caption text-muted">{a.contact_name}</span>
                      <div className="mt-1 flex items-center justify-between text-caption text-muted">
                        <span>{[a.city, a.state].filter(Boolean).join(" / ") || "-"}</span>
                        <span>{a.estimated_spots != null ? `${a.estimated_spots} vagas` : "-"}</span>
                      </div>
                      <span className="text-caption text-muted">{fmtDate(a.submitted_at)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
