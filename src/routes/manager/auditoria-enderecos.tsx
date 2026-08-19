import * as React from "react";
import { toast } from "sonner";
import { ArrowSquareOut, MapPin, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useApplyAddressCorrection,
  useDismissAddressAudit,
  useLocationAddressAudit,
  useRunAddressScan,
  useVerifyAddresses,
} from "@/features/location-address-audit/api";
import { FLAG_LABEL, statusLabel, temPropostaAplicavel } from "./auditoria-enderecos.logic";
import { formatDistance } from "@/lib/format";
import type { LocationAddressAuditRow } from "@/types/domain";

/**
 * Auditoria de endereço das unidades.
 *
 * A tela existe porque a correção é sempre humana: a varredura propõe, alguém confere e
 * aplica. Duas coisas ficam explícitas na linha, porque são as que decidem:
 *
 *   1. o desvio entre o nosso pino e o do Google, em metros;
 *   2. se aceitar a coordenada proposta muda o aeroporto ancorado, que é o efeito que se
 *      espalha por busca, card, badge de terminal e página do destino.
 *
 * Spec: docs/specs/auditoria-enderecos.md
 */
export default function ManagerAuditoriaEnderecos() {
  const [onlyFlagged, setOnlyFlagged] = React.useState(true);
  const lista = useLocationAddressAudit(onlyFlagged);
  const scan = useRunAddressScan();
  const verify = useVerifyAddresses();
  const [revisando, setRevisando] = React.useState<LocationAddressAuditRow | null>(null);

  const rodarTriagem = () => {
    scan.mutate(undefined, {
      onSuccess: (n) => toast.success(`Triagem concluída em ${n} unidades.`),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na triagem."),
    });
  };

  const verificarNoGoogle = () => {
    verify.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          `${r.checked} unidades verificadas: ${r.divergent} divergentes, ${r.no_match} sem correspondência.`,
        ),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao consultar o Google."),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria de endereços"
        description="Confere o endereço e o pino de cada unidade. A distância ao aeroporto sai do pino, então acertar a coordenada acerta a busca e a página do destino."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={rodarTriagem} disabled={scan.isPending}>
              <MagnifyingGlass />
              {scan.isPending ? "Varrendo..." : "Rodar triagem"}
            </Button>
            <Button onClick={verificarNoGoogle} disabled={verify.isPending}>
              <MapPin />
              {verify.isPending ? "Consultando..." : "Verificar no Google"}
            </Button>
          </div>
        }
      />

      <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <Switch checked={onlyFlagged} onCheckedChange={setOnlyFlagged} />
        Mostrar só o que tem pendência
      </label>

      {lista.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (lista.data ?? []).length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-10 w-10" />}
          title="Nenhuma pendência"
          description="Todas as unidades passaram na triagem e na última verificação."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Sinais</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lista.data ?? []).map((row) => (
                <LinhaAuditoria key={row.location_id} row={row} onRevisar={setRevisando} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DialogRevisao row={revisando} onClose={() => setRevisando(null)} />
    </div>
  );
}

