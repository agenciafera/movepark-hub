import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PreviewItem } from "./UnitPreviewCard";
import { caminhoFicha } from "@/lib/urls";

/**
 * Leitura da unidade para o **preview travado** (E1.9). Não precisa de RPC nem bypass de RLS: as
 * policies de SELECT scopeadas por empresa (location_select, lpt_select, …) já deixam o dono ler a
 * própria unidade independente de is_active/status/is_listed. O público só enxerga quando
 * location.is_listed (RLS catalog_read_location), que liga quando a empresa tem recebedor ativo.
 * Ver spec partner-onboarding-redesign.md §6.4.
 */
export type PreviewUnit = {
  name: string;
  address: string;
  destinationName: string | null;
  hasShuttle: boolean;
  isActive: boolean;
  /** Já aparece na busca / URL pública? (liga quando o recebedor da empresa fica ativo.) */
  isListed: boolean;
  items: PreviewItem[];
  /** fotos da unidade (a 1ª vira capa do card). */
  photos: string[];
  /** URL pública copiável (existe quando a unidade tem ao menos um tipo de vaga). */
  publicUrl: string | null;
};

export function usePreviewUnit(locationId: string | undefined) {
  return useQuery({
    queryKey: ["preview-unit", locationId] as const,
    enabled: !!locationId,
    queryFn: async (): Promise<PreviewUnit | null> => {
      const { data: loc, error } = await supabase
        .from("location")
        .select(
          "id, name, slug, public_slug, address, has_shuttle, status, is_listed, photos, company:company!inner(slug), destination:destination(name, public_slug)",
        )
        .eq("id", locationId!)
        .maybeSingle();
      if (error) throw error;
      if (!loc) return null;

      const { data: lpts, error: lptErr } = await supabase
        .from("location_parking_type")
        .select(
          "capacity, company_parking_type:company_parking_type!inner(base_price, parking_type:parking_type!inner(code, name))",
        )
        .eq("location_id", locationId!);
      if (lptErr) throw lptErr;

      // deno-lint-ignore no-explicit-any
      const l = loc as any;
      // deno-lint-ignore no-explicit-any
      const rows = (lpts ?? []) as any[];

      const items: PreviewItem[] = rows.map((r) => ({
        name: r.company_parking_type.parking_type.name,
        base_price: Number(r.company_parking_type.base_price),
        capacity: r.capacity,
      }));

      // A ficha é uma só por unidade, então o link não depende mais do tipo de vaga.
      const destinoSlug = (l.destination as { public_slug?: string | null } | null)?.public_slug;
      const publicUrl =
        destinoSlug && l.public_slug ? caminhoFicha(destinoSlug, l.public_slug as string) : null;

      return {
        name: l.name,
        address: l.address ?? "",
        destinationName: l.destination?.name ?? null,
        hasShuttle: Boolean(l.has_shuttle),
        isActive: l.status === "active",
        isListed: Boolean(l.is_listed),
        items,
        photos: Array.isArray(l.photos) ? (l.photos as string[]) : [],
        publicUrl,
      };
    },
  });
}
