/**
 * Logo do estacionamento (ClickUp 17tn9ea435c, spec docs/specs/logo-do-estacionamento.md).
 *
 * Cada fundo tem o seu arquivo: `logo_url` é o logo para fundo claro e `logo_dark_url` para fundo
 * escuro. A unidade pode trocar o da empresa (`location.logo_*`); nulo segue a empresa.
 *
 * Um fundo nunca cai para o arquivo do outro: o logo de fundo claro costuma ser escuro, e posto
 * sobre o topo navy do voucher ele some. Sem o arquivo certo, o lugar fica sem logo, como hoje.
 *
 * A mesma regra existe nas Edges, em `supabase/functions/_shared/voucher/fields.ts`
 * (`resolveParkingLogo`). Ao mudar aqui, mude lá.
 */

export type LogoFields = {
  logo_url?: string | null;
  logo_dark_url?: string | null;
};

export type ParkingLogo = {
  /** Para fundo claro (checkout, reserva, e-mail de confirmação, PDF do voucher). */
  light: string | null;
  /** Para fundo escuro (topo navy do voucher na conta). */
  dark: string | null;
};

function clean(url: string | null | undefined): string | null {
  const v = (url ?? "").trim();
  return v ? v : null;
}

export function resolveParkingLogo(
  location: LogoFields | null | undefined,
  company: LogoFields | null | undefined,
): ParkingLogo {
  return {
    light: clean(location?.logo_url) ?? clean(company?.logo_url),
    dark: clean(location?.logo_dark_url) ?? clean(company?.logo_dark_url),
  };
}

/** Formatos aceitos no upload do logo: o e-mail não mostra SVG e o PDF do voucher só embute PNG e JPG. */
export const LOGO_MIME = ["image/png", "image/jpeg"] as const;
export const LOGO_ACCEPT = LOGO_MIME.join(",");
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Confere o arquivo e devolve uma cópia com a extensão certa no nome. A Edge `upload-asset` tira a
 * extensão do nome do arquivo, e o banco exige `.png`/`.jpg` no fim da URL
 * (`*_logo_*_formato`): um PNG chamado "logo" sem extensão seria recusado no salvar.
 */
export function prepareLogoFile(file: File): File {
  if (!(LOGO_MIME as readonly string[]).includes(file.type)) {
    throw new Error("Use PNG ou JPG. SVG e WebP não aparecem no e-mail nem no voucher.");
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error("Logo muito grande (máx. 2 MB).");
  }
  const ext = file.type === "image/png" ? "png" : "jpg";
  return new File([file], `logo.${ext}`, { type: file.type });
}
