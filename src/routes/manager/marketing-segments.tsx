import * as React from "react";
import { Plus, Trash, Users } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useManagerFilters } from "@/features/manager-filters/context";
import { ManagerFilterBar } from "@/features/manager-filters/ManagerFilterBar";
import { SegmentBuilder } from "@/features/marketing/SegmentBuilder";
import {
  useDeleteSegment,
  useSaveSegment,
  useSegmentContacts,
  useSegmentPreview,
  useSegments,
} from "@/features/marketing/api";
import {
  describeDefinition,
  EMPTY_DEFINITION,
  type SegmentGroup,
  slugify,
  validateDefinition,
} from "@/features/marketing/segmentBuilder.logic";
import { cohortLabel } from "@/features/marketing/cohorts";
import { formatBRL } from "@/lib/format";
import type { MarketingSegment } from "@/types/domain";

/**
 * Segmentos: recortes salvos da base, usados depois como público de campanha.
 *
 * O que faz a tela ser confiável é a prévia: antes de salvar, ela diz quantas pessoas casam e,
 * separado, quantas dá para alcançar por e-mail e por WhatsApp. Um segmento de 4 mil pessoas em que
 * só 30 aceitam WhatsApp é uma campanha que parecia grande e não era.
 */
export default function ManagerMarketingSegments() {
  const { scopedLocationIds } = useManagerFilters();
  const segments = useSegments();
  const [editando, setEditando] = React.useState<MarketingSegment | null>(null);
  const [criando, setCriando] = React.useState(false);
  const remover = useDeleteSegment();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Segmentos"
        description="Recortes da base por comportamento de compra, valor e canal. Viram público de campanha."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ManagerFilterBar showPeriod={false} />
            <Button size="sm" onClick={() => setCriando(true)}>
              <Plus className="mr-2 size-4" />
              Novo segmento
            </Button>
          </div>
        }
      />

      {segments.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (segments.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum segmento ainda"
          description="Comece por um recorte simples, como quem comprou uma vez e sumiu."
          action={<Button onClick={() => setCriando(true)}>Criar segmento</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Segmento</TableHead>
                    <TableHead>Regra</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(segments.data ?? []).map((seg) => (
                    <TableRow key={seg.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium text-ink hover:underline"
                          onClick={() => setEditando(seg)}
                        >
                          {seg.name}
                        </button>
                        {seg.description && (
                          <p className="text-xs text-muted">{seg.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[520px] text-sm text-muted">
                        {describeDefinition(seg.definition as unknown as SegmentGroup)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir ${seg.name}`}
                          onClick={() => {
                            if (!confirm(`Excluir o segmento "${seg.name}"?`)) return;
                            remover.mutate(seg.id, {
                              onSuccess: () => toast.success("Segmento excluído."),
                              onError: (e) =>
                                toast.error(e instanceof Error ? e.message : "Falhou."),
                            });
                          }}
                        >
                          <Trash className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {(criando || editando) && (
        <SegmentDialog
          segment={editando}
          locationIds={scopedLocationIds}
          onClose={() => {
            setCriando(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function SegmentDialog({
  segment,
  locationIds,
  onClose,
}: {
  segment: MarketingSegment | null;
  locationIds: string[] | undefined;
  onClose: () => void;
}) {
  const [nome, setNome] = React.useState(segment?.name ?? "");
  const [descricao, setDescricao] = React.useState(segment?.description ?? "");
  const [definicao, setDefinicao] = React.useState<SegmentGroup>(
    (segment?.definition as unknown as SegmentGroup) ?? EMPTY_DEFINITION,
  );
  const [verContatos, setVerContatos] = React.useState(false);

  const salvar = useSaveSegment();
  const validacao = validateDefinition(definicao);
  const previa = useSegmentPreview(definicao, locationIds);
  const contatos = useSegmentContacts(definicao, locationIds, verContatos);

  function confirmar() {
    if (!nome.trim()) {
      toast.error("Dê um nome ao segmento.");
      return;
    }
    salvar.mutate(
      {
        id: segment?.id,
        name: nome.trim(),
        slug: segment?.slug ?? slugify(nome),
        description: descricao.trim() || null,
        definition: definicao,
        locationIds: locationIds ?? [],
      },
      {
        onSuccess: () => {
          toast.success(segment ? "Segmento atualizado." : "Segmento criado.");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não deu para salvar."),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{segment ? "Editar segmento" : "Novo segmento"}</DialogTitle>
          <DialogDescription>
            Monte a regra e confira o público antes de salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-3 tablet:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seg-nome">Nome</Label>
              <Input
                id="seg-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Clientes em risco no Confins"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seg-desc">Descrição</Label>
              <Textarea
                id="seg-desc"
                rows={1}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Para que serve este recorte"
              />
            </div>
          </div>

          <SegmentBuilder value={definicao} onChange={setDefinicao} />

          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium text-body text-ink">Público</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVerContatos((v) => !v)}
                >
                  <Users className="mr-2 size-4" />
                  {verContatos ? "Esconder contatos" : "Ver contatos"}
                </Button>
              </div>

              {previa.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="grid gap-3 tablet:grid-cols-3">
                  <Numero rotulo="Casam com a regra" valor={previa.data?.total ?? 0} destaque />
                  <Numero
                    rotulo="Alcançáveis por e-mail"
                    valor={previa.data?.reachable_email ?? 0}
                  />
                  <Numero
                    rotulo="Alcançáveis por WhatsApp"
                    valor={previa.data?.reachable_whatsapp ?? 0}
                  />
                </div>
              )}

              <p className="text-xs text-muted">
                Alcançável já desconta quem não tem endereço no canal, quem não deu consentimento e
                quem se descadastrou.
              </p>

              {!validacao.ok && (
                <ul className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {validacao.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}

              {verContatos && (
                <div className="max-h-64 overflow-auto rounded-md border border-hairline">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>E-mail</TableHead>
                        <TableHead>Perfil</TableHead>
                        <TableHead className="text-right">Reservas</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(contatos.data ?? []).map((c) => (
                        <TableRow key={c.contact_key}>
                          <TableCell>{c.display_name ?? "-"}</TableCell>
                          <TableCell className="text-muted">{c.email ?? "-"}</TableCell>
                          <TableCell className="text-muted">{cohortLabel(c.cohort)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.bookings_count}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBRL(c.total_spent)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvar.isPending}>
            {segment ? "Salvar" : "Criar segmento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-hairline p-3">
      <span className="text-xs text-muted">{rotulo}</span>
      <span
        className={`text-xl font-semibold tabular-nums ${destaque ? "text-primary" : "text-ink"}`}
      >
        {valor}
      </span>
    </div>
  );
}
