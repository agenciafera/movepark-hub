import { ArrowsClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useManagerFilters } from "@/features/manager-filters/context";
import { ManagerFilterBar } from "@/features/manager-filters/ManagerFilterBar";
import { formatRangeLabel } from "@/features/manager-filters/managerFilters.logic";
import { ConversionFunnel } from "@/features/marketing/ConversionFunnel";
import { ProfileMatrix } from "@/features/marketing/ProfileMatrix";
import { useConversionFunnel, useProfileMatrix, useSyncContacts } from "@/features/marketing/api";

/**
 * Marketing: matriz de perfis e funil, sempre sob o recorte de estacionamento da barra de filtros.
 *
 * A matriz ignora o período de propósito. Coorte é uma leitura de vida inteira do cliente:
 * cortar por mês transformaria "cliente recorrente" em "comprou duas vezes em julho", que é outra
 * coisa. O funil, esse sim, é do período, porque mede o que aconteceu na janela.
 */
export default function ManagerMarketing() {
  const { range, scopedLocationIds } = useManagerFilters();
  const matriz = useProfileMatrix(scopedLocationIds);
  const funil = useConversionFunnel(
    range.from.toISOString(),
    range.to.toISOString(),
    scopedLocationIds,
  );
  const sync = useSyncContacts();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing"
        description="Quem são os clientes de cada estacionamento, como eles compram e onde a reserva se perde."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ManagerFilterBar showCompare={false} />
            <Button
              variant="outline"
              size="sm"
              disabled={sync.isPending}
              onClick={() =>
                sync.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success(
                      `${r.inserted} contatos novos, ${r.updated} atualizados a partir das reservas.`,
                    ),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou."),
                })
              }
            >
              <ArrowsClockwise className="mr-2 size-4" />
              Sincronizar contatos
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="perfis">
        <TabsList>
          <TabsTrigger value="perfis">Perfis de cliente</TabsTrigger>
          <TabsTrigger value="funil">Funil de conversão</TabsTrigger>
        </TabsList>

        <TabsContent value="perfis" className="mt-4">
          <ProfileMatrix data={matriz.data} isLoading={matriz.isLoading} />
        </TabsContent>

        <TabsContent value="funil" className="mt-4">
          <p className="mb-3 text-sm text-muted">
            Reservas criadas em {formatRangeLabel(range)}.
          </p>
          <ConversionFunnel data={funil.data} isLoading={funil.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
