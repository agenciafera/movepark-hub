import * as React from "react";
import { Ticket } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { CouponCard } from "./CouponCard";
import { useCouponWallet, useRedeemCoupon, type OrderContext } from "./api";
import {
  couponRedeemError,
  normalizeRedeemInput,
  splitWallet,
  type WalletCoupon,
} from "./couponWallet.logic";

type Props = {
  /** Sem contexto: lista o que a pessoa tem. Com contexto: julga cada cupom para aquele pedido. */
  orderContext?: OrderContext;
  onUse?: (code: string) => void;
  applying?: boolean;
  appliedCode?: string | null;
  onClearCoupon?: () => void;
  /** Cupom já guardado para a próxima reserva (fora de contexto de pedido). */
  savedCode?: string | null;
  /** Rótulo do botão de cada cartão. */
  actionLabel?: string;
};

function Secao({ titulo, itens, ...rest }: { titulo: string; itens: WalletCoupon[] } & Props) {
  if (itens.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-title-md text-ink">{titulo}</h2>
      <div className="space-y-3">
        {itens.map((c) => (
          <CouponCard
            key={c.id}
            coupon={c}
            onUse={rest.onUse}
            applying={rest.applying}
            isApplied={rest.appliedCode === c.code}
            isSaved={rest.savedCode === c.code}
            actionLabel={rest.actionLabel}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * A carteira de cupons. Serve as duas telas (conta e checkout) porque a diferença entre elas é só
 * o contexto de pedido, e duplicar a lista deixaria as duas discordando sobre o que vale.
 */
export function CouponWalletView({
  orderContext = null,
  onUse,
  applying,
  appliedCode,
  onClearCoupon,
  savedCode,
  actionLabel,
}: Props) {
  const wallet = useCouponWallet(orderContext);
  const redeem = useRedeemCoupon();
  const [codigo, setCodigo] = React.useState("");
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [sucesso, setSucesso] = React.useState<string | null>(null);

  async function resgatar(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeRedeemInput(codigo);
    setAviso(null);
    setSucesso(null);
    if (!c) return;
    try {
      const res = await redeem.mutateAsync(c);
      if (res.ok) {
        setSucesso("Cupom guardado");
        setCodigo("");
      } else {
        setAviso(couponRedeemError(res.error_code));
      }
    } catch {
      setAviso("Não foi possível guardar o cupom agora");
    }
  }

  const itens = wallet.data?.items ?? [];
  const temPedido = Boolean(wallet.data?.has_order_context);
  const { available, unavailable } = splitWallet(itens);

  return (
    <div className="space-y-6">
      <form onSubmit={resgatar} className="flex gap-2">
        <Input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Digite o código"
          aria-label="Código promocional"
          className="uppercase"
        />
        <Button type="submit" variant="secondary" disabled={redeem.isPending || !codigo.trim()}>
          Resgatar
        </Button>
      </form>

      {aviso ? <p className="text-body-sm text-error">{aviso}</p> : null}
      {sucesso ? <p className="text-body-sm text-success">{sucesso}</p> : null}

      {wallet.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-error bg-badge-cancelled-bg p-4">
          <p className="text-body-sm text-error">Não conseguimos carregar seus cupons agora.</p>
          <Button variant="secondary" size="sm" onClick={() => wallet.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : wallet.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-10 w-10" />}
          title="Você ainda não tem cupom"
          description="Quando ganhar um, ele aparece aqui. Se alguém te passou um código, resgate no campo acima."
        />
      ) : (
        <>
          {temPedido && onClearCoupon && appliedCode ? (
            <div className="flex items-center justify-between rounded-lg border border-hairline bg-canvas p-4">
              <span className="text-body-sm text-ink">Não usar o cupom</span>
              <Button variant="secondary" size="sm" onClick={onClearCoupon} disabled={applying}>
                Aplicar
              </Button>
            </div>
          ) : null}

          <Secao
            titulo={temPedido ? "Disponível para esta reserva" : "Seus cupons"}
            itens={available}
            onUse={onUse}
            applying={applying}
            appliedCode={appliedCode}
            savedCode={savedCode}
            actionLabel={actionLabel}
          />
          <Secao titulo="Indisponível para esta reserva" itens={unavailable} />

          {!temPedido && !onUse ? (
            <p className="text-caption-sm text-muted">O desconto entra na hora de pagar.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
