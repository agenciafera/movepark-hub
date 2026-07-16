import { Link } from "react-router-dom";
import { Camera, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Chamada para o upload de fotos. Dois tons:
 *  - sem foto (hasPhotos=false): cobra o mínimo obrigatório (sem foto não vende).
 *  - com foto (hasPhotos=true): parabeniza e estimula a subir MAIS fotos (mais foto, mais reserva).
 * Reaproveitada na pós-publicação. Foto é obrigatória pra vender (gate is_listed).
 */
const SHOT_LIST = ["Fachada e entrada", "As vagas cobertas", "Onde o cliente circula", "A recepção ou guarita"];

export function PhotosCallout({
  to = "/operator/locations",
  className,
  ctaLabel,
  hasPhotos = false,
}: {
  to?: string;
  className?: string;
  ctaLabel?: string;
  /** já tem ao menos 1 foto? muda o texto pra estimular a subir mais em vez de cobrar o mínimo. */
  hasPhotos?: boolean;
}) {
  const EyebrowIcon = hasPhotos ? Sparkles : AlertCircle;
  const eyebrow = hasPhotos ? "Quanto mais fotos, mais reservas" : "Obrigatório para vender";
  const title = hasPhotos
    ? "Que tal mais algumas fotos?"
    : "Sua unidade precisa de pelo menos 1 foto";
  const body = hasPhotos
    ? "Você já subiu uma foto, ótimo. Estacionamento com mais fotos passa confiança e recebe mais reserva. Mostre a fachada, as vagas e onde o cliente circula."
    : "Sem foto, sua unidade não entra na busca da Movepark e não recebe reserva. O cliente escolhe onde deixar o carro pelo que vê, então capriche: foto boa vale mais que qualquer desconto.";
  const cta = ctaLabel ?? (hasPhotos ? "Adicionar mais fotos" : "Adicionar fotos agora");

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-mp-primary/30 bg-mp-pale p-5 tablet:p-6",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-mp-indigo">
        <EyebrowIcon className="h-4 w-4" />
        <span className="text-caption-sm font-semibold">{eyebrow}</span>
      </div>
      <h3 className="mt-2 text-title-md text-ink">{title}</h3>
      <p className="mt-1.5 text-body-sm text-muted">{body}</p>
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
          <Camera className="h-4 w-4" /> {cta}
        </Link>
      </Button>
    </div>
  );
}
