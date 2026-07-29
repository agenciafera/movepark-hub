import BookingDetailPage from "@/routes/bookings-detail";

/**
 * `/account/reservas/:code` — detalhe da reserva no shell da conta. Reaproveita a
 * página de detalhe do consumer; `backTo` faz os links de "voltar" apontarem pra
 * `/account/reservas`, mantendo o usuário no shell da conta.
 */
export default function AccountReservaDetailPage() {
  return <BookingDetailPage backTo="/account/reservas" />;
}
