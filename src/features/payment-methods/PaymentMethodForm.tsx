import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/auth/context";
import { detectBrand, useCreatePaymentMethod } from "./api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function cardMask(value: string) {
  const v = value.replace(/\D/g, "").slice(0, 19);
  return v.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function expiryMask(value: string) {
  const v = value.replace(/\D/g, "").slice(0, 4);
  if (v.length <= 2) return v;
  return `${v.slice(0, 2)}/${v.slice(2)}`;
}

export function PaymentMethodForm({ open, onOpenChange }: Props) {
  const { session } = useAuth();
  const create = useCreatePaymentMethod();

  const [number, setNumber] = React.useState("");
  const [holder, setHolder] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [cvv, setCvv] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setNumber("");
    setHolder("");
    setExpiry("");
    setCvv("");
    setIsDefault(false);
  }, [open]);

  const digits = number.replace(/\D/g, "");
  const brand = digits.length >= 4 ? detectBrand(digits) : null;
  const [mm, yy] = expiry.split("/");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (digits.length < 13) {
      toast.error("Número do cartão incompleto");
      return;
    }
    const monthNum = parseInt(mm ?? "", 10);
    const yearNum = parseInt(yy ?? "", 10);
    if (!monthNum || monthNum < 1 || monthNum > 12 || !yearNum) {
      toast.error("Validade inválida");
      return;
    }
    try {
      await create.mutateAsync({
        profile_id: session.userId,
        card_number: digits,
        holder_name: holder.trim() || undefined,
        expiry_month: monthNum,
        expiry_year: 2000 + yearNum,
        is_default: isDefault,
      });
      toast.success("Cartão adicionado");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo cartão</DialogTitle>
          <DialogDescription>
            Hoje os cartões são mockados. Quando integrarmos gateway real, o
            número será tokenizado e nunca armazenado em texto puro.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="number">Número do cartão</Label>
            <div className="relative">
              <Input
                id="number"
                value={number}
                onChange={(e) => setNumber(cardMask(e.target.value))}
                placeholder="0000 0000 0000 0000"
                inputMode="numeric"
                autoComplete="cc-number"
                required
              />
              {brand && brand !== "unknown" && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption-sm uppercase text-muted">
                  {brand}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holder">Nome impresso no cartão</Label>
            <Input
              id="holder"
              value={holder}
              onChange={(e) => setHolder(e.target.value.toUpperCase())}
              placeholder="NOME COMPLETO"
              autoComplete="cc-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expiry">Validade</Label>
              <Input
                id="expiry"
                value={expiry}
                onChange={(e) => setExpiry(expiryMask(e.target.value))}
                placeholder="MM/AA"
                inputMode="numeric"
                autoComplete="cc-exp"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvv">CVV</Label>
              <Input
                id="cvv"
                value={cvv}
                onChange={(e) =>
                  setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="123"
                inputMode="numeric"
                autoComplete="cc-csc"
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-body-sm">
            <Checkbox
              id="default"
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v === true)}
            />
            Usar como cartão padrão
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
