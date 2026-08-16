import * as React from "react";
import { Link } from "react-router-dom";
import { Plus, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  useCampaigns,
  useDispatchConfig,
  useSaveCampaign,
  useSaveDispatchConfig,
} from "@/features/marketing/api";
import { slugify } from "@/features/marketing/segmentBuilder.logic";
import { emptyCanvas } from "@/features/marketing/canvas.logic";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Rodando",
  paused: "Pausada",
  done: "Concluída",
  archived: "Arquivada",
};

/**
 * Campanhas: a lista, mais o painel de disparo.
 *
 * O painel de disparo fica aqui em cima, e não escondido em Configurações, porque ele é o que
 * separa "montei um fluxo" de "mandei e-mail para cliente de verdade". Quem abre esta tela precisa
 * ver, sem procurar, se o disparo está ligado.
 */
export default function ManagerMarketingCampaigns() {
  const campanhas = useCampaigns();
  const [criando, setCriando] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Campanhas"
        description="Fluxos de e-mail e WhatsApp montados na tela, disparados para um segmento."
        actions={
          <Button size="sm" onClick={() => setCriando(true)}>
            <Plus className="mr-2 size-4" />
            Nova campanha
          </Button>
        }
      />

      <PainelDeDisparo />

      {campanhas.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (campanhas.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma campanha ainda"
          description="Crie uma, monte o fluxo e confira o público antes de disparar."
          action={<Button onClick={() => setCriando(true)}>Criar campanha</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Enviadas</TableHead>
                    <TableHead className="text-right">Seguradas</TableHead>
                    <TableHead>Última execução</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(campanhas.data ?? []).map((c) => {
                    const stats = (c.stats ?? {}) as Record<string, number | string>;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            to={`/manager/marketing/campanhas/${c.id}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {c.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="rounded-full border border-hairline bg-surface-soft px-2 py-0.5 text-xs text-muted">
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(stats.sent ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted">
                          {Number(stats.skipped ?? 0) + Number(stats.suppressed ?? 0)}
                        </TableCell>
                        <TableCell className="text-muted">
                          {stats.updated_at ? formatDateTime(String(stats.updated_at)) : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {criando && <DialogNovaCampanha onClose={() => setCriando(false)} />}
    </div>
  );
}

function PainelDeDisparo() {
  const config = useDispatchConfig();
  const salvar = useSaveDispatchConfig();
  const [destinoTeste, setDestinoTeste] = React.useState<string | null>(null);

  const ligado = config.data?.enabled ?? false;
  const valorTeste = destinoTeste ?? config.data?.testRecipient ?? "";

  return (
    <Card className={cn(ligado ? "border-rose-300 bg-rose-50/40" : "border-hairline")}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            {ligado && <Warning className="mt-0.5 size-5 shrink-0 text-rose-600" />}
            <div>
              <h3 className="font-medium text-body text-ink">Disparo real</h3>
              <p className="text-sm text-muted">
                {ligado
                  ? "Ligado. As campanhas mandam e-mail e WhatsApp para clientes de verdade."
                  : "Desligado. As campanhas rodam inteiras e gravam o que sairia, sem enviar nada."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="disparo">{ligado ? "Ligado" : "Desligado"}</Label>
            <Switch
              id="disparo"
              checked={ligado}
              disabled={config.isLoading || salvar.isPending}
              onCheckedChange={(marcado) => {
                if (
                  marcado &&
                  !confirm(
                    "Ligar o disparo faz as campanhas enviarem para clientes reais. Confirma?",
                  )
                ) {
                  return;
                }
                salvar.mutate(
                  { enabled: marcado },
                  {
                    onSuccess: () =>
                      toast.success(marcado ? "Disparo ligado." : "Disparo desligado."),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou."),
                  },
                );
              }}
            />
          </div>
        </div>

        <div className="grid gap-3 tablet:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="teste">Destinatário de ensaio</Label>
            <div className="flex gap-2">
              <Input
                id="teste"
                value={valorTeste}
                placeholder="voce@movepark.co"
                onChange={(e) => setDestinoTeste(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  salvar.mutate(
                    { testRecipient: valorTeste },
                    {
                      onSuccess: () => toast.success("Salvo."),
                      onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou."),
                    },
                  )
                }
              >
                Salvar
              </Button>
            </div>
            <p className="text-xs text-muted">
              Com um endereço aqui, todo e-mail vai para ele em vez do cliente.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cap">Teto de envios por dia</Label>
            <Input
              id="cap"
              type="number"
              defaultValue={config.data?.dailyCap ?? 200}
              onBlur={(e) =>
                salvar.mutate(
                  { dailyCap: Number(e.target.value) || 200 },
                  { onError: (err) => toast.error(err instanceof Error ? err.message : "Falhou.") },
                )
              }
            />
            <p className="text-xs text-muted">Vale para todas as campanhas somadas.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remetente">Remetente</Label>
            <Input
              id="remetente"
              defaultValue={config.data?.emailFrom ?? ""}
              placeholder="Movepark <ola@movepark.co>"
              onBlur={(e) =>
                salvar.mutate(
                  { emailFrom: e.target.value },
                  { onError: (err) => toast.error(err instanceof Error ? err.message : "Falhou.") },
                )
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DialogNovaCampanha({ onClose }: { onClose: () => void }) {
  const [nome, setNome] = React.useState("");
  const salvar = useSaveCampaign();

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="camp-nome">Nome</Label>
          <Input
            id="camp-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Reativação de quem sumiu"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={salvar.isPending}
            onClick={() => {
              if (!nome.trim()) {
                toast.error("Dê um nome à campanha.");
                return;
              }
              salvar.mutate(
                { name: nome.trim(), slug: slugify(nome), canvas: emptyCanvas() },
                {
                  onSuccess: () => {
                    toast.success("Campanha criada. Monte o fluxo.");
                    onClose();
                  },
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou."),
                },
              );
            }}
          >
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
