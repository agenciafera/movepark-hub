import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/context";
import { useRedeemCoupon } from "./api";
import { couponRedeemError, normalizeRedeemInput } from "./couponWallet.logic";
import { storeCoupon } from "@/lib/coupon";

/**
 * Campo de resgate de código, o mesmo da referência.
 *
 * Ele se comporta de dois jeitos, e a diferença não é cosmética:
 *
 *  - **Com sessão**, chama `coupon_redeem`, que CONFERE o código no servidor (existe, está ativo,
 *    não esgotou) e guarda na carteira. O retorno é veredito de verdade.
 *  - **Sem sessão**, não há como conferir: `coupon_redeem` exige `auth.uid()`, e validar por outro
 *    caminho exigiria expor o catálogo de códigos. Então o código é guardado na sessão (o mesmo
 *    canal do link de campanha) e a mensagem diz **que a conferência acontece no pagamento**.
 *    Fingir que o código foi aceito seria pior: a pessoa fecharia a reserva esperando um desconto
 *    que talvez nunca existisse.
 */
export function ResgatarCodigo() {
  const { session } = useAuth();
  const redeem = useRedeemCoupon();
  const [codigo, setCodigo] = React.useState("");

  async function resgatar(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeRedeemInput(codigo);
    if (!c) return;

    if (!session) {
      storeCoupon(c);
      setCodigo("");
      toast.success("Código guardado. Conferimos ele quando você fechar a reserva.");
      return;
    }

    try {
      const res = await redeem.mutateAsync(c);
      if (res.ok) {
        setCodigo("");
        toast.success("Cupom guardado na sua conta");
      } else {
        toast.error(couponRedeemError(res.error_code));
      }
    } catch {
      toast.error("Não foi possível guardar o cupom agora");
    }
  }

  return (
    <form
      onSubmit={resgatar}
      className="mb-8 flex flex-col gap-2 rounded-md border border-hairline bg-canvas p-4 tablet:flex-row tablet:items-center"
    >
      <Input
        value={codigo}
        // O maiúsculo é feito no VALOR, e não por CSS: `uppercase` pega o placeholder junto, e
        // `placeholder:normal-case` não gera regra neste projeto (medido no navegador). Caixa alta
        // em texto de interface é o que o DESIGN.md rejeita.
        onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        placeholder="Digite o código promocional"
        aria-label="Código promocional"
        className="tablet:flex-1"
      />
      <Button type="submit" disabled={redeem.isPending || !codigo.trim()} className="shrink-0">
        Resgatar
      </Button>
    </form>
  );
}
