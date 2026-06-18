import { useQuery } from "@tanstack/react-query";
import { startOfDay, endOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOperatorStats } from "./api";
import { RecipientKycBanner } from "@/features/payouts/RecipientKycBanner";
import { useAuth } from "@/auth/context";
import { useScopedLocationIds } from "@/auth/useScopedLocationIds";
import { supabase } from "@/lib/supabase";
import { formatBRL, formatTime } from "@/lib/format";
import type { BookingWithRelations } from "@/types/domain";

const baseSelect =
  "*, profile:profiles(id, full_name, phone, tax_id), location:location(id, name, slug, timezone, company:company(id, name, slug)), vehicle:vehicle(id, license_plate, model, color)";

function useTodayTimeline(locationIds: string[] | undefined) {
  return useQuery({
    queryKey: ["operator", "today-timeline", locationIds],
    queryFn: async (): Promise<BookingWithRelations[]> => {
      const dayStart = startOfDay(new Date()).toISOString();
      const dayEnd = endOfDay(new Date()).toISOString();
      let q = supabase
        .from("booking")
        .select(baseSelect)
        .or(
          `and(check_in_at.gte.${dayStart},check_in_at.lte.${dayEnd}),and(check_out_at.gte.${dayStart},check_out_at.lte.${dayEnd})`,
        )
        .order("check_in_at", { ascending: true })
        .limit(50);
      if (locationIds && locationIds.length > 0) {
        q = q.in("location_id", locationIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BookingWithRelations[];
    },
    refetchInterval: 30_000,
  });
}

export default function OperatorDashboard() {
  const { session, effectiveCompanyIds } = useAuth();
  const { ids: scopedLocationIds } = useScopedLocationIds();
  const stats = useOperatorStats(scopedLocationIds);
  const timeline = useTodayTimeline(scopedLocationIds);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={
          session?.companyIds.length
            ? "Visão operacional do dia."
            : "Você ainda não está vinculado a uma empresa."
        }
      />

      <RecipientKycBanner companyId={effectiveCompanyIds[0]} />

      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        <KpiCard
          label="Reservas Hoje"
          value={stats.data?.bookingsToday ?? 0}
          isLoading={stats.isLoading}
        />
        <KpiCard
          label="Check-ins Hoje"
          value={stats.data?.checkInsToday ?? 0}
          isLoading={stats.isLoading}
        />
        <KpiCard
          label="Check-outs Hoje"
          value={stats.data?.checkOutsToday ?? 0}
          isLoading={stats.isLoading}
        />
        <KpiCard
          label="Receita do Mês"
          value={formatBRL(stats.data?.revenueThisMonth ?? 0)}
          isLoading={stats.isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Linha do tempo — hoje</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (timeline.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Nenhuma reserva para hoje"
              description="Aproveite para organizar a operação."
            />
          ) : (
            <ol className="divide-y divide-hairline-soft">
              {timeline.data?.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-caption text-muted">
                      {formatTime(b.check_in_at)}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-ink">{b.profile?.full_name ?? "—"}</span>
                      <span className="text-caption text-muted">
                        {b.location?.name} · {b.vehicle?.license_plate ?? "Sem placa"}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
