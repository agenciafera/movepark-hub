import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/auth/context";
import { useMyBookings, type MyBookingStatus } from "@/features/bookings/customerApi";
import { CustomerBookingCard } from "@/features/bookings/CustomerBookingCard";

const tabs: { id: MyBookingStatus; label: string }[] = [
  { id: "upcoming", label: "Próximas" },
  { id: "active", label: "Em uso" },
  { id: "history", label: "Histórico" },
  { id: "cancelled", label: "Canceladas" },
];

const emptyCopy: Record<MyBookingStatus, { title: string; description: string }> = {
  upcoming: {
    title: "Você ainda não tem reservas futuras.",
    description: "Comece buscando uma vaga.",
  },
  active: {
    title: "Nada em uso agora.",
    description: "Reservas em andamento aparecem aqui.",
  },
  history: {
    title: "Seu histórico está vazio.",
    description: "Reservas concluídas aparecem aqui.",
  },
  cancelled: {
    title: "Sem reservas canceladas.",
    description: "Quando uma reserva for cancelada, vai aparecer aqui.",
  },
};

export default function BookingsListPage() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const activeTab = (params.get("tab") as MyBookingStatus) ?? "upcoming";

  function setTab(t: MyBookingStatus) {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next, { replace: true });
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 desktop:px-8">
      <PageHeader title="Minhas reservas" description="Acesse seus vouchers e histórico." />

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as MyBookingStatus)} className="mt-6">
        <TabsList className="overflow-x-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-6 space-y-3">
            <BookingsList profileId={session?.userId} bucket={t.id} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function BookingsList({
  profileId,
  bucket,
}: {
  profileId: string | undefined;
  bucket: MyBookingStatus;
}) {
  const { data, isLoading, error } = useMyBookings(profileId, bucket);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
        {(error as Error).message}
      </div>
    );
  }

  if (!data || data.length === 0) {
    const copy = emptyCopy[bucket];
    return (
      <EmptyState
        icon={<Search className="h-10 w-10" />}
        title={copy.title}
        description={copy.description}
        action={
          bucket === "upcoming" ? (
            <Button asChild>
              <Link to="/">Buscar vaga</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.map((b) => (
        <CustomerBookingCard key={b.id} item={b} />
      ))}
    </div>
  );
}
