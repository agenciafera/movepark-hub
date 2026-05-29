import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

type AddressRow = Database["public"]["Tables"]["address"]["Row"];
type AddressInsert = Database["public"]["Tables"]["address"]["Insert"];
type AddressUpdate = Database["public"]["Tables"]["address"]["Update"];

const KEY = ["my-addresses"] as const;

export function useMyAddresses(profileId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, profileId ?? "anon"],
    queryFn: async (): Promise<AddressRow[]> => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from("address")
        .select("*")
        .eq("profile_id", profileId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AddressRow[];
    },
    enabled: !!profileId,
    staleTime: 60_000,
  });
}

export function useCreateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddressInsert) => {
      // Se vai como default, desmarca outros antes
      if (payload.is_default && payload.profile_id) {
        await supabase
          .from("address")
          .update({ is_default: false })
          .eq("profile_id", payload.profile_id);
      }
      const { error } = await supabase.from("address").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; profileId: string; patch: AddressUpdate }) => {
      if (args.patch.is_default) {
        await supabase
          .from("address")
          .update({ is_default: false })
          .eq("profile_id", args.profileId);
      }
      const { error } = await supabase
        .from("address")
        .update(args.patch)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("address").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Busca dados de endereço pelo CEP usando ViaCEP (sem chave, free). */
export async function lookupCep(cep: string) {
  const onlyDigits = cep.replace(/\D/g, "");
  if (onlyDigits.length !== 8) throw new Error("CEP inválido");
  const res = await fetch(`https://viacep.com.br/ws/${onlyDigits}/json/`);
  if (!res.ok) throw new Error("Falha ao consultar CEP");
  const data: {
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
    erro?: boolean;
  } = await res.json();
  if (data.erro) throw new Error("CEP não encontrado");
  return {
    street: data.logradouro ?? "",
    district: data.bairro ?? "",
    city: data.localidade ?? "",
    state: data.uf ?? "",
  };
}
