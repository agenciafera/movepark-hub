// Push hub→WL de uma reserva (E2.5.1). Best-effort: nunca lança — em falha só loga,
// pra não derrubar a criação/cancelamento da reserva. A divergência é pega na reconciliação.
import { wlPostSync, wlReady, type WlConfig } from "./client.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export interface PushBookingParams {
  bookingId: string;
  locationParkingTypeId: string;
  operation: "reserve" | "release";
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  quantity?: number;
}

export async function pushBookingToWl(
  admin: AdminClient,
  token: string | undefined,
  p: PushBookingParams,
): Promise<void> {
  if (!token || !p.bookingId) return;
  try {
    const { data: lpt } = await admin
      .from("location_parking_type")
      .select("wl_category_slug, wl_product_slug, location:location!inner(company_id)")
      .eq("id", p.locationParkingTypeId)
      .single();

    const cat = lpt?.wl_category_slug as string | null | undefined;
    const prod = lpt?.wl_product_slug as string | null | undefined;
    const companyId = lpt?.location?.company_id as string | undefined;
    if (!cat || !prod || !companyId) return; // sem mapeamento → nada a sincronizar

    const { data: comp } = await admin
      .from("company")
      .select("wl_domain, wl_tenant_key, wl_sync_enabled")
      .eq("id", companyId)
      .single();
    if (!wlReady(comp as WlConfig | null)) return; // integração desligada

    await wlPostSync(comp as WlConfig, token, {
      external_id: p.bookingId,
      operation: p.operation,
      category_slug: cat,
      product_slug: prod,
      quantity: p.quantity ?? 1,
      start_date: p.startDate,
      end_date: p.endDate,
    });
  } catch (e) {
    console.error(`wl push (${p.operation}) falhou:`, e instanceof Error ? e.message : e);
  }
}
