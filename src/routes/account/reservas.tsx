import { CustomerBookingsPanel } from "@/features/bookings/CustomerBookingsPanel";

/**
 * `/account/reservas` — "Minhas reservas" dentro do shell da conta, mantendo a
 * sidebar. Mesmo conteúdo de `/bookings` (via CustomerBookingsPanel), só que sem
 * pular pro shell do consumer.
 */
export default function AccountReservasPage() {
  return <CustomerBookingsPanel detailBase="/account/reservas" />;
}
