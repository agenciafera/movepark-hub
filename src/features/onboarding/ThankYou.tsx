import { Link } from "react-router-dom";
import { CheckCircle2, Clock } from "@/lib/icons";
import { Button } from "@/components/ui/button";

type Props = {
  alreadySubmitted?: boolean;
};

export function ThankYou({ alreadySubmitted }: Props) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-md border border-hairline bg-canvas px-6 py-12 text-center">
      <div className="text-success">
        {alreadySubmitted ? (
          <Clock className="h-12 w-12" />
        ) : (
          <CheckCircle2 className="h-12 w-12" />
        )}
      </div>
      <div className="space-y-2">
        <h2 className="text-display-md text-ink">
          {alreadySubmitted ? "Já recebemos seu cadastro" : "Recebemos seu cadastro"}
        </h2>
        <p className="mx-auto max-w-md text-body-md text-muted">
          {alreadySubmitted
            ? "Seu cadastro já está em análise pela nossa equipe. Em breve entraremos em contato."
            : "Nossa equipe vai analisar as informações e entrar em contato em até 2 dias úteis para validar e liberar a próxima etapa do cadastro."}
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link to="/">Voltar para a página inicial</Link>
      </Button>
    </div>
  );
}
