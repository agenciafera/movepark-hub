import * as React from "react";
import { useParams } from "react-router-dom";
import { FloppyDisk, PaperPlaneTilt } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignCanvasEditor } from "@/features/marketing/CampaignCanvasEditor";
import {
  useCampaign,
  useCampaignMessages,
  useDispatchConfig,
  useRunCampaign,
  useSaveCampaign,
  useSegmentPreview,
  useSegments,
} from "@/features/marketing/api";
import {
  type CampaignCanvas,
  emptyCanvas,
  validateCanvas,
} from "@/features/marketing/canvas.logic";
import type { SegmentGroup } from "@/features/marketing/segmentBuilder.logic";
import { EMPTY_DEFINITION } from "@/features/marketing/segmentBuilder.logic";
import { formatDateTime } from "@/lib/format";

const STATUS_MENSAGEM: Record<string, string> = {
  queued: "Na fila",
  sent: "Enviada",
  failed: "Falhou",
  skipped: "Segurada",
  suppressed: "Bloqueada",
};

/**
 * Editor de uma campanha: fluxo, público e histórico de mensagens.
 *
 * O botão de disparar só libera com o fluxo válido. Campanha é irreversível, então o erro tem que
 * aparecer antes, não no relatório do dia seguinte.
 */
export default function ManagerMarketingCampaign() {
  const { id = "" } = useParams();
  const campanha = useCampaign(id);
  const segmentos = useSegments();
  const salvar = useSaveCampaign();
  const executar = useRunCampaign();
  const config = useDispatchConfig();
  const mensagens = useCampaignMessages(id);

  const [canvas, setCanvas] = React.useState<CampaignCanvas | null>(null);
  const [segmentId, setSegmentId] = React.useState<string>("");
  const [sendCap, setSendCap] = React.useState<number>(100);

  // Carrega o estado local uma vez, quando a campanha chega. Sincronizar a cada render sobrescreveria
  // o que a pessoa está editando a cada refetch em background.
  React.useEffect(() => {
    if (campanha.data && canvas === null) {
      setCanvas((campanha.data.canvas as unknown as CampaignCanvas) ?? emptyCanvas());
      setSegmentId(campanha.data.segment_id ?? "");
      setSendCap(campanha.data.send_cap ?? 100);
    }
  }, [campanha.data, canvas]);

  const segmentoEscolhido = segmentos.data?.find((s) => s.id === segmentId);
  const previa = useSegmentPreview(
    (segmentoEscolhido?.definition as unknown as SegmentGroup) ?? EMPTY_DEFINITION,
    undefined,
    Boolean(segmentoEscolhido),
  );

  if (campanha.isLoading || canvas === null) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (!campanha.data) {
    return <EmptyState title="Campanha não encontrada" />;
  }

  const problemas = validateCanvas(canvas);
  const podeDisparar = problemas.length === 0 && Boolean(segmentId);

  function gravar(extra?: { status?: "draft" | "paused" }) {
    return salvar.mutateAsync({
      id,
      name: campanha.data!.name,
      slug: campanha.data!.slug,
      segmentId: segmentId || null,
      canvas: canvas!,
      sendCap,
      ...(extra?.status ? { status: extra.status } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={campanha.data.name}
        back={{ to: "/manager/marketing/campanhas", label: "Campanhas" }}
        description="Monte o fluxo, escolha o público e confira antes de disparar."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={salvar.isPending}
              onClick={() =>
                gravar()
                  .then(() => toast.success("Campanha salva."))
                  .catch((e) => toast.error(e instanceof Error ? e.message : "Falhou."))
              }
            >
              <FloppyDisk className="mr-2 size-4" />
              Salvar
            </Button>
            <Button
              size="sm"
              disabled={!podeDisparar || executar.isPending || salvar.isPending}
              onClick={async () => {
                const aviso = config.data?.enabled
                  ? "O disparo está LIGADO: isto envia para clientes reais. Confirma?"
                  : "O disparo está desligado. A campanha vai rodar e gravar o que sairia, sem enviar. Continuar?";
                if (!confirm(aviso)) return;
                try {
                  await gravar();
                  const r = await executar.mutateAsync(id);
                  toast.success(
                    `${r.enrolled} matriculados. ${r.sent} enviadas, ${r.skipped} seguradas, ${r.suppressed} bloqueadas, ${r.failed} com falha.`,
                  );
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Não deu para executar.");
                }
              }}
            >
              <PaperPlaneTilt className="mr-2 size-4" />
              {config.data?.enabled ? "Disparar" : "Executar em ensaio"}
            </Button>
          </div>
        }
      />

      {!config.data?.enabled && (
        <p className="rounded-md border border-hairline bg-surface-soft px-3 py-2 text-sm text-muted">
          O disparo real está desligado. Dá para rodar a campanha inteira: cada mensagem é montada e
          fica gravada como segurada, com o texto final, para conferência.
        </p>
      )}

      <Tabs defaultValue="fluxo">
        <TabsList>
          <TabsTrigger value="fluxo">Fluxo</TabsTrigger>
          <TabsTrigger value="publico">Público</TabsTrigger>
          <TabsTrigger value="mensagens">Mensagens</TabsTrigger>
        </TabsList>

        <TabsContent value="fluxo" className="mt-4">
          <CampaignCanvasEditor value={canvas} onChange={setCanvas} />
        </TabsContent>

        <TabsContent value="publico" className="mt-4">
          <Card>
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="grid gap-3 tablet:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Segmento</Label>
                  <Select value={segmentId} onValueChange={setSegmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha o público" />
                    </SelectTrigger>
                    <SelectContent>
                      {(segmentos.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cap-camp">Teto de pessoas nesta campanha</Label>
                  <Input
                    id="cap-camp"
                    type="number"
                    min={1}
                    value={sendCap}
                    onChange={(e) => setSendCap(Number(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted">
                    Corta o público na matrícula. Serve de freio para a primeira execução.
                  </p>
                </div>
              </div>

              {segmentoEscolhido && (
                <div className="grid gap-3 tablet:grid-cols-3">
                  <Numero rotulo="No segmento" valor={previa.data?.total ?? 0} destaque />
                  <Numero rotulo="Alcançáveis por e-mail" valor={previa.data?.reachable_email ?? 0} />
                  <Numero
                    rotulo="Alcançáveis por WhatsApp"
                    valor={previa.data?.reachable_whatsapp ?? 0}
                  />
                </div>
              )}

              {problemas.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-800">
                    O fluxo ainda não está pronto para disparar
                  </p>
                  <ul className="mt-1 flex flex-col gap-1 text-xs text-amber-800">
                    {problemas.map((p, i) => (
                      <li key={i}>{p.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!segmentId && (
                <p className="text-sm text-muted">Escolha um segmento para liberar o disparo.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mensagens" className="mt-4">
          {mensagens.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (mensagens.data ?? []).length === 0 ? (
            <EmptyState
              title="Nada enviado ainda"
              description="Execute a campanha para ver aqui cada mensagem e o que aconteceu com ela."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canal</TableHead>
                        <TableHead>Para</TableHead>
                        <TableHead>Assunto</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Quando</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(mensagens.data ?? []).map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-muted">
                            {m.channel === "email" ? "E-mail" : "WhatsApp"}
                          </TableCell>
                          <TableCell>{m.to_address || "-"}</TableCell>
                          <TableCell className="max-w-[280px] truncate">
                            {m.subject || "-"}
                          </TableCell>
                          <TableCell>{STATUS_MENSAGEM[m.status] ?? m.status}</TableCell>
                          <TableCell className="max-w-[260px] truncate text-muted">
                            {m.error || "-"}
                          </TableCell>
                          <TableCell className="text-muted">
                            {formatDateTime(m.sent_at ?? m.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
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
