import { useParams } from "react-router-dom";
import { BookingDetailView } from "@/features/bookings/BookingDetailView";

/** Manager › Reservas › <código>: a tela da reserva, com a coluna da Movepark e o rastro do gateway. */
export default function ManagerBookingDetail() {
  const { code } = useParams<{ code: string }>();
  return <BookingDetailView code={code} audience="manager" />;
}
