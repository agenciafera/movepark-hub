import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { CouponWalletView } from "@/features/customer-coupons/CouponWalletView";
import {
  useApplyCouponToBooking,
  useReservaEmAndamento,
} from "@/features/customer-coupons/api";
import { couponUnavailableReason } from "@/features/customer-coupons/couponWallet.logic";
import { getStoredCoupon, storeCoupon } from "@/lib/coupon";

/**
 * `/account/descontos`: a carteira de cupons do cliente, acionável.
 *
 * A tela tem dois modos, e a diferença não é cosmética:
 *
 *  - **Com reserva em andamento**, ela é o mesmo seletor do checkout: cada cupom vem com veredito,
 *    motivo e valor real daquele pedido, e escolher aplica na reserva e leva para o pagamento.
 *  - **Sem reserva aberta**, não há pedido para julgar, então o cartão mostra as condições e
 *    escolher guarda o cupom para a próxima reserva (o mesmo canal do link de campanha `?cupom=`,
 *    que a página da unidade já lê ao criar a reserva).
 *
 * Os dois modos existem porque prometer "disponível" sem unidade e sem datas seria mentira: o
 * desconto depende do preço, do tipo de vaga e de a unidade fechar a reserva no Hub.
 */
export default function AccountDescontosPage() {
  const navigate = useNavigate();
  const reserva = useReservaEmAndamento();
  const aplicar = useApplyCouponToBooking();
  const [guardado, setGuardado] = React.useState<string | null>(() => getStoredCoupon());

  const emAndamento = reserva.data ?? null;

  async function escolher(code: string) {
    if (emAndamento) {
      const res = await aplicar.mutateAsync({ bookingId: emAndamento.id, code });
      if (!res.ok) {
        toast.error(couponUnavailableReason(res.error_code));
        return;
      }
      toast.success("Cupom aplicado na sua reserva");
      navigate(`/checkout/${emAndamento.code}`);
      return;
    }
    // Sem reserva aberta o cupom fica na sessão e entra sozinho na próxima que o cliente criar.
    storeCoupon(code);
    setGuardado(code);
    toast.success("Cupom guardado. Ele entra na sua próxima reserva.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Descontos"
        description={
          emAndamento
            ? "Escolha um cupom e ele entra na reserva que você deixou aberta."
            : "Seus cupons ficam guardados aqui até a hora de reservar."
        }
      />

      {emAndamento ? (
        <div className="flex flex-col gap-3 rounded-md border border-hairline bg-surface-soft p-4 tablet:flex-row tablet:items-center tablet:justify-between">
          <p className="text-body-sm text-ink">
            Você tem uma reserva em andamento
            {emAndamento.location_name ? ` em ${emAndamento.location_name}` : ""}.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/checkout/${emAndamento.code}`)}
          >
            Ir para o pagamento
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <CouponWalletView
        orderContext={emAndamento ? { bookingId: emAndamento.id } : null}
        onUse={escolher}
        applying={aplicar.isPending}
        savedCode={emAndamento ? null : guardado}
        actionLabel={emAndamento ? "Usar" : "Guardar"}
      />
    </div>
  );
}
