import * as React from "react";
import { toast } from "sonner";
import { Copy } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { siteUrl } from "@/lib/site";
import { usePartnerChannels } from "./api";
import { trackedLink } from "./rule.logic";

/**
 * Canais de venda do estacionamento (E0.3.12). Mostra as regras que a Movepark cadastrou para
 * ele e monta o link de cada unidade com o UTM certo. Sem regra, o card não aparece: não há o que
 * divulgar, e a comissão padrão já está no contrato.
 */
export function PartnerChannelsCard({ companyId }: { companyId: string }) {
  const { data } = usePartnerChannels(companyId);
  const [locationId, setLocationId] = React.useState<string>("");

  const rules = data?.rules ?? [];
  const locations = data?.locations ?? [];
  if (rules.length === 0) return null;

  const location = locations.find((l) => l.id === locationId) ?? locations[0] ?? null;

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não deu para copiar. Selecione o link e copie à mão.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Vendas que você traz</CardTitle>
          <p className="mt-1 max-w-[68ch] text-pretty text-body-sm text-muted">
            Quando o cliente chega por um destes links e reserva em até {data?.window_days ?? 7} dias, a venda paga a
            comissão reduzida. Nas outras vendas a comissão é de {(data?.default_take_rate_bps ?? 0) / 100}%.
          </p>
        </div>
        {locations.length > 1 && (
          <div className="w-56 shrink-0">
            <Select value={location?.id ?? ""} onValueChange={setLocationId}>
              <SelectTrigger aria-label="Unidade do link">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rules.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-md border border-hairline p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-title-sm text-ink">{r.name}</span>
              <Badge tone="active">comissão de {r.take_rate_bps / 100}%</Badge>
              {r.match_white_label && <Badge tone="neutral">vale também no seu site Movepark</Badge>}
            </div>
            {location ? (
              r.utm_sources.map((utm) => {
                const link = trackedLink(siteUrl(location.public_path), utm);
                return (
                  <div key={utm} className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded bg-surface-soft px-2 py-1.5 text-caption text-body">
                      {link}
                    </code>
                    <Button size="sm" variant="secondary" onClick={() => copy(link)} aria-label={`Copiar link ${utm}`}>
                      <Copy /> Copiar
                    </Button>
                  </div>
                );
              })
            ) : (
              <p className="text-body-sm text-muted">
                Sua unidade ainda não tem página pública. O link aparece aqui quando ela for publicada.
              </p>
            )}
          </div>
        ))}
        <p className="text-caption text-muted">
          Use o link no seu site, no Instagram e no WhatsApp. Se o cliente chegar por outro caminho, a
          venda entra na comissão padrão.
        </p>
      </CardContent>
    </Card>
  );
}
