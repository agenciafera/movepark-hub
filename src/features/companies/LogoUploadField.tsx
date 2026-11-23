import * as React from "react";
import { toast } from "sonner";
import { UploadSimple, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadCompanyAsset } from "@/lib/storage";
import { LOGO_ACCEPT, LOGO_WHITE_FILTER, prepareLogoFile } from "@/lib/parkingLogo";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  hint: string;
  /** Fundo em que o logo vai aparecer: a prévia usa o mesmo, para a pessoa ver se ele some. */
  background: "light" | "dark";
  value: string | null;
  /** Empresa dona do arquivo (o upload vai para `assets-public/<company_id>/`). */
  companyId: string;
  onChange: (url: string | null) => void;
  disabled?: boolean;
};

/**
 * Campo de logo do estacionamento (docs/specs/logo-do-estacionamento.md). Só PNG e JPG, porque o
 * e-mail e o voucher não mostram outro formato. A prévia fica sobre o fundo de destino: o logo de
 * fundo escuro aparece todo branco no navy do topo do voucher da conta, como o cliente vai ver.
 */
export function LogoUploadField({
  id,
  label,
  hint,
  background,
  value,
  companyId,
  onChange,
  disabled,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadCompanyAsset(
        companyId,
        background === "dark" ? "logo-escuro" : "logo",
        prepareLogoFile(file),
      );
      onChange(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar o logo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-14 w-32 shrink-0 items-center justify-center rounded-md border px-2",
            background === "dark"
              ? "border-transparent bg-mp-navy"
              : "border-hairline bg-surface-soft",
          )}
          data-testid={`${id}-preview`}
        >
          {value ? (
            <img
              src={value}
              alt={`Prévia: ${label}`}
              className="max-h-9 max-w-full object-contain"
              style={background === "dark" ? { filter: LOGO_WHITE_FILTER } : undefined}
            />
          ) : (
            <span
              className={cn(
                "text-caption",
                background === "dark" ? "text-white/70" : "text-muted",
              )}
            >
              Sem logo
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={LOGO_ACCEPT}
            className="sr-only"
            onChange={handleFile}
            disabled={disabled || uploading}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            <UploadSimple className="h-4 w-4" aria-hidden />
            {uploading ? "Enviando…" : value ? "Trocar" : "Enviar"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => onChange(null)}
            >
              <X className="h-4 w-4" aria-hidden />
              Remover
            </Button>
          )}
        </div>
      </div>
      <p className="text-caption text-muted">{hint}</p>
    </div>
  );
}
