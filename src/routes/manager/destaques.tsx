import * as React from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowSquareOut, ArrowUp, Plus, Sparkle } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddFeaturedDialog, rotuloDaOferta } from "@/features/home/AddFeaturedDialog";
import {
  useAddFeaturedOffer,
  useFeaturedCandidates,
  useFeaturedOffersAdmin,
  useRemoveFeaturedOffer,
  useReorderFeaturedOffers,
  useToggleFeaturedOffer,
  type FeaturedRow,
} from "@/features/home/featuredApi";
import { ordenar, trocarPosicao } from "@/features/home/featured.logic";

/**
 * Curadoria da vitrine da home.
 *
 * Esta tela é a fonte da vitrine desde 31/10/2026. Antes a home ranqueava por reservas fechadas no
 * Hub, o que parou de significar alguma coisa quando todo o catálogo vivo passou a fechar no site
 * do parceiro (checkout externo): o contador nasce zero e fica zero, e o ranking só sabia ordenar
 * quem já tinha saído do ar.
 */
export default function ManagerDestaques() {
  const { data, isLoading } = useFeaturedOffersAdmin();
  const { data: candidatos } = useFeaturedCandidates();
  const adicionar = useAddFeaturedOffer();
  const remover = useRemoveFeaturedOffer();
  const alternar = useToggleFeaturedOffer();
  const reordenar = useReorderFeaturedOffers();
  const [dialogAberto, setDialogAberto] = React.useState(false);

  const lista = React.useMemo(() => ordenar(data ?? []), [data]);
  const jaNaLista = React.useMemo(
    () => new Set(lista.map((r) => r.locationParkingTypeId)),
    [lista],
  );
  const noAr = lista.filter((r) => r.isActive && !r.motivoForaDoAr).length;

  async function mover(id: string, direcao: "cima" | "baixo") {
    const posicoes = trocarPosicao(lista, id, direcao);
    if (posicoes.length === 0) return;
    try {
      await reordenar.mutateAsync(posicoes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar a ordem");
    }
  }

  async function trocarVisibilidade(row: FeaturedRow) {
    try {
      await alternar.mutateAsync({ id: row.id, isActive: !row.isActive });
      toast.success(row.isActive ? "Destaque desligado" : "Destaque ligado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  async function tirar(row: FeaturedRow) {
    if (!confirm(`Tirar ${rotuloDaOferta(row)} dos destaques da home?`)) return;
    try {
      await remover.mutateAsync(row.id);
      toast.success("Destaque removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  async function confirmarAdicao(locationParkingTypeId: string) {
    try {
      await adicionar.mutateAsync({ locationParkingTypeId, atuais: lista });
      setDialogAberto(false);
      toast.success("Destaque adicionado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Destaques da home"
        description="Escolha quais unidades e tipos de vaga aparecem na home, e em que ordem."
        actions={
          <Button size="sm" onClick={() => setDialogAberto(true)}>
            <Plus className="h-4 w-4" /> Adicionar destaque
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Sparkle className="h-10 w-10" />}
          title="Nenhum destaque na home"
          description="Sem nenhum destaque a seção some da home. Adicione ao menos um."
        />
      ) : (
        <>
          <p className="text-caption text-muted">
            {noAr === 1 ? "1 card no ar" : `${noAr} cards no ar`}, de {lista.length} na lista.
          </p>

          <div className="overflow-x-auto rounded-md border border-hairline">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Ordem</TableHead>
                  <TableHead>Estacionamento</TableHead>
                  <TableHead>Vaga</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Na home</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((row, i) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Subir ${rotuloDaOferta(row)}`}
                          disabled={i === 0 || reordenar.isPending}
                          onClick={() => mover(row.id, "cima")}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Descer ${rotuloDaOferta(row)}`}
                          disabled={i === lista.length - 1 || reordenar.isPending}
                          onClick={() => mover(row.id, "baixo")}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-ink">
                      {row.companyName}
                      <div className="text-caption text-muted">{row.locationName}</div>
                    </TableCell>
                    <TableCell>
                      {row.parkingTypeName}
                      {row.temPreco ? null : (
                        <div className="text-caption text-muted">sem tabela de preço</div>
                      )}
                    </TableCell>
                    <TableCell>{row.destinationLabel ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={row.isActive}
                          disabled={alternar.isPending}
                          aria-label={`Mostrar ${rotuloDaOferta(row)} na home`}
                          onCheckedChange={() => trocarVisibilidade(row)}
                        />
                        {row.motivoForaDoAr ? (
                          <Badge tone="pending" title={row.motivoForaDoAr}>
                            Fora do ar
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" asChild>
                          <a
                            href={`/p/${row.companySlug}/${row.locationSlug}/${row.parkingTypeCode}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver <ArrowSquareOut className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remover.isPending}
                          onClick={() => tirar(row)}
                        >
                          Remover
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AddFeaturedDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        candidatos={candidatos ?? []}
        jaNaLista={jaNaLista}
        onConfirm={confirmarAdicao}
        salvando={adicionar.isPending}
      />
    </div>
  );
}
