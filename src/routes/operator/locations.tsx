import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ImageOff } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOperatorLocations, summarizeLocation } from "@/features/locations/api";
import { useAuth } from "@/auth/context";
import type { EntityStatus } from "@/types/domain";

const statusTone: Record<EntityStatus, "active" | "pending" | "cancelled"> = {
  active: "active",
  inactive: "pending",
  suspended: "cancelled",
};

// O enum vive em inglês no banco; o parceiro lê em português. Mesmo dicionário
// que o LocationForm já usa, para a listagem e o editor não divergirem.
const statusLabel: Record<EntityStatus, string> = {
  active: "Ativa",
  inactive: "Inativa",
  suspended: "Suspensa",
};

const plural = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

export default function OperatorLocations() {
  const { effectiveCompanyIds } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } =
    useOperatorLocations(effectiveCompanyIds);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Deep-link legado: /operator/locations?edit=<id> era usado pelo "Adicionar mais
  // fotos" da tela de preview, quando o editor era um dialog aqui dentro. Agora o
  // editor é página própria, então o parâmetro só redireciona (com replace, pra não
  // deixar a listagem no histórico entre o preview e o editor).
  const editId = searchParams.get("edit");
  React.useEffect(() => {
    if (!editId) return;
    navigate(`/operator/locations/${editId}/editar`, { replace: true });
  }, [editId, navigate]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Localizações"
        description="Endereço, fotos e dados de cada unidade. Capacidade e preço ficam em Tipos de vaga."
      />

      {isLoading ? (
        <div
          className="grid grid-cols-1 gap-4 tablet:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]"
          role="status"
          aria-busy="true"
          aria-label="Carregando suas unidades"
        >
          {Array.from({ length: 2 }).map((_, i) => (
            // Skeleton montado com a estrutura real do card: a altura vem do
            // layout, então não dessincroniza quando o card mudar.
            <Card key={i} aria-hidden="true">
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
                <Skeleton className="h-4 w-2/5" />
                <div className="flex gap-2 border-t border-hairline-soft pt-4">
                  <Skeleton className="h-9 w-32" />
                  <Skeleton className="h-9 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        // Sem este ramo, uma queda de rede caía no empty state e dizia ao parceiro
        // que ele não tem unidades cadastradas.
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10" />}
          title="Não conseguimos carregar suas unidades"
          description="Pode ter sido a conexão. Tente de novo."
          action={
            <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Carregando..." : "Tentar de novo"}
            </Button>
          }
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Sem localizações vinculadas"
          description="Solicite à equipe Movepark para cadastrar suas unidades."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
          {data?.map((loc) => {
            const { spots, types, photos } = summarizeLocation(loc);
            return (
              <li key={loc.id} className="flex">
                <Card className="flex w-full flex-col">
                  <CardContent className="flex flex-1 flex-col gap-4 p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-balance text-display-sm text-ink">{loc.name}</h3>
                        <p className="text-body-sm text-body">
                          {loc.address ?? "Endereço não informado"}
                        </p>
                      </div>
                      <Badge
                        tone={statusTone[loc.status]}
                        aria-label={`Status da unidade: ${statusLabel[loc.status]}`}
                      >
                        {statusLabel[loc.status]}
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-1">
                      <p className="text-body-sm text-muted">
                        {plural(spots, "vaga", "vagas")} · {plural(types, "tipo", "tipos")} ·{" "}
                        {plural(photos, "foto", "fotos")}
                      </p>
                      {photos === 0 && (
                        <p className="flex items-center gap-1.5 text-body-sm text-warning">
                          <ImageOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                          Sem foto, não aparece na busca
                        </p>
                      )}
                    </div>

                    <div className="mt-auto flex gap-2 border-t border-hairline-soft pt-4">
                      <Button size="sm" variant="secondary" asChild>
                        <Link to={`/operator/locations/${loc.id}/parking-types`}>
                          Tipos de vaga
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/operator/locations/${loc.id}/editar`}>Editar</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}
