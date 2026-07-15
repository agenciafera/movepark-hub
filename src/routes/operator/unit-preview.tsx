import * as React from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Copy,
  Eye,
  ExternalLink,
  Landmark,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import { Wordmark } from "@/components/shared/Brand";
import { Button } from "@/components/ui/button";
import { UnitPreviewCard } from "@/features/onboarding/publish/UnitPreviewCard";
import { usePreviewUnit } from "@/features/onboarding/publish/previewApi";

const PUBLIC_SITE_URL =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "") ??
  "https://hub.movepark.co";

export default function UnitPreviewPage() {
  const { locationId } = useParams();
  const [params] = useSearchParams();
  const justPublished = params.get("published") === "1";
  const { data: unit, isLoading } = usePreviewUnit(locationId);

  const absoluteUrl = unit?.publicUrl ? `${PUBLIC_SITE_URL}${unit.publicUrl}` : null;
  const [copied, setCopied] = React.useState(false);

  async function copyUrl() {
    if (!absoluteUrl) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      toast.success("Link copiado!");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  }

  return (
    <div className="min-h-screen bg-surface-soft">
      <Helmet>
        <title>Pré-visualização da unidade | Movepark</title>
      </Helmet>
      <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 py-8 tablet:py-12 desktop:px-8">
        <div className="flex items-center justify-between">
          <Wordmark height={24} />
          <Button asChild variant="ghost" size="sm">
            <Link to="/operator">
              <ArrowLeft className="h-4 w-4" /> Ir para o painel
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-muted">Carregando pré-visualização…</div>
        ) : !unit ? (
          <div className="rounded-lg border border-hairline bg-canvas p-8 text-center">
            <p className="text-body-md text-ink">Unidade não encontrada.</p>
            <p className="mt-1 text-body-sm text-muted">
              Ela pode não existir ou não pertencer à sua empresa.
            </p>
          </div>
        ) : (
          <>
            {justPublished && (
              <div
                className={
                  "flex items-start gap-3 rounded-lg border p-5 " +
                  (unit.isListed ? "border-success/30 bg-success/5" : "border-mp-primary/30 bg-mp-pale")
                }
              >
                <PartyPopper
                  className={
                    "mt-0.5 h-6 w-6 shrink-0 " + (unit.isListed ? "text-success" : "text-mp-indigo")
                  }
                />
                <div>
                  {unit.isListed ? (
                    <>
                      <h1 className="text-title-lg text-ink">Sua unidade está no ar! 🚗</h1>
                      <p className="mt-1 text-body-sm text-muted">
                        Já aparece na busca da Movepark. Compartilhe o link e comece a receber
                        reservas. Depois é só deixar a unidade redonda no painel (fotos, comodidades,
                        horários).
                      </p>
                    </>
                  ) : (
                    <>
                      <h1 className="text-title-lg text-ink">Boa! Sua unidade tomou forma 🎉</h1>
                      <p className="mt-1 text-body-sm text-muted">
                        Veja aqui embaixo como ela vai aparecer pro cliente. Falta a etapa 2 pra ela
                        entrar na busca e você começar a vender: seus dados de recebimento.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {!justPublished && (
              <div className="flex items-center gap-2 rounded-md bg-mp-pale px-4 py-2.5 text-body-sm text-mp-indigo">
                <Eye className="h-4 w-4" /> Pré-visualização: é assim que o cliente vê sua unidade.
              </div>
            )}

            <div className="grid items-start gap-6 tablet:grid-cols-2">
              <UnitPreviewCard
                name={unit.name}
                address={unit.address}
                destinationName={unit.destinationName}
                hasShuttle={unit.hasShuttle}
                items={unit.items}
              />

              <div className="flex flex-col gap-4">
                {!unit.isListed ? (
                  <>
                    {/* Etapa 2 (primário): dados de recebimento — é o que libera a venda e a busca */}
                    <div className="rounded-lg border border-mp-primary/40 bg-mp-pale p-5">
                      <span className="text-caption-sm font-semibold uppercase tracking-wide text-mp-indigo">
                        Etapa 2 de 2
                      </span>
                      <h2 className="mt-1 text-title-md text-ink">Falta pouco pra você vender</h2>
                      <p className="mt-1 text-body-sm text-muted">
                        Pra receber os pagamentos e entrar na busca da Movepark, complete seus dados de
                        recebimento:
                      </p>
                      <ul className="mt-3 flex flex-col gap-2.5">
                        <li className="flex items-center gap-2.5 text-body-sm text-ink">
                          <Landmark className="h-4 w-4 shrink-0 text-mp-indigo" /> Conta bancária
                        </li>
                        <li className="flex items-center gap-2.5 text-body-sm text-ink">
                          <Building2 className="h-4 w-4 shrink-0 text-mp-indigo" /> CNPJ e dados da empresa
                        </li>
                        <li className="flex items-center gap-2.5 text-body-sm text-ink">
                          <ShieldCheck className="h-4 w-4 shrink-0 text-mp-indigo" /> Verificação de
                          identidade (KYC)
                        </li>
                      </ul>
                      <Button asChild size="sm" className="mt-4 w-fit">
                        <Link to="/operator/recebimento">
                          Continuar cadastro <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <p className="mt-2 text-caption-sm text-muted-steel">
                        Assim que aprovarmos seus dados, a unidade entra na busca sozinha.
                      </p>
                    </div>

                    {/* Secundário (opcional, sem pressa): deixar a página redonda */}
                    <div className="rounded-lg border border-hairline bg-canvas p-5">
                      <h2 className="text-title-md text-ink">Deixe a página redonda (quando quiser)</h2>
                      <p className="mt-1 text-body-sm text-muted">
                        Fotos, comodidades, horário/24h e como chegar deixam sua página mais vendedora.
                        Sem pressa: dá pra fazer depois, no painel.
                      </p>
                      <Button asChild size="sm" variant="ghost" className="mt-3 w-fit">
                        <Link to="/operator/locations">Ir para minhas unidades</Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-hairline bg-canvas p-5">
                      <h2 className="text-title-md text-ink">Link público da sua unidade</h2>
                      {absoluteUrl ? (
                        <>
                          <p className="mt-1 text-body-sm text-muted">
                            Envie no WhatsApp, redes ou no seu site. A reserva acontece por aqui.
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <code className="flex-1 truncate rounded-md border border-hairline bg-surface-soft px-3 py-2 text-caption text-ink">
                              {absoluteUrl}
                            </code>
                            <Button size="sm" variant="secondary" onClick={copyUrl}>
                              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              {copied ? "Copiado" : "Copiar"}
                            </Button>
                          </div>
                          {unit.isActive && (
                            <Button asChild size="sm" variant="ghost" className="mt-2 w-fit">
                              <a href={unit.publicUrl!} target="_blank" rel="noreferrer">
                                Abrir página pública <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </>
                      ) : (
                        <p className="mt-1 text-body-sm text-muted">
                          Cadastre ao menos um tipo de vaga para gerar o link público.
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-hairline bg-surface-pale p-5">
                      <h2 className="text-title-md text-ink">Deixe redondo depois</h2>
                      <p className="mt-1 text-body-sm text-muted">
                        Fotos, comodidades, horário/24h, como chegar e serviços extras deixam sua
                        página mais vendedora. Você faz isso quando quiser, no painel.
                      </p>
                      <Button asChild size="sm" variant="secondary" className="mt-3 w-fit">
                        <Link to="/operator/locations">Ir para minhas unidades</Link>
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
