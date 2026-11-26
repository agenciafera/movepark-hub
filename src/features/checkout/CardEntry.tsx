import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardBrandMark } from "@/components/shared/CardBrandMark";
import { cardExpiryMask, cardNumberMask, onlyDigits } from "@/lib/masks";
import { brandLabel, detectBrand } from "@/lib/card-brand";
import { formatCep } from "./billingAddress.logic";
import type { CardEntry } from "./useCardEntry";

/**
 * Os campos do cartão: escolher um salvo ou digitar um novo, com endereço de cobrança e a opção de
 * salvar. `idPrefix` separa os ids quando há mais de um formulário na mesma página.
 */
export function CardEntryFields({ entry, idPrefix = "card" }: { entry: CardEntry; idPrefix?: string }) {
  const id = (s: string) => `${idPrefix}-${s}`;
  const marca = detectBrand(entry.cardNumber);
  return (
    <>
      {entry.savedCards.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("choice")}>Cartão</Label>
          <Select value={entry.cardChoice} onValueChange={entry.setCardChoice}>
            <SelectTrigger id={id("choice")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entry.savedCards.map((pm) => (
                <SelectItem key={pm.id} value={pm.id}>
                  <span className="inline-flex items-center gap-2">
                    <CardBrandMark brand={pm.brand} />
                    <span>
                      {brandLabel(pm.brand)} •••• {pm.last4}
                    </span>
                  </span>
                </SelectItem>
              ))}
              <SelectItem value="new">Usar outro cartão</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!entry.isSaved && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("number")}>Número do cartão</Label>
            <div className="relative">
              <Input
                id={id("number")}
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="0000 0000 0000 0000"
                className="pr-14"
                value={entry.cardNumber}
                onChange={(e) => entry.setCardNumber(cardNumberMask(e.target.value))}
                required
              />
              {/* A bandeira aparece assim que dá para reconhecer, antes de o cliente terminar. */}
              {marca !== "card" && (
                <CardBrandMark brand={marca} className="absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("name")}>Nome no cartão</Label>
            <Input
              id={id("name")}
              placeholder="NOME SOBRENOME"
              value={entry.cardName}
              onChange={(e) => entry.setCardName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("expiry")}>Validade (MM/AA)</Label>
              <Input
                id={id("expiry")}
                inputMode="numeric"
                placeholder="12/27"
                autoComplete="cc-exp"
                maxLength={5}
                value={entry.cardExpiry}
                onChange={(e) => entry.setCardExpiry(cardExpiryMask(e.target.value))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("cvv")}>CVV</Label>
              <Input
                id={id("cvv")}
                inputMode="numeric"
                placeholder="123"
                maxLength={4}
                value={entry.cardCvv}
                onChange={(e) => entry.setCardCvv(onlyDigits(e.target.value))}
                required
              />
            </div>
          </div>
          {/* Endereço de cobrança: o antifraude exige; só CEP e número são digitados. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("cep")}>CEP do endereço do cartão</Label>
              <Input
                id={id("cep")}
                inputMode="numeric"
                placeholder="00000-000"
                value={entry.cep}
                onChange={(e) => entry.setCep(formatCep(e.target.value))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("addr-number")}>Número</Label>
              <Input
                id={id("addr-number")}
                placeholder="123"
                value={entry.addrNumber}
                onChange={(e) => entry.setAddrNumber(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("addr-complement")}>Complemento (opcional)</Label>
            <Input
              id={id("addr-complement")}
              placeholder="apto, bloco, sala"
              value={entry.addrComplement}
              onChange={(e) => entry.setAddrComplement(e.target.value)}
            />
          </div>
          {entry.cepStatus === "loading" && <p className="text-caption text-muted">Buscando o endereço…</p>}
          {entry.cepStatus === "notfound" && (
            <p className="text-caption text-error" data-testid="cep-nao-encontrado">
              Não achamos esse CEP. Confira os dígitos.
            </p>
          )}
          {entry.cepStatus === "ok" && (
            <p className="text-caption text-muted" data-testid="cep-endereco">
              {[entry.addr.street, entry.addr.neighborhood].filter(Boolean).join(", ")}
              {entry.addr.street || entry.addr.neighborhood ? " · " : ""}
              {entry.addr.city}/{entry.addr.state}
            </p>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-body-sm text-body">
            <input
              type="checkbox"
              checked={entry.saveCard}
              onChange={(e) => entry.setSaveCard(e.target.checked)}
              className="h-4 w-4 rounded border-hairline accent-mp-indigo"
            />
            Salvar este cartão para as próximas reservas
          </label>
        </>
      )}
    </>
  );
}