function LinhaAuditoria({
  row,
  onRevisar,
}: {
  row: LocationAddressAuditRow;
  onRevisar: (row: LocationAddressAuditRow) => void;
}) {
  const status = statusLabel(row);
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.location_name}</div>
        <div className="text-sm text-muted-foreground">{row.company_name}</div>
        {!row.is_listed ? (
          <Badge tone="neutral" className="mt-1">
            fora da vitrine
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="max-w-[22rem] text-sm">{row.address ?? "sem endereço"}</TableCell>
      <TableCell className="text-sm whitespace-nowrap">
        {row.destination_code ? (
          <>
            {row.destination_code}
            {row.distance_km !== null ? (
              <span className="text-muted-foreground"> · {formatDistance(row.distance_km)}</span>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">sem destino</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {row.flags.map((f) => (
            <Badge key={f} tone="neutral" className="whitespace-nowrap">
              {FLAG_LABEL[f] ?? f}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <Badge tone={status.tone}>{status.label}</Badge>
        {row.drift_m !== null ? (
          <div className="mt-1 text-sm text-muted-foreground">
            {formatDistance(row.drift_m / 1000)} do pino do Google
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={() => onRevisar(row)}>
          Revisar
        </Button>
      </TableCell>
    </TableRow>
  );
}

function DialogRevisao({
  row,
  onClose,
}: {
  row: LocationAddressAuditRow | null;
  onClose: () => void;
}) {
  const aplicar = useApplyAddressCorrection();
  const descartar = useDismissAddressAudit();
  const [nota, setNota] = React.useState("");

  React.useEffect(() => {
    setNota("");
  }, [row?.location_id]);

  if (!row) return null;

  const podeAplicar = temPropostaAplicavel(row);
  const mudaDestino =
    row.suggested_destination_code !== null &&
    row.suggested_destination_code !== row.destination_code;

  const onAplicar = () => {
    aplicar.mutate(
      {
        locationId: row.location_id,
        address: row.match_address,
        latitude: row.match_latitude,
        longitude: row.match_longitude,
        googlePlaceId: row.match_place_id,
        googleMapsUrl: row.match_maps_url,
        relinkDestination: true,
        note: nota || null,
      },
      {
        onSuccess: (r) => {
          toast.success(
            r.destination_changed
              ? `Corrigido. O destino passou de ${r.destination_before ?? "nenhum"} para ${r.destination_after ?? "nenhum"}, e a distância de ${formatDistance(r.distance_km_before)} para ${formatDistance(r.distance_km_after)}.`
              : `Corrigido. A distância ao ${r.destination_after ?? "destino"} passou de ${formatDistance(r.distance_km_before)} para ${formatDistance(r.distance_km_after)}.`,
          );
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao aplicar."),
      },
    );
  };

  const onDescartar = () => {
    descartar.mutate(
      { locationId: row.location_id, note: nota || undefined },
      {
        onSuccess: () => {
          toast.success("Marcado como conferido.");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao descartar."),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row.location_name}</DialogTitle>
          <DialogDescription>
            {row.company_name}
            {row.verified_at
              ? ` · verificado em ${new Date(row.verified_at).toLocaleDateString("pt-BR")}`
              : " · ainda não verificado no Google"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="space-y-1">
            <h3 className="text-sm font-medium">No Hub hoje</h3>
            <p className="text-sm">{row.address ?? "sem endereço"}</p>
            <p className="text-sm text-muted-foreground">
              {row.latitude !== null && row.longitude !== null
                ? `${row.latitude}, ${row.longitude}`
                : "sem coordenada"}
            </p>
            <p className="text-sm text-muted-foreground">
              {row.destination_code
                ? `${row.destination_code} · ${formatDistance(row.distance_km)}`
                : "sem destino ancorado"}
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="text-sm font-medium">No Google</h3>
            {row.match_address ? (
              <>
                <p className="text-sm">{row.match_address}</p>
                <p className="text-sm text-muted-foreground">
                  {row.match_latitude}, {row.match_longitude}
                </p>
                <p className="text-sm text-muted-foreground">
                  {row.suggested_destination_code
                    ? `${row.suggested_destination_code} · ${formatDistance(row.suggested_distance_km)}`
                    : "nenhum destino por perto"}
                </p>
                {row.match_maps_url ? (
                  <a
                    className="inline-flex items-center gap-1 text-sm underline"
                    href={row.match_maps_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir no Maps <ArrowSquareOut />
                  </a>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {row.fetch_error ?? "Nada para comparar ainda."}
              </p>
            )}
          </section>
        </div>

        {mudaDestino ? (
          <p className="flex items-start gap-2 rounded-md border border-mp-warning/40 bg-mp-warning/10 p-3 text-sm">
            <Warning className="mt-0.5 shrink-0" />
            Aceitar esta coordenada muda o destino de {row.destination_code ?? "nenhum"} para{" "}
            {row.suggested_destination_code}. A busca, o card e a página do destino passam a
            tratar a unidade como sendo de outro aeroporto.
          </p>
        ) : null}

        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota da revisão (opcional): o que você conferiu"
          rows={2}
        />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDescartar} disabled={descartar.isPending}>
            Manter como está
          </Button>
          <Button onClick={onAplicar} disabled={!podeAplicar || aplicar.isPending}>
            {aplicar.isPending ? "Aplicando..." : "Aplicar correção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
