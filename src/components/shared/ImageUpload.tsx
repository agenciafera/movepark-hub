import * as React from "react";
import { toast } from "sonner";
import { ImagePlus, Star, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PUBLIC_IMAGE_ACCEPT } from "@/lib/storage";
import { cn } from "@/lib/utils";

let _uid = 0;
function useId(prefix: string) {
  return React.useMemo(() => `${prefix}-${++_uid}`, [prefix]);
}

type UploadFn = (file: File) => Promise<string>;

type FieldProps = {
  label?: string;
  /** URL atual (fonte da verdade; aceita também colar URL manualmente). */
  value: string | null;
  onChange: (url: string | null) => void;
  /** Faz o upload e devolve a URL pública. O chamador escolhe bucket/path. */
  onUpload: UploadFn;
  /** Classe de proporção do preview (ex.: "aspect-[21/9]", "aspect-square"). */
  aspectClass?: string;
  /** Desabilita o envio (ex.: faltam campos que compõem o path). */
  disabled?: boolean;
  /** Dica exibida quando desabilitado. */
  disabledHint?: string;
  accept?: string;
};

/** Upload de UMA imagem: preview + botão de envio + campo de URL (paste) + remover. */
export function ImageUploadField({
  label,
  value,
  onChange,
  onUpload,
  aspectClass = "aspect-[21/9]",
  disabled,
  disabledHint,
  accept = PUBLIC_IMAGE_ACCEPT,
}: FieldProps) {
  const inputId = useId("img-up");
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    setUploading(true);
    try {
      const url = await onUpload(file);
      onChange(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label>{label}</Label>}

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-md border border-hairline bg-surface-soft",
          aspectClass,
        )}
      >
        {value ? (
          <img src={value} alt={label ?? "Imagem"} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <ImagePlus className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled || uploading}
          onChange={handleFile}
        />
        <Button asChild variant="secondary" size="sm" disabled={disabled || uploading}>
          <label htmlFor={inputId} className={disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {uploading ? "Enviando…" : value ? "Trocar imagem" : "Enviar imagem"}
          </label>
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X className="mr-1 h-3.5 w-3.5" />
            Remover
          </Button>
        )}
      </div>

      {disabled && disabledHint ? (
        <p className="text-caption text-muted">{disabledHint}</p>
      ) : (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="ou cole uma URL de imagem"
          aria-label="URL da imagem"
        />
      )}
    </div>
  );
}

type GalleryProps = {
  label?: string;
  values: string[];
  onChange: (urls: string[]) => void;
  onUpload: UploadFn;
  disabled?: boolean;
  max?: number;
  accept?: string;
};

/** Upload de VÁRIAS imagens: grade de miniaturas + botão "+ Foto" + remover por item. */
export function ImageGalleryField({
  label,
  values,
  onChange,
  onUpload,
  disabled,
  max = 12,
  accept = PUBLIC_IMAGE_ACCEPT,
}: GalleryProps) {
  const inputId = useId("img-gal");
  const [uploading, setUploading] = React.useState(false);
  const atLimit = values.length >= max;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = Math.max(0, max - values.length);
    if (room === 0) {
      toast.error(`Máximo de ${max} imagens.`);
      return;
    }
    setUploading(true);
    try {
      const urls = await Promise.all(files.slice(0, room).map((f) => onUpload(f)));
      onChange([...values, ...urls]);
      if (files.length > room) toast.error(`Só couberam ${room} imagem(ns) (máx. ${max}).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label>{label}</Label>}
      <div className="flex flex-wrap gap-2">
        {values.map((url, i) => {
          const isCover = i === 0;
          return (
            <div key={url} className="relative h-20 w-28 overflow-hidden rounded-sm border border-hairline">
              <img src={url} alt="" className="h-full w-full object-cover" />
              {isCover ? (
                <span className="absolute left-1 top-1 flex items-center gap-1 rounded-sm bg-mp-primary px-1.5 py-0.5 text-[10px] font-semibold text-canvas shadow-tier">
                  <Star className="h-3 w-3 fill-canvas" /> Capa
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange([url, ...values.filter((u) => u !== url)])}
                  className="absolute bottom-1 left-1 flex items-center gap-1 rounded-sm bg-canvas/90 px-1.5 py-0.5 text-[10px] font-medium text-ink shadow-tier hover:text-mp-indigo"
                  aria-label="Definir como capa"
                  title="Definir como capa"
                >
                  <Star className="h-3 w-3" /> Capa
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange(values.filter((u) => u !== url))}
                className="absolute right-1 top-1 rounded-full bg-canvas/90 p-0.5 text-ink shadow-tier"
                aria-label="Remover foto"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        {!atLimit && (
          <>
            <input
              id={inputId}
              type="file"
              accept={accept}
              multiple
              className="hidden"
              disabled={disabled || uploading}
              onChange={handleFiles}
            />
            <label
              htmlFor={inputId}
              className={cn(
                "flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-hairline text-caption text-muted",
                disabled || uploading ? "pointer-events-none opacity-50" : "cursor-pointer hover:border-mp-primary hover:text-ink",
              )}
            >
              <ImagePlus className="h-4 w-4" />
              {uploading ? "Enviando…" : "+ Foto"}
            </label>
          </>
        )}
      </div>
      {values.length > 0 && (
        <p className="text-caption-sm text-muted">
          A foto marcada como Capa é a que aparece em destaque na busca. Toque na estrela de outra
          foto pra trocar.
        </p>
      )}
    </div>
  );
}
