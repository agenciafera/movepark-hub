import { Button } from "@/components/ui/button";
import { withSearchDates } from "./externalCheckout";
import type { ListingDetail } from "./api";

type Props = {
  listing: ListingDetail;
  from: Date | null;
  to: Date | null;
};

/**
 * Card de saída da unidade externa (E0.15), no lugar do card de reserva.
 *
 * Não tem seletor de tarifa, cupom, serviço extra nem total: nada disso é nosso nesta unidade.
 * Tem o que é verdade, que é para onde a reserva vai e quem responde por ela depois.
 *
 * A URL vem pronta do servidor com a marcação de afiliado; aqui só entram as datas da busca,
 * para o cliente não recomeçar a seleção do outro lado.
 *
 * Sem URL o card não renderiza. Isso só acontece se o De/Para tiver sido desfeito depois do
 * pré-voo, e mandar o cliente para um link quebrado é pior que não oferecer o botão.
 */
export function ExternalCheckoutCard({ listing, from, to }: Props) {
  const href = withSearchDates(listing.external_checkout_url, from, to);
  if (!href) return null;

  return (
    <div className="rounded-md border border-hairline bg-canvas p-5 space-y-4">
      <div className="space-y-1">
        <p className="text-title-sm text-ink">{listing.company.name}</p>
        <p className="text-body-sm text-muted">
          A reserva desta unidade é feita no site do próprio estacionamento.
        </p>
      </div>

      <Button asChild className="w-full">
        <a href={href} data-testid="external-checkout-cta">
          Reservar no site do estacionamento
        </a>
      </Button>

      <p className="text-caption text-muted">
        Cancelamento, alteração e atendimento seguem as condições do estacionamento.
      </p>
    </div>
  );
}
