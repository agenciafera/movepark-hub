import { PageHeader } from "@/components/shared/PageHeader";
import { CouponWalletView } from "@/features/customer-coupons/CouponWalletView";

/** `/account/descontos`: a carteira de cupons do cliente. Aplicar é no checkout. */
export default function AccountDescontosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Descontos"
        description="Seus cupons ficam guardados aqui até a hora de reservar."
      />
      <CouponWalletView />
    </div>
  );
}
