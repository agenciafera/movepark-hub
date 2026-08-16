import * as React from "react";
import { toast } from "sonner";
import { Warning } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PhoneField } from "@/components/ui/phone-field";
import { normalizePhoneE164 } from "@/lib/identifiers";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useLocationExternalReadiness, useSetCheckoutMode, useSetGo2Park } from "./api";
import type { CheckoutMode, LocationExternalReadiness } from "@/types/domain";

type Props = {
  open: boolean;
  locationId: string;
  locationName: string;
  mode: CheckoutMode;
  /** A unidade opera o transfer com a Go2Park (`location.go2park_enabled`). */
  go2park: boolean;
  /** WhatsApp da van desta unidade, em E.164 (`location.go2park_whatsapp`). */
  go2parkWhatsapp: string | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * As decisões de PLATAFORMA da unidade, num lugar só: onde a reserva fecha (E0.14) e se o
 * transfer é rastreado pela Go2Park. As duas são da Movepark, não do parceiro, e as duas têm
 * trigger próprio no banco (`location_checkout_mode_guard`, `location_go2park_guard`).
 *
 * A UI é espelho: quem decide é o banco, então esconder o botão aqui não seria permissão. O que
 * a tela acrescenta é o motivo, porque toggle cinza sem explicação vira chamado de suporte.
 */
export function LocationPlatformDialog({
  open,
  locationId,
  locationName,
  mode,
  go2park,
  go2parkWhatsapp,
  onOpenChange,
}: Props) {
  const readiness = useLocationExternalReadiness(locationId, open);
  const setMode = useSetCheckoutMode();
  const setGo2Park = useSetGo2Park();
  const isExternal = mode === "external";

  const blockers = readiness.data ? describeBlockers(readiness.data) : [];
  const canTurnOn = readiness.data?.ready === true;

  async function handleToggle(next: boolean) {
    try {
      await setMode.mutateAsync({ id: locationId, mode: next ? "external" : "hub" });
      toast.success("Checkout da unidade atualizado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível mudar o checkout.");
    }
  }

  async function handleWhatsapp(valor: string | null) {
    try {
      await setGo2Park.mutateAsync({ id: locationId, whatsapp: valor });
      toast.success(valor ? "Número da van salvo." : "Número da van removido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o número.");
    }
  }

  async function handleGo2Park(next: boolean) {
    try {
      await setGo2Park.mutateAsync({ id: locationId, enabled: next });
      toast.success(next ? "Go2Park ligada nesta unidade." : "Go2Park desligada nesta unidade.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível mudar a Go2Park.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuração da unidade</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-muted">
            O que só a Movepark define em <strong className="text-ink">{locationName}</strong>. O
            parceiro não vê nem edita nada daqui.
          </p>

          {/* ── Onde a reserva fecha (E0.14) ─────────────────────────────── */}
          <div className="flex items-center justify-between gap-4 rounded-md border border-hairline p-4">
            <div>
              <p id="checkout-mode-title" className="text-body-sm font-medium text-ink">
                Fechar a reserva no site do parceiro
              </p>
              <p id="checkout-mode-desc" className="text-caption text-muted">
                No modo externo o cliente termina no site do parceiro, com a marcação de afiliado.
                Vale só para esta unidade.
              </p>
            </div>
            <Switch
              checked={isExternal}
              disabled={setMode.isPending || (!isExternal && !canTurnOn)}
              onCheckedChange={handleToggle}
              aria-labelledby="checkout-mode-title"
              aria-describedby="checkout-mode-desc"
            />
          </div>

          {readiness.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : blockers.length > 0 && !isExternal ? (
            <div className="flex gap-3 rounded-md border border-hairline bg-surface-soft p-4">
              <Warning className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="flex flex-col gap-1">
                <p className="text-body-sm font-medium text-ink">
                  Falta configurar antes de apontar para fora
                </p>
                <ul className="flex list-disc flex-col gap-0.5 pl-4 text-caption text-muted">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {isExternal && (
            <p className="text-caption text-muted">
              Nesta unidade, a Movepark não controla cancelamento, cupom nem vaga garantida.
            </p>
          )}

          <Separator />

          {/* ── Go2Park ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4 rounded-md border border-hairline p-4">
            <div>
              <p id="go2park-title" className="text-body-sm font-medium text-ink">
                Transfer com rastreio ao vivo (Go2Park)
              </p>
              <p id="go2park-desc" className="text-caption text-muted">
                Ligado, o cliente vê o selo no card e o bloco na página da unidade. Desligue no dia
                em que o contrato acabar, senão a página promete um rastreio que a van não tem.
              </p>
            </div>
            <Switch
              checked={go2park}
              disabled={setGo2Park.isPending}
              onCheckedChange={handleGo2Park}
              aria-labelledby="go2park-title"
              aria-describedby="go2park-desc"
            />
          </div>

          {go2park && (
            <VanWhatsappField
              value={go2parkWhatsapp}
              salvando={setGo2Park.isPending}
              onSave={handleWhatsapp}
            />
          )}

          {go2park && isExternal && (
            <p className="text-caption text-muted">
              O selo continua aparecendo mesmo com o checkout externo: a van tem rastreio
              independentemente de onde a reserva fecha.
            </p>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Número da van desta unidade. Cada estacionamento tem o seu, e hoje ele mora no painel da
 * Go2Park: até existir integração, alguém copia de lá para cá. Enquanto está vazio, a página da
 * unidade mostra o bloco sem o botão de contato, que é melhor do que mandar o cliente para o
 * número de outro lote no momento em que ele pousa.
 */
function VanWhatsappField({
  value,
  salvando,
  onSave,
}: {
  value: string | null;
  salvando: boolean;
  onSave: (valor: string | null) => Promise<void>;
}) {
  const [rascunho, setRascunho] = React.useState<string | undefined>(value ?? undefined);
  const [erro, setErro] = React.useState<string | null>(null);

  // O valor do banco manda: depois de salvar (ou trocar de unidade), o campo reflete o que ficou
  // gravado, e não o que a pessoa digitou por último.
  React.useEffect(() => setRascunho(value ?? undefined), [value]);

  const sujo = (rascunho ?? "") !== (value ?? "");

  async function salvar() {
    const bruto = (rascunho ?? "").trim();
    if (!bruto) {
      setErro(null);
      await onSave(null);
      return;
    }
    const e164 = normalizePhoneE164(bruto);
    if (!e164) {
      setErro("Número inválido. Confira o DDD e os dígitos.");
      return;
    }
    setErro(null);
    await onSave(e164);
  }

  return (
    <div className="space-y-2 rounded-md border border-hairline p-4">
      <div>
        <label htmlFor="go2park-whatsapp" className="text-body-sm font-medium text-ink">
          WhatsApp da van
        </label>
        <p className="text-caption text-muted">
          O número desta unidade no painel da Go2Park. Com ele preenchido, a página oferece o
          contato da van para o cliente salvar na agenda.
        </p>
      </div>
      <div className="flex flex-col gap-2 tablet:flex-row tablet:items-start">
        <div className="flex-1">
          <PhoneField
            id="go2park-whatsapp"
            value={rascunho}
            onChange={setRascunho}
            placeholder="(19) 99999-9999"
            disabled={salvando}
            aria-invalid={!!erro}
            aria-describedby={erro ? "go2park-whatsapp-erro" : undefined}
          />
        </div>
        <Button type="button" size="sm" onClick={salvar} disabled={salvando || !sujo}>
          Salvar
        </Button>
      </div>
      {erro && (
        <p id="go2park-whatsapp-erro" role="alert" className="text-caption text-error">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Traduz o retorno da RPC de pré-voo no que a pessoa precisa resolver. */
export function describeBlockers(r: LocationExternalReadiness): string[] {
  const out: string[] = [];
  for (const field of r.missing_company ?? []) {
    out.push(`Falta na empresa: ${field}`);
  }
  if (r.unmapped_count > 0) {
    const plural = r.unmapped_count === 1 ? "tipo de vaga" : "tipos de vaga";
    const names = (r.unmapped_names ?? []).join(", ");
    out.push(
      `${r.unmapped_count} ${plural} sem mapeamento com o white-label${names ? ` (${names})` : ""}`,
    );
  }
  return out;
}
