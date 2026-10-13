import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/context";
import { COMPANY_ROLE_LABEL } from "@/features/team/team.logic";
import { useMyCompanies } from "./api";

export type CompanyOption = { id: string; name: string; roleLabel: string | null };

/**
 * Seletor de empresa do painel do parceiro (13/10/2026). Só existe para quem é membro de mais de
 * uma empresa: com uma, não há o que escolher, e o hub_admin troca de conta pelo seletor do
 * Manager (impersonation), que é outro mecanismo.
 *
 * Trocar leva ao início do painel: a tela aberta podia ser a ficha de uma unidade ou reserva da
 * empresa anterior, que na nova não existe.
 */
export function useCompanySwitch() {
  const { session, effectiveCompanyIds, switchCompany } = useAuth();
  const navigate = useNavigate();
  const ids = session && session.role !== "hub_admin" ? session.companyIds : [];
  const enabled = ids.length > 1;
  const companies = useMyCompanies(ids, enabled);
  const activeId = enabled ? (effectiveCompanyIds[0] ?? null) : null;

  const options: CompanyOption[] = (companies.data ?? []).map((c) => {
    const role = session?.companyRoles[c.id];
    return { id: c.id, name: c.name, roleLabel: role ? COMPANY_ROLE_LABEL[role] : null };
  });

  function select(id: string) {
    if (id === activeId) return;
    const name = options.find((o) => o.id === id)?.name;
    switchCompany(id);
    if (name) toast.success(`Você está em ${name}`);
    navigate("/operator", { replace: true });
  }

  return { enabled, count: ids.length, activeId, options, isLoading: companies.isLoading, select };
}
