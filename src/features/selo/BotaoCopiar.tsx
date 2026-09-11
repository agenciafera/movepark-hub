import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * Copia um valor e confirma na própria etiqueta por dois segundos.
 *
 * A confirmação visual não é enfeite: a página inteira serve para copiar coisas, e sem
 * ela o parceiro não sabe se o clique pegou, então clica de novo e cola duas vezes.
 */
export function BotaoCopiar({
  valor,
  rotulo = "Copiar",
  variant = "secondary",
}: {
  valor: string;
  rotulo?: string;
  variant?: "secondary" | "ghost";
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      toast.success("Copiado");
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Seu navegador bloqueou a cópia. Selecione o texto e copie na mão.");
    }
  }

  return (
    <Button size="sm" variant={variant} onClick={copiar}>
      {variant === "ghost" ? null : copiado ? <Check weight="bold" /> : <Copy />}
      {copiado ? "Copiado" : rotulo}
    </Button>
  );
}
