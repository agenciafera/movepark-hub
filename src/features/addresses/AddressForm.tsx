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
import { StateSelect } from "@/components/shared/StateSelect";
import { useAuth } from "@/auth/context";
import type { Database } from "@/types/database";
import {
  lookupCep,
  useCreateAddress,
  useUpdateAddress,
} from "./api";

type AddressRow = Database["public"]["Tables"]["address"]["Row"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address?: AddressRow | null;
};

function cepMask(value: string) {
  const v = value.replace(/\D/g, "").slice(0, 8);
  if (v.length <= 5) return v;
  return `${v.slice(0, 5)}-${v.slice(5)}`;
}

export function AddressForm({ open, onOpenChange, address }: Props) {
  const { session } = useAuth();
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const editing = !!address;

  const [label, setLabel] = React.useState("");
  const [cep, setCep] = React.useState("");
  const [street, setStreet] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [complement, setComplement] = React.useState("");
  const [district, setDistrict] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [lookingUp, setLookingUp] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLabel(address?.label ?? "");
    setCep(cepMask(address?.postal_code ?? ""));
    setStreet(address?.street ?? "");
    setNumber(address?.number ?? "");
    setComplement(address?.complement ?? "");
    setDistrict(address?.district ?? "");
    setCity(address?.city ?? "");
    setState(address?.state ?? "");
    setIsDefault(address?.is_default ?? false);
  }, [open, address]);

  async function handleCepBlur() {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLookingUp(true);
    try {
      const data = await lookupCep(digits);
      if (data.street) setStreet(data.street);
      if (data.district) setDistrict(data.district);
      if (data.city) setCity(data.city);
      if (data.state) setState(data.state);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no CEP");
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    try {
      const payload = {
        label: label.trim() || null,
        postal_code: cep.replace(/\D/g, "") || null,
        street: street.trim(),
        number: number.trim() || null,
        complement: complement.trim() || null,
        district: district.trim() || null,
        city: city.trim(),
        state: state.trim().toUpperCase() || null,
        is_default: isDefault,
      };
      if (editing && address) {
        await update.mutateAsync({
          id: address.id,
          profileId: session.userId,
          patch: payload,
        });
        toast.success("Endereço atualizado");
      } else {
        await create.mutateAsync({
          profile_id: session.userId,
          ...payload,
          street: payload.street,
          city: payload.city,
        });
        toast.success("Endereço adicionado");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const submitting = create.isPending || update.isPending;
  const canSubmit = !!street.trim() && !!city.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar endereço" : "Novo endereço"}
          </DialogTitle>
          <DialogDescription>
            Salve endereços pra usar como referência nas reservas.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label">Apelido</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Casa, trabalho…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cep">CEP</Label>
              <Input
                id="cep"
                value={cep}
                onChange={(e) => setCep(cepMask(e.target.value))}
                onBlur={handleCepBlur}
                placeholder="00000-000"
                disabled={lookingUp}
              />
              {lookingUp && (
                <span className="text-caption-sm text-muted">Buscando…</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="number">Número</Label>
              <Input
                id="number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="123"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="street">Logradouro</Label>
            <Input
              id="street"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Rua, av., travessa…"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="complement">Complemento</Label>
            <Input
              id="complement"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              placeholder="Apto, bloco, referência…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="district">Bairro</Label>
            <Input
              id="district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">Cidade</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="state">UF</Label>
              <StateSelect id="state" value={state} onValueChange={setState} />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-body-sm">
            <Checkbox
              id="default"
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v === true)}
            />
            Marcar como endereço padrão
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit}>
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
