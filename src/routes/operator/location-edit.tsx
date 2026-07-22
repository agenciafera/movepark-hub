import * as React from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOperatorLocations } from "@/features/locations/api";
import { useLocationForm } from "@/features/locations/useLocationForm";
import { LocationSections } from "@/features/locations/LocationSections";
import { useAuth } from "@/auth/context";

export default function OperatorLocationEdit() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const { effectiveCompanyIds } = useAuth();
  const { data, isLoading, isError } = useOperatorLocations(effectiveCompanyIds);

  // A listagem já vem escopada por empresa, então achar aqui dentro é também a
  // checagem de posse: unidade de outra empresa simplesmente não está na lista.
  const location = data?.find((l) => l.id === locationId) ?? null;

  // Depois de salvar, a navegação de saída é intencional e não deve pedir
  // confirmação, mesmo com o formulário ainda "sujo" (a query só recarrega o
  // baseline depois). Este ref libera a saída nesse instante.
  const savedRef = React.useRef(false);

  const form = useLocationForm({
    companyId: location?.company_id ?? "",
    location,
    operatorMode: true,
    onSaved: () => {
      savedRef.current = true;
      navigate("/operator/locations");
    },
  });

  // Semeia o formulário quando a UNIDADE muda, não quando o objeto muda de
  // identidade. `location` é referência nova sempre que a query responde com
  // dado diferente: dependendo dela, uma atualização vinda de fora no meio da
  // edição chamava `reset()` e sobrescrevia o que a pessoa tinha acabado de
  // digitar. Quem está editando manda no formulário até salvar ou sair.
  const { reset } = form;
  React.useEffect(() => {
    if (location) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.id]);

  // Guarda de saída com alterações não salvas.
  const guard = form.isDirty && !savedRef.current;

  // Fechar/recarregar a aba: o navegador mostra o próprio aviso nativo.
  React.useEffect(() => {
    if (!guard) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [guard]);

  // Navegação dentro do app (Cancelar, seta, sidebar, barra inferior): intercepta
  // e pede confirmação. Cobre as quatro saídas de uma vez.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      guard && currentLocation.pathname !== nextLocation.pathname,
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Não conseguimos carregar esta unidade"
        description="Pode ter sido a conexão. Tente de novo."
        action={
          <Button size="sm" variant="secondary" asChild>
            <Link to="/operator/locations">Voltar para Localizações</Link>
          </Button>
        }
      />
    );
  }

  if (!location) {
    return (
      <EmptyState
        title="Unidade não encontrada"
        description="Ela pode ter sido removida, ou o endereço está errado."
        action={
          <Button size="sm" variant="secondary" asChild>
            <Link to="/operator/locations">Voltar para Localizações</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <form className="flex flex-col gap-6" onSubmit={form.submit}>
        <div className="flex flex-col gap-2">
          <Link
            to="/operator/locations"
            className="inline-flex w-fit items-center gap-1.5 text-body-sm text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Localizações
          </Link>
          <PageHeader
            title={location.name}
            description="Endereço, contato, chegada e fotos desta unidade. Capacidade e preço ficam em Tipos de vaga."
          />
        </div>

        <LocationSections form={form} companyId={location.company_id} location={location} />

        {/* Barra fixa: o formulário tem sete blocos e passa da dobra em qualquer
            tela. Sem isto, salvar exige rolar até o fim toda vez. */}
        <div className="sticky bottom-0 z-30 -mx-4 flex items-center justify-end gap-2 border-t border-hairline bg-canvas px-4 py-3 desktop:-mx-8 desktop:px-8">
          <Button type="button" variant="ghost" asChild>
            <Link to="/operator/locations">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={form.submitting}>
            {form.submitting ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </form>

      <Dialog open={blocker.state === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sair sem salvar?</DialogTitle>
            <DialogDescription>
              Você mudou dados desta unidade e ainda não salvou. Se sair agora, perde as alterações.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
            <Button type="button" variant="secondary" onClick={() => blocker.reset?.()}>
              Continuar editando
            </Button>
            <Button type="button" variant="danger" onClick={() => blocker.proceed?.()}>
              Sair sem salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
