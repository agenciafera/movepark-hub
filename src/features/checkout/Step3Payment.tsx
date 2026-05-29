import * as React from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, CreditCard, Hourglass, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useMockPayment } from "./api";
import { toSvgString } from "@/lib/qr";

type Props = {
  bookingCode: string;
  totalAmount: number;
  paymentStatus: "pending" | "authorized" | "paid" | "refunded" | "failed" | "cancelled" | null;
  onBack: () => void;
};

const SUGGESTED = {
  approved: "4111 1111 1111 1111",
  declined: "4000 0000 0000 0002",
};

export function Step3Payment({ bookingCode, paymentStatus, onBack }: Props) {
  const mock = useMockPayment();
  const [pixPayload, setPixPayload] = React.useState<string | null>(null);
  const [pixSvg, setPixSvg] = React.useState<string | null>(null);
  const [cardNumber, setCardNumber] = React.useState("");
  const [cardName, setCardName] = React.useState("");
  const [cardExpiry, setCardExpiry] = React.useState("");
  const [cardCvv, setCardCvv] = React.useState("");

  async function initPix() {
    try {
      const res = await mock.mutateAsync({
        booking_code: bookingCode,
        method: "pix",
      });
      setPixPayload(res.pix_payload);
      if (res.pix_payload) {
        const svg = await toSvgString(res.pix_payload, 256);
        setPixSvg(svg);
      }
      toast.success("PIX gerado — confirme no seu app de banco");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PIX");
    }
  }

  async function payCard(e: React.FormEvent) {
    e.preventDefault();
    try {
      await mock.mutateAsync({
        booking_code: bookingCode,
        method: "card",
        card_number: cardNumber,
      });
      toast.success("Pagamento autorizado — confirmando…");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pagamento recusado");
    }
  }

  function copyPix() {
    if (!pixPayload) return;
    navigator.clipboard.writeText(pixPayload);
    toast.success("Código copiado");
  }

  // Quando payment status já é pending (mock_payment foi disparado), mostra estado de espera
  const waitingForConfirmation =
    paymentStatus === "pending" || mock.isPending;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-display-sm text-ink">Pagamento</h2>
        <p className="text-body-md text-muted">
          Pagamento mockado pra essa fase — confirma sozinho em alguns
          segundos.
        </p>
      </div>

      <Tabs defaultValue="pix">
        <TabsList>
          <TabsTrigger value="pix" className="inline-flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            PIX
          </TabsTrigger>
          <TabsTrigger value="card" className="inline-flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Cartão
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pix">
          <div className="mt-2 rounded-md border border-hairline bg-canvas p-6">
            {!pixPayload && !waitingForConfirmation && (
              <div className="space-y-4 text-center">
                <p className="text-body-md text-body">
                  Gere o código PIX e o pagamento confirma sozinho em ~3
                  segundos.
                </p>
                <Button onClick={initPix} disabled={mock.isPending}>
                  {mock.isPending ? "Gerando…" : "Gerar PIX"}
                </Button>
              </div>
            )}

            {pixPayload && (
              <div className="space-y-4 text-center">
                <div className="mx-auto inline-block rounded-md border border-hairline bg-canvas p-3">
                  {pixSvg ? (
                    <div
                      className="h-64 w-64"
                      dangerouslySetInnerHTML={{ __html: pixSvg }}
                    />
                  ) : (
                    <Skeleton className="h-64 w-64" />
                  )}
                </div>
                <div className="space-y-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={copyPix}
                    className="mx-auto"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar código PIX
                  </Button>
                  <p className="inline-flex items-center justify-center gap-2 text-caption text-muted">
                    <Hourglass className="h-3.5 w-3.5" />
                    Aguardando confirmação automática…
                  </p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="card">
          <form
            onSubmit={payCard}
            className="mt-2 space-y-4 rounded-md border border-hairline bg-canvas p-6"
          >
            <div className="rounded-sm bg-mp-pale p-3 text-caption text-mp-indigo">
              <strong>Cartões de teste:</strong>
              <br />
              Aprovado: <code>{SUGGESTED.approved}</code>
              <br />
              Recusado: <code>{SUGGESTED.declined}</code>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="card-number">Número do cartão</Label>
              <Input
                id="card-number"
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="card-name">Nome no cartão</Label>
              <Input
                id="card-name"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-expiry">Validade (MM/AA)</Label>
                <Input
                  id="card-expiry"
                  inputMode="numeric"
                  placeholder="12/27"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-cvv">CVV</Label>
                <Input
                  id="card-cvv"
                  inputMode="numeric"
                  placeholder="123"
                  maxLength={4}
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={mock.isPending || waitingForConfirmation}
            >
              {mock.isPending
                ? "Autorizando…"
                : waitingForConfirmation
                  ? "Confirmando…"
                  : "Confirmar pagamento"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>
    </div>
  );
}
