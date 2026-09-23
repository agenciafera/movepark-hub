// Edge Function: /booking-reminders
// Lembretes da reserva (23/09/2026, tarifas-operacao 2.1): entrada em até 24h e retirada em até 2h.
// Cada aviso passa por `_shared/notify.ts`: WhatsApp para quem tem o benefício e template
// aprovado; senão e-mail. Idempotente pelo `notification_log`.
//
// Chamada interna pelo pg_cron (pg_net), protegida pelo header x-booking-reminders-key.
//
// POST /functions/v1/booking-reminders   (header: x-booking-reminders-key: <chave>)
// → { ok, checkin: { checked, sent }, checkout: { checked, sent } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyBooking, type NotifyEvent } from "../_shared/notify.ts";
import { tplBookingReminderCheckin, tplBookingReminderCheckout } from "../_shared/email.ts";
import { siteUrl } from "../_shared/site.ts";
import { pendingFor, reminderWindows } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const BATCH = 50;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: expected } = await admin.rpc("booking_reminders_expected_key");
  if (!expected || req.headers.get("x-booking-reminders-key") !== expected) return json({ error: "unauthorized" }, 401);

  const w = reminderWindows(Date.now());
  const site = siteUrl();
  const select = "id, code, check_in_at, check_out_at, status, location:location!inner(name, address), vehicle:vehicle(license_plate, model)";

  async function run(event: NotifyEvent, statuses: string[], field: "check_in_at" | "check_out_at", until: string) {
    const { data: rows, error } = await admin
      .from("booking")
      .select(select)
      .in("status", statuses)
      .is("deleted_at", null)
      .gte(field, w.now)
      .lte(field, until)
      .order(field, { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    const { data: logs } = ids.length
      ? await admin.from("notification_log").select("booking_id").eq("event", event).eq("status", "sent").in("booking_id", ids)
      : { data: [] };
    const done = new Set((logs ?? []).map((l: { booking_id: string }) => l.booking_id));
    const pend = pendingFor(rows ?? [], done);
    let sent = 0;
    for (const b of pend) {
      // deno-lint-ignore no-explicit-any
      const row = b as any;
      const data = {
        code: row.code, location_name: row.location?.name ?? "", location_address: row.location?.address ?? null,
        check_in_at: row.check_in_at, check_out_at: row.check_out_at, vehicle: row.vehicle ?? null,
      };
      const url = `${site}/bookings/${row.code}`;
      const tpl = event === "reminder_checkin" ? tplBookingReminderCheckin : tplBookingReminderCheckout;
      const quando = new Date(event === "reminder_checkin" ? row.check_in_at : row.check_out_at)
        .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const r = await notifyBooking(admin, {
        bookingId: row.id,
        event,
        whatsappParams: (c) => [c.name ?? "cliente", row.code, data.location_name, quando],
        email: (c) => tpl(data, c.name, url),
      });
      if (r.whatsapp === "sent" || r.email === "sent") sent += 1;
    }
    return { checked: rows?.length ?? 0, sent };
  }

  try {
    const checkin = await run("reminder_checkin", ["confirmed"], "check_in_at", w.checkinUntil);
    const checkout = await run("reminder_checkout", ["confirmed", "checked_in"], "check_out_at", w.checkoutUntil);
    return json({ ok: true, checkin, checkout });
  } catch (e) {
    console.error("[booking-reminders]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
