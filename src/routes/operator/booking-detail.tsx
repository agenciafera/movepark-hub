import { useParams } from "react-router-dom";
import { BookingDetailView } from "@/features/bookings/BookingDetailView";

/** Operator › Reservas › <código>: a mesma tela, com a parte do estacionamento e as ações de operação. */
export default function OperatorBookingDetail() {
  const { code } = useParams<{ code: string }>();
  return <BookingDetailView code={code} audience="operator" />;
}
