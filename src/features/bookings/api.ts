import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { BookingStatus, BookingWithRelations } from "@/types/domain";

type BookingUpdate = Database["public"]["Tables"]["booking"]["Update"];

export type BookingFilters = {
  status?: BookingStatus[];
  companyIds?: string[];
  locationIds?: string[];
  from?: string;
  to?: string;
  search?: string;
};

export const bookingsKeys = {
  all: ["bookings"] as const,
  list: (filters: BookingFilters) => [...bookingsKeys.all, "list", filters] as const,
  detail: (id: string) => [...bookingsKeys.all, "detail", id] as const,
  recent: () => [...bookingsKeys.all, "recent"] as const,
};

const baseSelect =
  "*, profile:profiles(id, full_name, phone, tax_id), location:location(id, name, slug, timezone, company:company(id, name, slug)), vehicle:vehicle(id, license_plate, model, color)";

async function fetchBookings(filters: BookingFilters): Promise<BookingWithRelations[]> {
  let query = supabase
    .from("booking")
    .select(baseSelect)
    .is("deleted_at", null)
    .order("check_in_at", { ascending: false })
    .limit(100);

  if (filters.status?.length) query = query.in("status", filters.status);
  if (filters.locationIds?.length) query = query.in("location_id", filters.locationIds);
  if (filters.from) query = query.gte("check_in_at", filters.from);
  if (filters.to) query = query.lte("check_in_at", filters.to);
  if (filters.search) {
    query = query.or(`code.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  let rows = (data ?? []) as unknown as BookingWithRelations[];

  if (filters.companyIds?.length) {
    rows = rows.filter((r) => filters.companyIds!.includes(r.location?.company?.id ?? ""));
  }
  return rows;
}

export function useBookings(filters: BookingFilters) {
  return useQuery({
    queryKey: bookingsKeys.list(filters),
    queryFn: () => fetchBookings(filters),
  });
}

export function useRecentBookings(limit = 20) {
  return useQuery({
    queryKey: bookingsKeys.recent(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking")
        .select(baseSelect)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as BookingWithRelations[];
    },
  });
}

type UpdateStatusInput = {
  bookingId: string;
  status: BookingStatus;
  timestamp?: { field: "checked_in_at" | "checked_out_at"; value: string };
  notes?: string;
};

export function useUpdateBookingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, status, timestamp, notes }: UpdateStatusInput) => {
      const patch: BookingUpdate = { status };
      if (timestamp) patch[timestamp.field] = timestamp.value;
      if (notes !== undefined) patch.notes = notes;
      const { error } = await supabase.from("booking").update(patch).eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookingsKeys.all });
    },
  });
}
