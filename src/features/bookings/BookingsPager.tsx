import { Button } from "@/components/ui/button";

/** Paginação da lista de reservas: a contagem vem do servidor, que pagina (`bookings_list_page`). */
export function BookingsPager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const inicio = page * pageSize + 1;
  const fim = Math.min(total, (page + 1) * pageSize);
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-body-sm tabular-nums text-muted">
        {fmt(inicio)} a {fmt(fim)} de {fmt(total)}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => onPage(page - 1)} disabled={page === 0}>
          Anterior
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onPage(page + 1)} disabled={fim >= total}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
