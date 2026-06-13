import * as React from "react";
import { toast } from "sonner";
import { Plus, MapPin, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdminDestinations,
  useDeleteDestination,
} from "@/features/destinations/api";
import { DestinationForm } from "@/features/destinations/DestinationForm";
import { DestinationPointsDialog } from "@/features/destinations/DestinationPointsDialog";
import { DestinationFaqDialog } from "@/features/destinations/DestinationFaqDialog";
import type { Destination } from "@/types/domain";

export default function ManagerDestinations() {
  const { data, isLoading } = useAdminDestinations();
  const del = useDeleteDestination();
  const [editing, setEditing] = React.useState<Destination | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [pointsOf, setPointsOf] = React.useState<Destination | null>(null);
  const [faqOf, setFaqOf] = React.useState<Destination | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(d: Destination) {
    setEditing(d);
    setFormOpen(true);
  }
  async function remove(d: Destination) {
    if (!confirm(`Excluir o destino "${d.name}"?`)) return;
    try {
      await del.mutateAsync(d.id);
      toast.success("Destino excluído");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Destinos"
        description="Aeroportos e destinos com página própria (SEO). Controla a busca e a home."
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" /> Novo destino
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={<MapPin className="h-10 w-10" />} title="Nenhum destino cadastrado" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Popular</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ordem</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-ink">
                    {d.name}
                    <a
                      href={`/destinos/${d.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex text-muted hover:text-ink"
                      title="Abrir página"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <div className="text-caption text-muted">/{d.slug}</div>
                  </TableCell>
                  <TableCell>{d.code}</TableCell>
                  <TableCell>{[d.city, d.state].filter(Boolean).join(" / ")}</TableCell>
                  <TableCell>{d.type}</TableCell>
                  <TableCell>{d.is_popular ? "★" : "—"}</TableCell>
                  <TableCell>
                    <Badge tone={d.is_published ? "confirmed" : "pending"}>
                      {d.is_published ? "Publicado" : "Rascunho"}
                    </Badge>
                  </TableCell>
                  <TableCell>{d.sort_order}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(d)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setPointsOf(d)}>
                        Terminais
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setFaqOf(d)}>
                        FAQ
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(d)} disabled={del.isPending}>
                        Excluir
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DestinationForm open={formOpen} destination={editing} onOpenChange={setFormOpen} />
      <DestinationPointsDialog
        open={!!pointsOf}
        destination={pointsOf}
        onOpenChange={(o) => !o && setPointsOf(null)}
      />
      <DestinationFaqDialog
        open={!!faqOf}
        destination={faqOf}
        onOpenChange={(o) => !o && setFaqOf(null)}
      />
    </div>
  );
}
