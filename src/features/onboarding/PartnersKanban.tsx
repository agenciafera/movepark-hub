import { groupApplicationsByStatus } from "./PartnersKanban.logic";
import type { PartnerApplication } from "@/types/domain";

type Props = {
  applications: PartnerApplication[];
  onSelect: (app: PartnerApplication) => void;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PartnersKanban({ applications, onSelect }: Props) {
  const columns = groupApplicationsByStatus(applications);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col.status} className="flex w-72 shrink-0 flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-button-sm text-ink">{col.label}</span>
            <span className="text-caption text-muted">{col.applications.length}</span>
          </div>

          <div className="flex min-h-16 flex-col gap-2 rounded-md bg-surface-soft p-2">
            {col.applications.length === 0 ? (
              <p className="px-2 py-6 text-center text-caption text-muted">Nenhum</p>
            ) : (
              col.applications.map((a) => (
                <button
                  key={a.company_id}
                  type="button"
                  onClick={() => onSelect(a)}
                  className="flex flex-col gap-1 rounded-md border border-hairline bg-canvas p-3 text-left shadow-tier transition-colors hover:border-ink/30"
                >
                  <span className="text-body-sm font-medium text-ink">{a.company?.name}</span>
                  <span className="text-caption text-muted">{a.contact_name}</span>
                  <div className="mt-1 flex items-center justify-between text-caption text-muted">
                    <span>{[a.city, a.state].filter(Boolean).join(" / ") || "—"}</span>
                    <span>{a.estimated_spots != null ? `${a.estimated_spots} vagas` : "—"}</span>
                  </div>
                  <span className="text-caption text-muted">{fmtDate(a.submitted_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
