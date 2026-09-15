import { Link, useParams } from "react-router-dom";
import { EyeSlash } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListingDraft } from "@/features/listing/api";
import { ReservationCard } from "@/features/listing/ReservationCard";

/**
 * Modo rascunho (15/09/2026): a Movepark testa uma unidade de ponta a ponta (preço, reserva,
 * pagamento, cancelamento) antes de ela ir ao ar. Só hub_admin chega aqui; para o público a
 * unidade não listada continua invisível na busca, no sitemap e na URL pública (o Worker dá 404).
 *
 * A página existe dentro do Manager de propósito: a ficha pública é pré-renderizada só para
 * unidade listada, e a borda não tem como saber que quem abre a URL é você.
 */
export default function ManagerRascunho() {
  const { companyId, locationId } = useParams<{ companyId: string; locationId: string }>();
  const { data: listing, isLoading, error } = useListingDraft(locationId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !listing) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Rascunho" description="Teste da unidade antes de ir ao ar." />
        <EmptyState
          title="Não consegui montar a ficha"
          description="A unidade precisa de destino e slug público, e de pelo menos um tipo de vaga ativo com preço."
        />
      </div>
    );
  }

  const nome = listing.location.public_name ?? listing.location.name;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={nome}
        description="Ficha em rascunho: só você vê. Reserve e pague como cliente para provar o fluxo inteiro."
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-6 tablet:flex-row tablet:items-center tablet:justify-between">
          <div className="flex items-center gap-2">
            <EyeSlash />
            <span className="text-body text-ink">Não listada</span>
            <Badge tone="neutral">invisível para clientes</Badge>
          </div>
          <div className="text-caption text-muted">
            A reserva sai no seu nome. Cancelar é em Manager › Reservas, como staff.
          </div>
          {companyId && (
            <Button size="sm" variant="ghost" asChild>
              <Link to={`/manager/companies/${companyId}/locations`}>Voltar às unidades</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="max-w-xl">
        <ReservationCard listing={listing} initialFrom={null} initialTo={null} />
      </div>
    </div>
  );
}
