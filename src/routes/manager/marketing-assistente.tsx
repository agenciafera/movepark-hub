import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { marketingKeys } from "@/features/marketing/api";
import { Conversa } from "@/features/marketing-assistant/Conversa";
import { ListaDeConversas } from "@/features/marketing-assistant/ListaDeConversas";
import {
  assistenteKeys,
  useApagarConversa,
  useConversa,
  useConversas,
  useRenomearConversa,
} from "@/features/marketing-assistant/api";

const BASE = "/manager/marketing/assistente";

/**
 * Página Assistente de IA da Automação (docs/specs/assistente-marketing.md § 8). Sem conversa na
 * URL, abre a mais recente; sem nenhuma, começa uma nova. Conversa criada aqui ainda não existe no
 * agente, então não se tenta abrir: ela nasce no primeiro turno.
 */
export default function ManagerMarketingAssistente() {
  const { conversa } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const conversas = useConversas();
  const renomear = useRenomearConversa();
  const apagar = useApagarConversa();
  const [criadasAqui] = React.useState(() => new Set<string>());

  const nova = React.useCallback(() => {
    const id = crypto.randomUUID();
    criadasAqui.add(id);
    navigate(`${BASE}/${id}`);
  }, [criadasAqui, navigate]);

  React.useEffect(() => {
    if (conversa || conversas.isLoading) return;
    const recente = conversas.data?.[0]?.id;
    if (recente) navigate(`${BASE}/${recente}`, { replace: true });
    else if (!conversas.isError) nova();
  }, [conversa, conversas.isLoading, conversas.isError, conversas.data, navigate, nova]);

  const ehNova = !!conversa && criadasAqui.has(conversa);
  const aberta = useConversa(conversa, ehNova);

  const aoTerminar = (gravou: boolean) => {
    void qc.invalidateQueries({ queryKey: assistenteKeys.conversas() });
    if (gravou) void qc.invalidateQueries({ queryKey: marketingKeys.all });
  };

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-4">
      <PageHeader title="Assistente de IA" />
      <div className="flex min-h-0 flex-1 flex-col gap-4 tablet:flex-row">
        <ListaDeConversas
          conversas={conversas.data ?? []}
          ativaId={conversa}
          onNova={nova}
          onAbrir={(id) => navigate(`${BASE}/${id}`)}
          onRenomear={(id, titulo) =>
            renomear.mutate({ conversaId: id, titulo }, { onError: (e) => toast.error(e.message) })
          }
          onApagar={(id) =>
            apagar.mutate(
              { conversaId: id },
              {
                onSuccess: () => {
                  if (id === conversa) navigate(BASE, { replace: true });
                },
                onError: (e) => toast.error(e.message),
              },
            )
          }
        />
        {conversa && (ehNova || aberta.data) ? (
          <Conversa
            key={conversa}
            conversaId={conversa}
            inicial={aberta.data?.mensagens ?? []}
            propostas={aberta.data?.propostas ?? []}
            onTurnoTerminou={aoTerminar}
          />
        ) : aberta.isError ? (
          <p className="text-body-sm text-error">{aberta.error.message}</p>
        ) : (
          <Skeleton className="h-full flex-1 rounded-lg" />
        )}
      </div>
    </div>
  );
}
