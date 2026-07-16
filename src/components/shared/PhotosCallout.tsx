import { Link } from "react-router-dom";
import { Camera, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Chamada forte para o upload de fotos. Foto é obrigatória para vender: sem pelo menos 1 foto, a
 * unidade não entra na busca. Tratada como fase de destaque no onboarding, reaproveitada na
 * pós-publicação e no fim do recebimento.
 */
const SHOT_LIST = ["Fachada e entrada", "As vagas cobertas", "Onde o cliente circula", "A recepção ou guarita"];

export function PhotosCallout({
  to = "/operator/locations",
  className,
  ctaLabel = "Adicionar fotos agora",
}: {
  to?: string;
  className?: string;
  ctaLabel?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-mp-primary/30 bg-mp-pale p-5 tablet:p-6",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-mp-indigo">
        <AlertCircle className="h-4 w-4" />
        <span className="text-caption-sm font-semibold">Obrigatório para vender</span>
      </div>
      <h3 className="mt-2 text-title-md text-ink">Sua unidade precisa de pelo menos 1 foto</h3>
      <p className="mt-1.5 text-body-sm text-muted">
        Sem foto, sua unidade não entra na busca da Movepark e não recebe reserva. O cliente escolhe
        onde deixar o carro pelo que vê, então capriche: foto boa vale mais que qualquer desconto.
      </p>
      <ul className="mt-4 grid gap-2 tablet:grid-cols-2">
        {SHOT_LIST.map((shot) => (
          <li key={shot} className="flex items-center gap-2 text-body-sm text-ink">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mp-primary/10">
              <Camera className="h-3.5 w-3.5 text-mp-indigo" />
            </span>
            {shot}
          </li>
        ))}
      </ul>
      <Button asChild className="mt-5">
        <Link to={to}>
          <Camera className="h-4 w-4" /> {ctaLabel}
        </Link>
      </Button>
    </div>
  );
}
