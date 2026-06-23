import { Link } from "react-router-dom";
import { BadgeCheck, Building2, MapPin } from "lucide-react";
import type { ListingDetail } from "./api";

function yearsOnPlatform(createdAt: string): number {
  const created = new Date(createdAt);
  const diff = Date.now() - created.getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24 * 365)));
}

type Props = {
  company: ListingDetail["company"];
  others: ListingDetail["other_locations"];
};

export function OperatorCard({ company, others }: Props) {
  const years = yearsOnPlatform(company.created_at);

  return (
    <div className="rounded-md border border-hairline bg-canvas p-6">
      <div className="flex items-start gap-4">
        <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-mp-pale">
          <Building2 className="h-7 w-7 text-mp-indigo" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-title-md text-ink">{company.name}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-mp-pale px-3 py-1 text-caption-sm text-mp-indigo">
              <BadgeCheck className="h-3.5 w-3.5" />
              Operador verificado
            </span>
          </div>
          <p className="text-body-sm text-muted">
            {company.legal_name && (
              <span className="block">{company.legal_name}</span>
            )}
            Parceiro Movepark há {years}{" "}
            {years === 1 ? "ano" : "anos"}.
          </p>
        </div>
      </div>

      {others.length > 0 && (
        <div className="mt-6 space-y-2 border-t border-hairline-soft pt-6">
          <div className="text-caption text-muted">Outras localizações</div>
          <ul className="space-y-1">
            {others.map((loc) => (
              <li key={loc.id}>
                <Link
                  to={`/p/${company.slug}/${loc.slug}`}
                  className="flex items-center gap-2 text-body-sm text-ink no-underline hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5 text-muted" />
                  {loc.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
