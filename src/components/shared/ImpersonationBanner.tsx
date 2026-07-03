import { useNavigate } from "react-router-dom";
import { LogOut, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/context";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const { session, impersonatedCompanyId, stopImpersonation } = useAuth();
  const navigate = useNavigate();

  const { data: company } = useQuery({
    queryKey: ["impersonated-company", impersonatedCompanyId],
    queryFn: async () => {
      if (!impersonatedCompanyId) return null;
      const { data } = await supabase
        .from("company")
        .select("id, name")
        .eq("id", impersonatedCompanyId)
        .maybeSingle();
      return data;
    },
    enabled: !!impersonatedCompanyId,
  });

  if (!impersonatedCompanyId || session?.role !== "hub_admin") return null;

  return (
    <div className="flex flex-col gap-3 border-b border-mp-red/40 bg-mp-pale px-4 py-3 tablet:flex-row tablet:items-center tablet:justify-between desktop:px-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-canvas p-2 shadow-tier">
          <ShieldAlert className="h-4 w-4 text-mp-red" />
        </div>
        <div className="leading-tight">
          <div className="text-caption text-mp-navy">
            Modo impersonator ativo
          </div>
          <div className="text-body-sm text-body">
            Você está vendo o painel como operador de{" "}
            <strong className="text-ink">{company?.name ?? "—"}</strong>.
          </div>
        </div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          stopImpersonation();
          navigate("/manager", { replace: true });
        }}
      >
        <LogOut className="h-4 w-4" />
        Sair do modo operador
      </Button>
    </div>
  );
}
