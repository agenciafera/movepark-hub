import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  DotsThreeVertical,
  MagnifyingGlass,
  MapTrifold,
  PencilSimple,
  Plus,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminDestinations } from "@/features/destinations/api";
import { ProspectLocationForm } from "@/features/prospect-locations/ProspectLocationForm";
import {
  useDeleteProspectLocation,
  useProspectLocations,
  useSetProspectLocationState,
} from "@/features/prospect-locations/api";
import type { ProspectLocationState } from "@/features/prospect-locations/api";
import { formatDate, formatDistance } from "@/lib/format";
import type { ProspectLocationAdminRow } from "@/types/domain";

/** `distance_m` chega em metros e o formatador do repo fala em km. */
function metersLabel(m: number | null) {
  if (m === null) return null;
  return formatDistance(m / 1000);
}

/**
 * Painel do lote mapeado (E0.17-h).
 *
 * Separado de "Unidades" de propósito: lá é inventário vendável, aqui é mapeamento sem
 * contrato (ADR-010). O trabalho é curadoria recorrente por aeroporto, então a ação mais
 * frequente (publicar) fica na própria linha, e não escondida atrás de um formulário.
 *
 * Dois travamentos que a tela precisa deixar na cara, porque o servidor recusa os dois:
 * ficha sem endereço não publica (thin content queima a seção inteira na página do
 * destino), e ficha convertida entra em modo leitura (editar depois da conversão
 * dessincroniza do que o parceiro já vê).
 */
export default function ManagerLotesMapeados() {
  const destinations = useAdminDestinations();
  const [destinationId, setDestinationId] = React.useState("all");
  const [state, setState] = React.useState<ProspectLocationState>("all");
  const [search, setSearch] = React.useState("");
  const [onlyMissingPlaceId, setOnlyMissingPlaceId] = React.useState(false);

  const list = useProspectLocations({
    destinationId: destinationId === "all" ? undefined : destinationId,
    state,
    search,
  });

  const setProspectState = useSetProspectLocationState();
  const del = useDeleteProspectLocation();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProspectLocationAdminRow | null>(null);
  const [removing, setRemoving] = React.useState<ProspectLocationAdminRow | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(row: ProspectLocationAdminRow) {
    setEditing(row);
    setFormOpen(true);
  }

  async function togglePublish(row: ProspectLocationAdminRow, next: boolean) {
    try {
      await setProspectState.mutateAsync({ id: row.id, isPublished: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function markNotified(row: ProspectLocationAdminRow) {
    try {
      await setProspectState.mutateAsync({ id: row.id, notified: !row.notified_owner_at });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function markReviewed(row: ProspectLocationAdminRow) {
    try {
      await setProspectState.mutateAsync({ id: row.id, reviewed: !row.last_reviewed_at });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    try {
      await del.mutateAsync(removing.id);
      toast.success("Lote excluído");
      setRemoving(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  /**
   * "Sem Place ID" é a fila de curadoria de endereço, e por isso filtra no cliente:
   * o recorte não existe na RPC (`p_state` só conhece rascunho/publicado/convertido)
   * e a lista do painel é pequena. Sem Place ID o pino veio de endereço digitado ou
   * importado, não da busca do Google, e a deduplicação do D-009 não tem em que se
   * apoiar. Reabrir a ficha e buscar o endereço resolve as duas coisas de uma vez.
   */
  const allRows = list.data ?? [];
  const rows = onlyMissingPlaceId ? allRows.filter((r) => !r.google_place_id) : allRows;
  const missingPlaceIdCount = allRows.filter((r) => !r.google_place_id).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lotes mapeados"
        description="Estacionamentos que a Movepark mapeou e ainda não têm contrato. Aparecem na página do destino, sem preço e sem reserva."
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" /> Novo lote
          </Button>
        }
      />

      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Buscar por nome ou endereço"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={destinationId} onValueChange={setDestinationId}>
          <SelectTrigger className="tablet:w-[240px]">
            <SelectValue placeholder="Todos os destinos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os destinos</SelectItem>
            {(destinations.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={(v) => setState(v as ProspectLocationState)}>
          <SelectTrigger className="tablet:w-[180px]">
            <SelectValue placeholder="Todos os estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="published">Publicado</SelectItem>
            <SelectItem value="converted">Convertido</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={onlyMissingPlaceId ? "primary" : "secondary"}
          size="sm"
          aria-pressed={onlyMissingPlaceId}
          onClick={() => setOnlyMissingPlaceId((v) => !v)}
          disabled={missingPlaceIdCount === 0 && !onlyMissingPlaceId}
        >
          Sem Place ID
          {missingPlaceIdCount > 0 && ` (${missingPlaceIdCount})`}
        </Button>
      </div>

      {list.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<MapTrifold className="h-10 w-10" />}
          title={onlyMissingPlaceId ? "Todo mundo já tem Place ID" : "Nenhum lote mapeado"}
          description={
            onlyMissingPlaceId
              ? "Nenhuma ficha deste recorte está sem Place ID. A fila de curadoria de endereço está zerada."
              : "Cadastre o estacionamento que a Movepark mapeou e ainda não é parceiro. Ele aparece na página do destino, sem preço e sem botão de reserva."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Endereço e telefone</TableHead>
                <TableHead>Place ID</TableHead>
                <TableHead>Notificado</TableHead>
                <TableHead>Revisado</TableHead>
                <TableHead>Publicado</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const converted = row.state === "converted";
                const noAddress = !row.address;
                const distance = metersLabel(row.distance_m);
                const publishTitle = converted
                  ? "Ficha convertida entra em modo leitura."
                  : noAddress
                    ? "Preencha o endereço para poder publicar."
                    : undefined;

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium text-ink">{row.name}</div>
                      <div className="text-caption text-muted">
                        {row.destination_name}
                        {distance ? ` · ${distance}` : ""}
                      </div>
                      {converted && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge tone="completed">Convertido</Badge>
                          {row.converted_location_name &&
                            (row.converted_company_id ? (
                              <Link
                                to={`/manager/companies/${row.converted_company_id}/locations`}
                                className="text-caption text-muted underline hover:text-ink"
                              >
                                Virou {row.converted_location_name}
                              </Link>
                            ) : (
                              <span className="text-caption text-muted">
                                Virou {row.converted_location_name}
                              </span>
                            ))}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      {row.address ? (
                        <div className="text-body-sm text-ink">{row.address}</div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-body-sm text-error">
                          <Warning className="h-4 w-4 shrink-0" />
                          Sem endereço
                        </div>
                      )}
                      {row.phone ? (
                        <div className="text-caption text-muted">{row.phone}</div>
                      ) : (
                        <div className="text-caption text-muted-soft">Sem telefone</div>
                      )}
                    </TableCell>

                    <TableCell>
                      {row.google_place_id ? (
                        <Badge tone="neutral">Preenchido</Badge>
                      ) : (
                        <span className="text-body-sm text-muted-soft">Vazio</span>
                      )}
                      {row.place_id_conflict_name && (
                        <div
                          className="mt-1 flex items-start gap-1.5 text-caption text-error"
                          title="Parceiro ativo não deve ser mapeado: a ficha compete com a página do próprio parceiro pela mesma busca."
                        >
                          <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Já é da unidade {row.place_id_conflict_name}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {row.notified_owner_at ? formatDate(row.notified_owner_at) : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.last_reviewed_at ? formatDate(row.last_reviewed_at) : "-"}
                    </TableCell>

                    <TableCell>
                      <Switch
                        checked={row.is_published}
                        onCheckedChange={(v) => togglePublish(row, v)}
                        disabled={converted || noAddress}
                        title={publishTitle}
                        aria-label={`Publicado: ${row.name}`}
                      />
                    </TableCell>

                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={converted}
                            title={
                              converted ? "Ficha convertida entra em modo leitura." : undefined
                            }
                            aria-label={`Ações de ${row.name}`}
                          >
                            <DotsThreeVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(row)}>
                            <PencilSimple className="h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => markNotified(row)}>
                            {row.notified_owner_at
                              ? "Desmarcar notificado"
                              : "Marcar como notificado"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => markReviewed(row)}>
                            {row.last_reviewed_at ? "Desmarcar revisado" : "Marcar como revisado"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="!text-error"
                            onClick={() => setRemoving(row)}
                          >
                            <Trash className="h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ProspectLocationForm open={formOpen} prospect={editing} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Excluir este lote mapeado?"
        description="A página dele sai do ar e a URL para de responder. Se o estacionamento só fechou, prefira despublicar: assim a URL pode voltar depois."
        confirmLabel="Excluir"
        pending={del.isPending}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
